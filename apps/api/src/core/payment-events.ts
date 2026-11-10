import { config } from "@factory/config/product";
import { paidEventKind, recordServerEvent } from "@factory/core/attribution";
import type { CheckSource, SettleOutcome, StatusCheck } from "@factory/core/billing";
import { emailProvider } from "@factory/core/email";
import { receiptEmail } from "@factory/core/email/templates";
import { paidText, paymentRescuedText } from "@factory/core/notify";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../index";
import { experiment, serverAnalytics } from "./analytics";
import { capiOptions, sendPaymentConversion } from "./marketing";
import { ownerAlert } from "./notify";

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
  // The owner's ping (D-112), only once the provider confirmed: same place as the access grant.
  const tg = config.notifications.telegram;
  if (tg)
    await defer(
      ownerAlert(
        env,
        event,
        paidText({
          event,
          product: config.name,
          plan: config.plans.find((p) => p.id === planId)?.label ?? planId,
          amountIdr,
          provider: outcome.payment.provider,
          paymentId: id,
          email: owner?.email,
          emailMode: tg.email,
          campaign: utmCampaign,
          source: utmSource,
        }),
      ),
    );
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

/**
 * After a status check (D-128): a settled payment goes through afterPaymentSettled exactly like a
 * webhook's, and one the webhook should have announced pings the owner to check the notify URLs
 * (rate-limited in ownerAlert). /admin's own "Cek ulang" needs no ping: the owner is looking.
 */
export async function afterStatusCheck(
  env: Bindings,
  check: StatusCheck,
  source: CheckSource,
  defer: (work: Promise<unknown>) => Promise<void>,
): Promise<void> {
  if (check.kind !== "settled") return;
  await afterPaymentSettled(env, check.outcome, defer);
  if (check.outcome.kind !== "processed" || !check.outcome.entitlement || !check.missedWebhook || source === "admin")
    return;
  const { provider, id } = check.outcome.payment;
  console.warn("payment_rescued", JSON.stringify({ provider, paymentId: id, via: source }));
  await defer(
    ownerAlert(
      env,
      "payment_rescued",
      paymentRescuedText({ product: config.name, provider, paymentId: id, via: source }),
    ),
  );
}

/** Sends a paid payment's receipt again (/admin, D-128). False when it isn't paid or has no access row. */
export async function resendReceipt(env: Bindings, paymentId: string): Promise<boolean> {
  const db = drizzle(env.DB, { schema });
  const row = await db
    .select({
      status: schema.payments.status,
      planId: schema.payments.planId,
      amountIdr: schema.payments.amountIdr,
      email: schema.user.email,
      expiresAt: schema.entitlements.expiresAt,
    })
    .from(schema.payments)
    .innerJoin(schema.user, eq(schema.user.id, schema.payments.userId))
    .innerJoin(schema.entitlements, eq(schema.entitlements.paymentId, schema.payments.id))
    .where(eq(schema.payments.id, paymentId))
    .get();
  const plan = config.plans.find((p) => p.id === row?.planId);
  if (!row || row.status !== "paid" || !plan) return false;
  await emailProvider(env, config.legal.contactEmail).send(
    receiptEmail(row.email, {
      appName: config.name,
      planLabel: plan.label,
      amountIdr: row.amountIdr,
      paymentId,
      expiresAt: row.expiresAt,
    }),
  );
  return true;
}
