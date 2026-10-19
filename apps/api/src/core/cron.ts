import { config } from "@factory/config/product";
import { purgeAnonymousAiUsage } from "@factory/core/ai/usage";
import { purgeFunnelEvents } from "@factory/core/attribution";
import {
  cancelPayment,
  dueReminders,
  expirePendingPayments,
  markReminderSent,
  overduePayments,
} from "@factory/core/billing";
import { purgeAnonymousConsents } from "@factory/core/consents";
import { emailProvider } from "@factory/core/email";
import { reminderEmail } from "@factory/core/email/templates";
import { purgeAnonymousFiles } from "@factory/core/files";
import { purgeCheckoutContexts } from "@factory/core/meta";
import { purgeIpUsage } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { runProductScheduled } from "../features/scheduled";
import type { Bindings } from "../index";
import { serverAnalytics } from "./analytics";
import { captureError } from "./monitoring";
import { afterPaymentSettled } from "./payment-events";
import { configuredProvider } from "./payments";

/**
 * Cron Trigger (wrangler.jsonc triggers.crons): expires stale pending payments and sends
 * renewal reminders (7 days, 1 day, on expiry), and drops funnel events and checkout tracking
 * context past their retention. Never polls Duitku or DOKU: Duitku's status API blocks merchants
 * that poll it. Pakasir (D-092) allows it: overdue payments are checked once and cancelled there
 * first, so a QR or VA can't be paid after we expired it (or one just paid is granted).
 * Then runs the product's own jobs (features/scheduled.ts).
 */
export async function runScheduled(env: Bindings, now = new Date()) {
  const db = drizzle(env.DB, { schema });
  const provider = configuredProvider(env);
  if (provider?.cancel) {
    for (const { id } of await overduePayments(db, provider.name, now)) {
      try {
        const result = await cancelPayment(db, provider, { paymentId: id, plans: config.plans, now });
        if (result.kind === "settled") await afterPaymentSettled(env, result.outcome, (work) => work.then(() => {}));
      } catch (err) {
        console.error("overdue payment cancel failed", err);
        captureError(err);
      }
    }
  }
  const expired = await expirePendingPayments(db, now);
  const purged = await purgeFunnelEvents(db, now);
  await purgeCheckoutContexts(db, now);
  await purgeIpUsage(db, now);
  await purgeAnonymousConsents(db, now);
  await purgeAnonymousAiUsage(db, now);
  if (env.FILES) await purgeAnonymousFiles(db, env.FILES, now);

  const host = env.AUTH_HOSTS.split(",")[0]?.trim() ?? "";
  const scheme = env.APP_ENV === "development" || env.APP_ENV === "test" ? "http" : "https";
  const renewUrl = `${scheme}://${host}/pricing`;

  const analytics = serverAnalytics(env);
  let sent = 0;
  for (const r of await dueReminders(db, now)) {
    // Mark first: if two cron runs overlap, only one wins the unique key and sends.
    if (!(await markReminderSent(db, r, now))) continue;
    await emailProvider(env, config.legal.contactEmail).send(
      reminderEmail(r.email, { appName: config.name, kind: r.kind, expiresAt: r.expiresAt, renewUrl }),
    );
    sent++;
    await analytics.track("renewal_reminder_sent", { kind: r.kind }, r.userId);
    if (r.kind === "expired") await analytics.track("entitlement_expired", {}, r.userId);
  }
  // The product's jobs (features/scheduled.ts, D-046) run last; their failure never undoes core's.
  let product: Record<string, number> = {};
  try {
    product = await runProductScheduled(env, now);
  } catch (err) {
    console.error("product scheduled jobs failed", err);
    captureError(err);
  }
  return { expired, remindersSent: sent, funnelEventsPurged: purged, product };
}
