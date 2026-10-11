import { config } from "@factory/config/product";
import { attributionFor } from "@factory/core/attribution";
import { missingConsents } from "@factory/core/consents";
import type { Db } from "@factory/core/entitlements";
import {
  type CapiOptions,
  capiEvent,
  dropCheckoutContext,
  fbcFromClick,
  paymentEventId,
  sendCapi,
  takeCheckoutContext,
} from "@factory/core/meta";

export type MarketingEnv = {
  APP_ENV: string;
  /** Meta Conversions API access token (Worker secret). With metaPixelId, enables CAPI. */
  META_CAPI_TOKEN?: string;
  /** Events Manager "Test events" code (Worker secret), only while testing. */
  META_TEST_EVENT_CODE?: string;
};

/** CAPI settings, or null: needs the Pixel ID, the token, and production (like OpenPanel). */
export function capiOptions(env: MarketingEnv): CapiOptions | null {
  const pixelId = config.marketing.metaPixelId;
  if (!pixelId || !env.META_CAPI_TOKEN || env.APP_ENV !== "production") return null;
  return { pixelId, accessToken: env.META_CAPI_TOKEN, testEventCode: env.META_TEST_EVENT_CODE || undefined };
}

/** Whether checkout should keep the browser context for CAPI (marketing consent required). */
export const marketingTrackingOn = (env: MarketingEnv) => capiOptions(env) !== null;

export async function hasMarketingConsent(db: Db, userId: string): Promise<boolean> {
  return (await missingConsents(db, userId, ["marketing"])).length === 0;
}

/**
 * Purchase/renewal to Meta after the webhook confirmed the payment. Sent only if the buyer had
 * marketing consent at checkout (the context row exists) AND still has it now. The context row is
 * deleted after a successful send; a failed send leaves it for the 7-day purge.
 */
export async function sendPaymentConversion(
  db: Db,
  opts: CapiOptions,
  input: {
    event: "purchase" | "renewal";
    payment: { id: string; userId: string; amountIdr: number; paidAt: Date | null };
    email: string;
  },
): Promise<boolean> {
  const ctx = await takeCheckoutContext(db, input.payment.id);
  if (!ctx) return false;
  if (!(await hasMarketingConsent(db, input.payment.userId)) || !ctx.userAgent) {
    await dropCheckoutContext(db, input.payment.id);
    return false;
  }
  const attribution = await attributionFor(db, input.payment.userId);
  const fbc =
    ctx.fbc ?? (attribution?.fbclid ? fbcFromClick(attribution.fbclid, attribution.firstSeenAt.getTime()) : null);
  const event = await capiEvent({
    event: input.event,
    eventId: paymentEventId(input.payment.id),
    eventTime: input.payment.paidAt ?? new Date(),
    eventSourceUrl: ctx.sourceUrl,
    email: input.email,
    userId: input.payment.userId,
    valueIdr: input.payment.amountIdr,
    fbp: ctx.fbp,
    fbc,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
  });
  const ok = await sendCapi(opts, [event]);
  if (ok) await dropCheckoutContext(db, input.payment.id);
  return ok;
}
