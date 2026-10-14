import { config } from "@factory/config/product";
import { purgeAnonymousAiUsage } from "@factory/core/ai/usage";
import { purgeFunnelEvents } from "@factory/core/attribution";
import { dueReminders, expirePendingPayments, markReminderSent } from "@factory/core/billing";
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

/**
 * Cron Trigger (wrangler.jsonc triggers.crons): expires stale pending payments and sends
 * renewal reminders (7 days, 1 day, on expiry), and drops funnel events and checkout tracking context past their retention. Never calls the payment provider: Duitku's
 * status API blocks merchants that poll it. Then runs the product's own jobs (features/scheduled.ts).
 */
export async function runScheduled(env: Bindings, now = new Date()) {
  const db = drizzle(env.DB, { schema });
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
