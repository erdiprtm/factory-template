import { config } from "@factory/config/product";
import {
  fetchCustomer,
  handleRevenueCatEvent,
  REVENUECAT,
  type RevenueCatEvent,
} from "@factory/core/billing/revenuecat";
import { markRefunded } from "@factory/core/economics";
import { refundText, webhookRejectedText } from "@factory/core/notify";
import { sameSecret } from "@factory/core/notify/commands";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as z from "zod";
import type { Bindings } from "../index";
import { experiment, serverAnalytics } from "./analytics";
import { ownerAlert } from "./notify";
import { afterPaymentSettled } from "./payment-events";

export type StoreEnv = {
  /** The Authorization header value set in RevenueCat's webhook settings (D-120). Unset = route off. */
  REVENUECAT_WEBHOOK_AUTH?: string;
  /** RevenueCat secret API key (v1), to confirm each purchase before granting (D-120). */
  REVENUECAT_API_KEY?: string;
};

const body = z.object({
  event: z.object({
    id: z.string().min(1).max(200),
    type: z.string().max(60),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).max(50).nullish(),
    product_id: z.string().nullish(),
    store: z.string().nullish(),
    environment: z.enum(["SANDBOX", "PRODUCTION"]).nullish(),
    transaction_id: z.string().nullish(),
    purchased_at_ms: z.number().nullish(),
    price_in_purchased_currency: z.number().nullish(),
    currency: z.string().nullish(),
    cancel_reason: z.string().nullish(),
  }),
});

/**
 * RevenueCat's webhook (D-120). Off (404) until both secrets exist. A wrong Authorization header
 * is 401 and pings the owner (throttled, as for payment webhooks). Granting asks RevenueCat's API
 * first; a failed lookup answers 503 so RevenueCat retries (up to 5 times over ~80 minutes).
 */
export async function revenueCatWebhook(
  env: Bindings,
  request: Request,
  defer: (work: Promise<unknown>) => Promise<void>,
): Promise<Response> {
  const auth = env.REVENUECAT_WEBHOOK_AUTH?.trim();
  const apiKey = env.REVENUECAT_API_KEY?.trim();
  if (!auth || !apiKey) return Response.json({ error: "not_found" }, { status: 404 });
  if (!sameSecret(request.headers.get("authorization"), auth)) {
    await defer(
      ownerAlert(env, "webhook_rejected", webhookRejectedText({ product: config.name, provider: REVENUECAT })),
    );
    return Response.json({ error: "invalid_auth" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const event: RevenueCatEvent = parsed.data.event;
  const db = drizzle(env.DB, { schema });
  const outcome = await handleRevenueCatEvent(db, event, {
    plans: config.plans,
    products: config.native.iap,
    userExists: async (id) =>
      !!(await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, id)).get()),
    customer: (id) => fetchCustomer(apiKey, id),
  });
  if (outcome.kind === "retry") return Response.json({ error: "not_confirmed_yet" }, { status: 503 });
  if (outcome.kind === "granted") await afterPaymentSettled(env, outcome.outcome, defer);
  if (outcome.kind === "refund") {
    const r = await markRefunded(db, outcome.paymentId, new Date(), { experiment });
    if (r.kind === "refunded") {
      const { userId, planId, amountIdr } = r.payment;
      await defer(serverAnalytics(env).track("refund", { plan: planId, amount_idr: amountIdr, ...r.tag }, userId));
      const plan = config.plans.find((p) => p.id === planId)?.label ?? planId;
      await defer(
        ownerAlert(env, "refund", refundText({ product: config.name, plan, amountIdr, paymentId: r.payment.id })),
      );
    }
  }
  return Response.json({ ok: true });
}
