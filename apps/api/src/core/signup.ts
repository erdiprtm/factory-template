import { config } from "@factory/config/product";
import { recordSignupCompleted, signupEventId } from "@factory/core/attribution";
import { missingConsents, requiredConsents } from "@factory/core/consents";
import type { Db } from "@factory/core/entitlements";
import { capiEvent, cleanFbId, fbcFromClick, readFbCookies, sendCapi } from "@factory/core/meta";
import { type AnalyticsEnv, experiment, serverAnalytics } from "./analytics";
import { capiOptions, hasMarketingConsent, type MarketingEnv } from "./marketing";

/**
 * Accounts created before D-122 got signup_completed from the browser's /consent screen, so only
 * newer accounts are counted here: the first deploy doesn't report old users as new signups.
 */
export const SIGNUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * signup_completed (Meta CompleteRegistration), from the server, once per account (D-122): when the
 * account first has every required consent, given on /consent or before signup on this device
 * (D-043, moved over at /me). Recorded first-party, sent to OpenPanel, and to Meta's CAPI with
 * marketing consent. Returns the event id, so the browser's Pixel sends the same one and Meta
 * counts it once; null when nothing was recorded now.
 */
export async function completeSignup(
  env: AnalyticsEnv & MarketingEnv,
  db: Db,
  user: { id: string; email: string; createdAt: Date | string },
  request: Request,
  background: (work: Promise<unknown>) => Promise<void>,
  now = new Date(),
): Promise<string | null> {
  if (now.getTime() - new Date(user.createdAt).getTime() > SIGNUP_WINDOW_MS) return null;
  if ((await missingConsents(db, user.id, requiredConsents(config.legal))).length > 0) return null;
  const { recorded, tag, attribution } = await recordSignupCompleted(db, { userId: user.id, experiment }, now);
  if (!recorded) return null;
  const eventId = signupEventId(user.id);
  await background(serverAnalytics(env).track("signup_completed", { ...tag }, user.id));
  const capi = capiOptions(env);
  const userAgent = request.headers.get("user-agent");
  if (capi && userAgent && (await hasMarketingConsent(db, user.id))) {
    const cookies = readFbCookies(request.headers.get("cookie") ?? "");
    const fbc =
      cleanFbId(cookies.fbc) ??
      (attribution?.fbclid ? fbcFromClick(attribution.fbclid, attribution.firstSeenAt.getTime()) : null);
    const event = await capiEvent({
      event: "signup_completed",
      eventId,
      eventTime: now,
      eventSourceUrl: new URL("/", request.url).toString(),
      email: user.email,
      userId: user.id,
      fbp: cleanFbId(cookies.fbp),
      fbc,
      clientIp: request.headers.get("cf-connecting-ip"),
      userAgent,
    });
    await background(sendCapi(capi, [event]));
  }
  return eventId;
}
