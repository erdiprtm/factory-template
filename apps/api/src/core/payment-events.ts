import { config } from "@factory/config/product";
import { paidEventKind, recordServerEvent } from "@factory/core/attribution";
import type { SettleOutcome } from "@factory/core/billing";
import { emailProvider } from "@factory/core/email";
import { receiptEmail } from "@factory/core/email/templates";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../index";
import { experiment, serverAnalytics } from "./analytics";
import { capiOptions, sendPaymentConversion } from "./marketing";

/**
 * What happens once the provider confirmed a payment (D-017, D-030, D-034): the server-side
 * purchase/renewal event, analytics, Meta CAPI (marketing consent only) and the receipt, or
 * payment_failed. Called by every path that settles a payment (the webhook, the Pakasir status
 * poll, its cancel and the cron, D-092). Purchases fire only for the one caller whose settle
 * moved the payment to paid (`entitlement` set), so a webhook + poll race sends them once.
 * `defer` runs work that must not delay the response (waitUntil); the cron just awaits it.
 */
export async function afterPaymentSettled(
  env: Bindings,
  outcome: SettleOutcome | null | undefined,
  defer: (work: Promise<unknown>) => Promise<void>,
): Promise<void> {
  if (outcome?.kind !== "processed") return;
  const db = drizzle(env.DB, { schema });
  // Source of truth for payment analytics: the browser may be gone by the time this lands.
  const { id, userId, planId, amountIdr, status, utmCampaign, utmSource, paidAt } = outcome.payment;
  if (!outcome.entitlement) {
    if (status !== "paid") await defer(serverAnalytics(env).track("payment_failed", { plan: planId, status }, userId));
    return;
  }
  const event = await paidEventKind(db, { id, userId, paidAt });
  const tag = await recordServerEvent(db, { event, userId, valueIdr: amountIdr, utmCampaign, utmSource, experiment });
  const props = { plan: planId, amount_idr: amountIdr, utm_campaign: utmCampaign, ...tag };
  await defer(serverAnalytics(env).track(event, props, userId));
  const owner = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).get();
  // Meta CAPI (D-034): only after the provider confirmed, only with marketing consent.
  const capi = capiOptions(env);
  if (capi && owner)
    await defer(sendPaymentConversion(db, capi, { event, payment: outcome.payment, email: owner.email }));

  const plan = config.plans.find((p) => p.id === planId);
  if (owner && plan) {
    const receipt = receiptEmail(owner.email, {
      appName: config.name,
      planLabel: plan.label,
      amountIdr,
      paymentId: id,
      expiresAt: outcome.entitlement.expiresAt,
    });
    // A receipt failure must not make the provider retry an already-granted payment.
    await emailProvider(env, config.legal.contactEmail)
      .send(receipt)
      .catch((err: unknown) => console.error("receipt email failed", err instanceof Error ? err.message : err));
  }
}
