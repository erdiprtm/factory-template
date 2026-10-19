import { env as workerEnv } from "cloudflare:workers";
import { PAKASIR_METHOD_CODES } from "@factory/config";
import {
  cancelPayment,
  confirmPayment,
  FakePakasirApi,
  handleWebhook,
  PAKASIR_METHODS,
  PakasirProvider,
  startCheckout,
  throttledStatus,
} from "@factory/core/billing";
import { hasAccess } from "@factory/core/entitlements";
import { entitlements, paymentCharges, payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

// These tests run on Pakasir, whatever the suite default (vitest.config.ts PAYMENTS_PROVIDER, D-093).
const env = { ...workerEnv, PAYMENTS_PROVIDER: "pakasir" };

// Pakasir through the shared billing service (D-092), against real local D1 and the in-memory
// Pakasir API: the same entitlement path as Duitku, idempotent across webhook + poll, throttled.
// Config-agnostic: builds its own provider, whatever this product's payments.provider is.
const db = drizzle(env.DB, { schema });
const plans = [{ id: "6m", label: "6 bulan", months: 6, priceIdr: 99_000 }];
const NOW = new Date("2026-10-19T03:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

let api: FakePakasirApi;
let provider: PakasirProvider;
let user: { id: string; name: string; email: string };
const providerFor = (mode: "sandbox" | "live") =>
  new PakasirProvider({
    slug: api.slug,
    apiKey: api.apiKey,
    webhookSecret: api.webhookSecret,
    mode,
    fetchImpl: api.fetch,
  });

beforeEach(() => {
  api = new FakePakasirApi();
  provider = providerFor("sandbox");
  const id = `user-${crypto.randomUUID()}`;
  user = { id, name: "Sari", email: `${id}@example.com` };
});

const checkout = (method = "qris", p: PakasirProvider = provider) =>
  startCheckout(db, p, {
    user,
    plan: plans[0] as (typeof plans)[number],
    methods: ["qris", "bri_va"],
    method,
    origin: "https://app.example",
    now: NOW,
  });
const statusCalls = () => api.calls.filter((c) => c.path.startsWith("/transaction-status/")).length;
const grants = async (paymentId: string) =>
  (await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId))).length;

it("config's Pakasir method codes are core's", () => {
  expect([...PAKASIR_METHOD_CODES].sort()).toEqual(PAKASIR_METHODS.map((m) => m.code).sort());
});

describe("checkout", () => {
  it("stores the charge (QR, fee, total, sandbox) and expires no later than Pakasir", async () => {
    const { paymentId, redirectUrl } = await checkout();
    expect(redirectUrl).toBe(`https://app.example/billing/pay?paymentId=${paymentId}`);
    const row = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    const charge = await db.select().from(paymentCharges).where(eq(paymentCharges.paymentId, paymentId)).get();
    expect(row).toMatchObject({
      provider: "pakasir",
      status: "pending",
      amountIdr: 99_000,
      providerRef: api.txnFor(paymentId)?.txn_id,
    });
    expect(charge).toMatchObject({ method: "qris", isSandbox: true, vaNumber: null, statusCheckedAt: null });
    expect(charge?.totalIdr).toBe(99_000 + (charge?.feeIdr ?? 0));
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(charge?.providerExpiresAt.getTime() ?? 0);
    expect(row?.expiresAt.getTime()).toBe(at(60 * 60_000).getTime());
  });

  it("marks the payment failed when Pakasir refuses", async () => {
    await expect(checkout("bni_va")).rejects.toThrow();
    const [row] = await db.select().from(payments).where(eq(payments.userId, user.id));
    expect(row?.status).toBe("failed");
  });
});

describe("webhook", () => {
  it("wrong or missing X-Secret is unauthorized and grants nothing", async () => {
    const { paymentId } = await checkout();
    api.complete(paymentId);
    expect(await handleWebhook(db, provider, api.webhook(paymentId, { secret: null }), plans, NOW)).toEqual({
      kind: "unauthorized",
    });
    expect(await handleWebhook(db, provider, api.webhook(paymentId, { secret: "guess" }), plans, NOW)).toEqual({
      kind: "unauthorized",
    });
    expect(await grants(paymentId)).toBe(0);
  });

  it("a forged 'completed' body for a pending order never grants: the status API says pending", async () => {
    const { paymentId } = await checkout();
    const forged = api.webhook(paymentId, {
      body: {
        order_id: paymentId,
        txn_id: api.txnFor(paymentId)?.txn_id,
        amount: 99_000,
        status: "completed",
        is_sandbox: false,
      },
    });
    expect((await handleWebhook(db, provider, forged, plans, NOW)).kind).toBe("retry");
    expect(await grants(paymentId)).toBe(0);
    expect(await hasAccess(db, user.id, NOW)).toBe(false);
  });

  it("confirmed: access exactly once across the webhook, a retried webhook and the poll", async () => {
    const { paymentId } = await checkout();
    api.complete(paymentId);
    const first = await handleWebhook(db, provider, api.webhook(paymentId), plans, NOW);
    expect(first.kind === "processed" && first.entitlement).toBeTruthy();
    expect(await hasAccess(db, user.id, at(1000))).toBe(true);
    expect((await handleWebhook(db, provider, api.webhook(paymentId), plans, at(5000))).kind).toBe("duplicate");
    expect(await confirmPayment(db, provider, { userId: user.id, paymentId, plans, now: at(10_000) })).toBeNull();
    expect(await grants(paymentId)).toBe(1);
  });

  it("an unknown order is acknowledged and ignored", async () => {
    const out = await handleWebhook(db, provider, api.webhook("pay_ffffffffffffffffffffffffffffffff"), plans, NOW);
    expect(out).toEqual({ kind: "ignored", reason: "unknown payment" });
  });

  it("live mode: a sandbox transaction never grants (marked failed)", async () => {
    api.sandbox = false;
    const live = providerFor("live");
    const { paymentId } = await checkout("qris", live);
    const txn = api.complete(paymentId);
    if (txn) txn.is_sandbox = true;
    const out = await handleWebhook(db, live, api.webhook(paymentId), plans, NOW);
    expect(out.kind === "processed" && out.entitlement).toBeNull();
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("failed");
    expect(await grants(paymentId)).toBe(0);
  });
});

