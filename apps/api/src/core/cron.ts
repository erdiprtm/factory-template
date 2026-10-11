import { config } from "@factory/config/product";
import { dueReminders, expirePendingPayments, markReminderSent } from "@factory/core/billing";
import { emailProvider } from "@factory/core/email";
import { reminderEmail } from "@factory/core/email/templates";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../index";
import { serverAnalytics } from "./analytics";

/**
 * Cron Trigger (wrangler.jsonc triggers.crons): expires stale pending payments and sends
 * renewal reminders (7 days, 1 day, on expiry). Never calls the payment provider: Duitku's
 * status API blocks merchants that poll it.
 */
export async function runScheduled(env: Bindings, now = new Date()) {
  const db = drizzle(env.DB, { schema });
  const expired = await expirePendingPayments(db, now);

  const host = env.AUTH_HOSTS.split(",")[0]?.trim() ?? "";
  const scheme = env.APP_ENV === "development" || env.APP_ENV === "test" ? "http" : "https";
  const renewUrl = `${scheme}://${host}/pricing`;

  const analytics = serverAnalytics(env);
  let sent = 0;
  for (const r of await dueReminders(db, now)) {
    // Mark first: if two cron runs overlap, only one wins the unique key and sends.
    if (!(await markReminderSent(db, r, now))) continue;
    await emailProvider(env).send(
      reminderEmail(r.email, { appName: config.name, kind: r.kind, expiresAt: r.expiresAt, renewUrl }),
    );
    sent++;
    await analytics.track("renewal_reminder_sent", { kind: r.kind }, r.userId);
    if (r.kind === "expired") await analytics.track("entitlement_expired", {}, r.userId);
  }
  return { expired, remindersSent: sent };
}
