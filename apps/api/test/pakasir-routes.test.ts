import { env } from "cloudflare:workers";
import { entitlements, payments, schema, webhookEvents } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

// The billing routes with payments.provider "pakasir" (D-092), whatever this product's config
// says (mocked, D-078), against the real PakasirProvider and the in-memory Pakasir API.
// resetModules + doMock: a hoisted vi.mock didn't reach the API's own imports in the workers pool.
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return { ...real, config: { ...real.config, payments: { provider: "pakasir", methods: ["qris", "bri_va"] } } };
});

const { capturedEmails } = await import("@factory/core/email");
const { app } = await import("../src/index");
const { fakePakasirServer } = await import("../src/core/payments");
const { runScheduled } = await import("../src/core/cron");
const { firstPlan, get, PAID, post, signInWithConsent } = await import("./helpers");

const db = drizzle(env.DB, { schema });
const api = fakePakasirServer();
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const hook = (req: Request) => app.request(req, undefined, env);
const mails = (to: string) => capturedEmails().sent.filter((m) => m.to === to).length;

async function buy(tag: string, method = "qris") {
  const email = uniqueEmail(tag);
  const cookie = await signInWithConsent(email);
  const res = await post("/api/billing/checkout", cookie, { planId: firstPlan.id, method });
  expect(res.status).toBe(200);
  const { paymentId, redirectUrl } = (await res.json()) as { paymentId: string; redirectUrl: string };
  return { email, cookie, paymentId, redirectUrl };
}
const grants = async (paymentId: string) =>
  (await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId))).length;

describe("checkout", () => {
  it("needs one configured method; the amount comes from the plan", async () => {
    const cookie = await signInWithConsent(uniqueEmail("pk-method"));
    expect((await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).status).toBe(400);
    expect((await post("/api/billing/checkout", cookie, { planId: firstPlan.id, method: "bni_va" })).status).toBe(400);
    const { paymentId, redirectUrl, cookie: own } = await buy("pk-ok");
    expect(redirectUrl).toBe(`http://localhost/billing/pay?paymentId=${paymentId}`);
    expect(api.txnFor(paymentId)?.amount).toBe(firstPlan.priceIdr);
    const charge = (await (await get(`/api/billing/charge?paymentId=${paymentId}`, own)).json()) as Record<
      string,
      unknown
    >;
    expect(charge).toMatchObject({ status: "pending", method: "qris", amountIdr: firstPlan.priceIdr, isSandbox: true });
    expect(charge.qrString).toMatch(/^000201/);
    expect((await get(`/api/billing/charge?paymentId=${paymentId}`, cookie)).status).toBe(404);
  });
});

describe("POST /api/webhooks/pakasir", () => {
  it("401 for a missing or wrong X-Secret", async () => {
    const { paymentId } = await buy("pk-secret");
    api.complete(paymentId);
    expect(
      (await hook(api.webhook(paymentId, { secret: null, url: "http://localhost/api/webhooks/pakasir" }))).status,
    ).toBe(401);
    expect(
      (await hook(api.webhook(paymentId, { secret: "nope", url: "http://localhost/api/webhooks/pakasir" }))).status,
    ).toBe(401);
    expect(await grants(paymentId)).toBe(0);
  });

  it("a forged body for a pending order: 503 (not confirmed), no access", async () => {
    const { paymentId, cookie } = await buy("pk-forged");
    const res = await hook(api.webhook(paymentId, { url: "http://localhost/api/webhooks/pakasir" }));
    expect(res.status).toBe(503);
    expect((await get(PAID, cookie)).status).toBe(402);
  });

  it("an unknown order is acknowledged with 200 and ignored", async () => {
    const res = await hook(
      api.webhook("pay_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", { url: "http://localhost/api/webhooks/pakasir" }),
    );
    expect(res.status).toBe(200);
  });

  it("confirmed: access, one receipt, and a retry changes nothing", async () => {
    const { paymentId, cookie, email } = await buy("pk-paid");
    api.complete(paymentId);
    const url = "http://localhost/api/webhooks/pakasir";
    expect((await hook(api.webhook(paymentId, { url }))).status).toBe(200);
    expect((await get(PAID, cookie)).status).toBe(200);
    expect((await hook(api.webhook(paymentId, { url }))).status).toBe(200);
    expect(await grants(paymentId)).toBe(1);
    expect(mails(email) - 1).toBe(1); // the sign-in link, then one receipt
    const status = (await (await get(`/api/billing/status?paymentId=${paymentId}`, cookie)).json()) as {
      status: string;
      event: string;
    };
    expect(status).toMatchObject({ status: "paid", event: "purchase" });
  });
});

describe("status poll and cancel", () => {
  it("the poll grants once; the webhook afterwards finds it paid and sends no second receipt", async () => {
    const { paymentId, cookie, email } = await buy("pk-poll");
    const status = async () =>
      ((await (await get(`/api/billing/status?paymentId=${paymentId}`, cookie)).json()) as { status: string }).status;
    expect(await status()).toBe("pending");
    api.complete(paymentId);
    // Within 4 s of the last check the server doesn't ask Pakasir again.
    expect(await status()).toBe("pending");
    await db
      .update(schema.paymentCharges)
      .set({ statusCheckedAt: new Date(Date.now() - 5000) })
      .where(eq(schema.paymentCharges.paymentId, paymentId));
    expect(await status()).toBe("paid");
    expect((await get(PAID, cookie)).status).toBe(200);
    expect((await hook(api.webhook(paymentId, { url: "http://localhost/api/webhooks/pakasir" }))).status).toBe(200);
    expect(await grants(paymentId)).toBe(1);
    expect(mails(email) - 1).toBe(1);
    const events = await db.select().from(webhookEvents).where(eq(webhookEvents.provider, "pakasir"));
    expect(events.some((e) => e.eventKey.startsWith(paymentId) && e.status === "already_paid")).toBe(true);
  });

  it("cancel (another method / countdown over) expires it at Pakasir and here; owner only", async () => {
    const { paymentId, cookie } = await buy("pk-cancel", "bri_va");
    const other = await signInWithConsent(uniqueEmail("pk-other"));
    expect((await post("/api/billing/cancel", other, { paymentId })).status).toBe(404);
    const res = await post("/api/billing/cancel", cookie, { paymentId });
    expect(await res.json()).toEqual({ status: "expired" });
    expect(api.txnFor(paymentId)?.status).toBe("canceled");
  });

  it("the cron cancels overdue Pakasir payments there before expiring them", async () => {
    const { paymentId } = await buy("pk-cron");
    await db
      .update(payments)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(payments.id, paymentId));
    await runScheduled(env);
    expect(api.txnFor(paymentId)?.status).toBe("canceled");
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("expired");
  });
});