describe("status poll", () => {
  it("grants on 'completed', once; a later webhook finds it paid", async () => {
    const { paymentId } = await checkout();
    expect(await confirmPayment(db, provider, { userId: user.id, paymentId, plans, now: NOW })).toBeNull();
    api.complete(paymentId);
    const polled = await confirmPayment(db, provider, { userId: user.id, paymentId, plans, now: at(4000) });
    expect(polled?.kind === "processed" && polled.entitlement).toBeTruthy();
    const hook = await handleWebhook(db, provider, api.webhook(paymentId), plans, at(9000));
    expect(hook).toEqual({ kind: "ignored", reason: "already paid" });
    expect(await grants(paymentId)).toBe(1);
  });

  it("a webhook and a poll racing grant once, and only one of them gets the entitlement", async () => {
    const { paymentId } = await checkout();
    api.complete(paymentId);
    const [hook, poll] = await Promise.all([
      handleWebhook(db, provider, api.webhook(paymentId), plans, NOW),
      confirmPayment(db, provider, { userId: user.id, paymentId, plans, now: NOW }),
    ]);
    const winners = [hook, poll].filter((o) => o?.kind === "processed" && o.entitlement);
    expect(winners).toHaveLength(1);
    expect(await grants(paymentId)).toBe(1);
  });

  it("asks Pakasir at most once per 4 s per transaction", async () => {
    const { paymentId } = await checkout();
    const poll = (ms: number) => confirmPayment(db, provider, { userId: user.id, paymentId, plans, now: at(ms) });
    await poll(0);
    await poll(1000);
    await poll(3999);
    expect(statusCalls()).toBe(1);
    await poll(4000);
    expect(statusCalls()).toBe(2);
    await Promise.all([poll(9000), poll(9000), poll(9000)]);
    expect(statusCalls()).toBe(3);
  });

  it("the webhook waits for the next slot instead of exceeding the limit", async () => {
    const { paymentId } = await checkout();
    const payment = (await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .get()) as typeof payments.$inferSelect;
    expect(await throttledStatus(db, provider, payment, NOW)).toBe("pending");
    expect(await throttledStatus(db, provider, payment, at(3990))).toBeNull();
    expect(await throttledStatus(db, provider, payment, at(3990), { wait: true })).toBe("pending");
    expect(statusCalls()).toBe(2);
  });

  it("only the owner's payment is checked", async () => {
    const { paymentId } = await checkout();
    api.complete(paymentId);
    expect(await confirmPayment(db, provider, { userId: "someone-else", paymentId, plans, now: NOW })).toBeNull();
    expect(statusCalls()).toBe(0);
  });
});

describe("cancel", () => {
  it("cancels at Pakasir and expires the payment", async () => {
    const { paymentId } = await checkout();
    expect(await cancelPayment(db, provider, { userId: user.id, paymentId, plans, now: NOW })).toEqual({
      kind: "cancelled",
    });
    expect(api.txnFor(paymentId)?.status).toBe("canceled");
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("expired");
  });

  it("a payment that was just completed is granted instead of cancelled", async () => {
    const { paymentId } = await checkout();
    api.complete(paymentId);
    const out = await cancelPayment(db, provider, { userId: user.id, paymentId, plans, now: NOW });
    expect(out.kind).toBe("settled");
    expect(api.txnFor(paymentId)?.status).toBe("completed");
    expect(await grants(paymentId)).toBe(1);
  });

  it("a payment completed after we expired it is still granted by its webhook", async () => {
    const { paymentId } = await checkout();
    await db.update(payments).set({ status: "expired" }).where(eq(payments.id, paymentId));
    api.complete(paymentId);
    const out = await handleWebhook(db, provider, api.webhook(paymentId), plans, NOW);
    expect(out.kind === "processed" && out.entitlement).toBeTruthy();
  });
});
