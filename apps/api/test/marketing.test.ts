import { env } from "cloudflare:workers";
import { saveCheckoutContext } from "@factory/core/meta";
import { payments, paymentTracking, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { sendPaymentConversion } from "../src/core/marketing";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { firstPlan, get, post, signInWithConsent } from "./helpers";

// Sell engine, Module 2 (D-034): marketing consent and the Meta Conversions API.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const me = async (cookie: string) => (await get("/api/me", cookie)).json<{ marketingConsent: boolean }>();

async function pay(cookie: string) {
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
    paymentId: string;
  }>();
  return paymentId;
}
async function confirm(paymentId: string) {
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
  return (await db.select().from(payments).where(eq(payments.id, paymentId)).get()) as typeof payments.$inferSelect;
}
const context = (paymentId: string) =>
  saveCheckoutContext(db, paymentId, {
    fbp: "fb.1.1596403881668.1116446470",
    clientIp: "203.0.113.5",
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
    sourceUrl: "http://localhost/pricing",
  });

function fakeMeta() {
  const bodies: { data: Record<string, unknown>[] }[] = [];
  return {
    bodies,
    opts: {
      pixelId: "1234567890",
      accessToken: "test-token",
      fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(init?.body as string));
        return new Response("{}", { status: 200 });
      },
    },
  };
}

describe("marketing consent", () => {
  it("is off by default, can be granted and withdrawn, and is recorded in consents", async () => {
    const cookie = await signInWithConsent(uniqueEmail("mc"));
    expect((await me(cookie)).marketingConsent).toBe(false);
    expect((await post("/api/consents/marketing", cookie, { granted: true })).status).toBe(200);
    expect((await me(cookie)).marketingConsent).toBe(true);
    await post("/api/consents/marketing", cookie, { granted: false });
    expect((await me(cookie)).marketingConsent).toBe(false);
    expect((await post("/api/consents/marketing", null, { granted: true })).status).toBe(401);
    expect((await post("/api/consents/marketing", cookie, { granted: "yes" })).status).toBe(400);
  });
});

describe("billing status tells the Pixel which event to send", () => {
  it("purchase for the first payment, renewal after", async () => {
    const cookie = await signInWithConsent(uniqueEmail("status"));
    const first = await pay(cookie);
    expect((await (await get(`/api/billing/status?paymentId=${first}`, cookie)).json()) as object).toMatchObject({
      status: "pending",
      event: null,
    });
    await confirm(first);
    const second = await pay(cookie);
    await confirm(second);
    const event = async (id: string) =>
      ((await (await get(`/api/billing/status?paymentId=${id}`, cookie)).json()) as { event: string }).event;
    expect([await event(first), await event(second)]).toEqual(["purchase", "renewal"]);
  });
});

describe("Conversions API", () => {
  it("sends the confirmed purchase with consent, deduplicated by the payment id, then drops the context", async () => {
    const email = uniqueEmail("capi");
    const cookie = await signInWithConsent(email);
    await post("/api/consents/marketing", cookie, { granted: true });
    const paymentId = await pay(cookie);
    await context(paymentId);
    const payment = await confirm(paymentId);
    const meta = fakeMeta();
    expect(await sendPaymentConversion(db, meta.opts, { event: "purchase", payment, email })).toBe(true);
    const sent = meta.bodies[0]?.data[0] as Record<string, unknown> & { user_data: Record<string, unknown> };
    expect(sent).toMatchObject({
      event_name: "Purchase",
      event_id: paymentId,
      action_source: "website",
      custom_data: { value: firstPlan.priceIdr, currency: "IDR" },
    });
    expect(sent.user_data).toMatchObject({
      fbp: "fb.1.1596403881668.1116446470",
      client_ip_address: "203.0.113.5",
      client_user_agent: "Mozilla/5.0 (Linux; Android 14)",
    });
    expect(JSON.stringify(sent)).not.toContain(email);
    expect(await db.select().from(paymentTracking).where(eq(paymentTracking.paymentId, paymentId))).toEqual([]);
  });

  it("sends nothing after consent is withdrawn, and forgets the context", async () => {
    const email = uniqueEmail("capi-revoked");
    const cookie = await signInWithConsent(email);
    await post("/api/consents/marketing", cookie, { granted: true });
    const paymentId = await pay(cookie);
    await context(paymentId);
    await post("/api/consents/marketing", cookie, { granted: false });
    const payment = await confirm(paymentId);
    const meta = fakeMeta();
    expect(await sendPaymentConversion(db, meta.opts, { event: "purchase", payment, email })).toBe(false);
    expect(meta.bodies).toEqual([]);
    expect(await db.select().from(paymentTracking).where(eq(paymentTracking.paymentId, paymentId))).toEqual([]);
  });

  it("checkout keeps no browser context when CAPI isn't configured (template: no Pixel ID)", async () => {
    const cookie = await signInWithConsent(uniqueEmail("capi-off"));
    await post("/api/consents/marketing", cookie, { granted: true });
    const paymentId = await pay(cookie);
    expect(await db.select().from(paymentTracking).where(eq(paymentTracking.paymentId, paymentId))).toEqual([]);
  });

  it("account deletion removes the context", async () => {
    const cookie = await signInWithConsent(uniqueEmail("capi-delete"));
    const paymentId = await pay(cookie);
    await context(paymentId);
    await post("/api/account/delete", cookie, { confirm: "HAPUS" });
    expect(await db.select().from(paymentTracking).where(eq(paymentTracking.paymentId, paymentId))).toEqual([]);
  });
});
