import { env } from "cloudflare:workers";
import { capturedEmails } from "@factory/core/email";
import { entitlements, payments, remindersSent, schema, user } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { runScheduled } from "../src/core/cron";
import { configuredProvider, fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { firstPlan, get, lastPlan, PAID, post, signIn, signInWithConsent } from "./helpers";

// Billing endpoints end to end with the FakeProvider (APP_ENV=test), against real local D1.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;

describe("requireAccess (paid route)", () => {
  it("401 signed out, 402 without entitlement, 200 during trial", async () => {
    expect((await get(PAID, null)).status).toBe(401);
    const cookie = await signInWithConsent(uniqueEmail("gate"));
    expect((await get(PAID, cookie)).status).toBe(402);
    expect((await post("/api/billing/trial", cookie, {})).status).toBe(200);
    expect((await get(PAID, cookie)).status).toBe(200);
  });
});

describe("trial endpoint", () => {
  it("grants the trial once", async () => {
    const cookie = await signInWithConsent(uniqueEmail("trial"));
    expect((await post("/api/billing/trial", cookie, {})).status).toBe(200);
    const again = await post("/api/billing/trial", cookie, {});
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "trial_used" });
  });
});

describe("checkout → webhook → access", () => {
  it("requires consent before checkout", async () => {
    const cookie = await signIn(uniqueEmail("noconsent"));
    expect((await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).status).toBe(403);
  });

  it("answers 503 to an unconfirmed 'paid' webhook so the provider retries", async () => {
    const cookie = await signInWithConsent(uniqueEmail("lag"));
    const { paymentId } = (await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json()) as {
      paymentId: string;
    };
    const res = await app.request(fakeProvider().webhook(paymentId, "paid"), undefined, env);
    expect(res.status).toBe(503);
    expect((await get(PAID, cookie)).status).toBe(402);
  });

  it("rejects unknown plans", async () => {
    const cookie = await signInWithConsent(uniqueEmail("plan"));
    expect((await post("/api/billing/checkout", cookie, { planId: "lifetime" })).status).toBe(400);
  });

  it("pays, grants access, emails a receipt, and survives webhook replay", async () => {
    const email = uniqueEmail("buyer");
    const cookie = await signInWithConsent(email);
    const res = await post("/api/billing/checkout", cookie, { planId: lastPlan.id });
    expect(res.status).toBe(200);
    const { paymentId, redirectUrl } = await res.json<{ paymentId: string; redirectUrl: string }>();
    expect(redirectUrl).toContain(paymentId);
    expect(await (await get(`/api/billing/status?paymentId=${paymentId}`, cookie)).json()).toMatchObject({
      status: "pending",
    });

    // Bad signature → 401
    const forged = fakeProvider().webhook(paymentId, "paid", "evt-x", "wrong");
    expect((await app.request(forged.url, forged, env)).status).toBe(401);

    // Provider confirms + signed webhook → paid
    const hook = () => fakeProvider().pay(paymentId, `evt-${paymentId}`);
    const first = hook();
    expect((await app.request(first.url, first, env)).status).toBe(200);
    const replay = hook();
    expect((await app.request(replay.url, replay, env)).status).toBe(200);

    expect(await (await get(`/api/billing/status?paymentId=${paymentId}`, cookie)).json()).toMatchObject({
      status: "paid",
      amountIdr: lastPlan.priceIdr,
    });
    expect(await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId))).toHaveLength(1);
    expect((await get(PAID, cookie)).status).toBe(200);
    expect(capturedEmails().last(email)?.subject).toMatch(/Pembayaran .* berhasil/);

    const history = await (await get("/api/billing/history", cookie)).json<{ payments: { id: string }[] }>();
    expect(history.payments.map((p) => p.id)).toContain(paymentId);
  });

  it("hides other users' payments", async () => {
    const owner = await signInWithConsent(uniqueEmail("owner"));
    const { paymentId } = await (await post("/api/billing/checkout", owner, { planId: firstPlan.id })).json<{
      paymentId: string;
    }>();
    const stranger = await signInWithConsent(uniqueEmail("stranger"));
    expect((await get(`/api/billing/status?paymentId=${paymentId}`, stranger)).status).toBe(404);
  });
});

describe("cron", () => {
  it("expires stale pending payments and sends each reminder once", async () => {
    const email = uniqueEmail("remind");
    const cookie = await signInWithConsent(email);
    const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
      paymentId: string;
    }>();
    await post("/api/billing/trial", cookie, {});
    const u = await db.select().from(user).where(eq(user.email, email)).get();
    const trial = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, u?.id ?? ""))
      .get();
    expect(trial).toBeTruthy();

    // 6.5 days before the trial ends: the d7 reminder is due; the pending payment has expired.
    const now = new Date((trial?.expiresAt.getTime() ?? 0) - 6.5 * 24 * 60 * 60 * 1000);
    const first = await runScheduled(env, now);
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("expired");
    expect(capturedEmails().last(email)?.subject).toMatch(/berakhir dalam 7 hari/);

    await runScheduled(env, now);
    const sent = await db
      .select()
      .from(remindersSent)
      .where(eq(remindersSent.userId, u?.id ?? ""));
    expect(sent.map((r) => r.kind)).toEqual(["d7"]);
  });
});

describe("payments not configured", () => {
  it("has no provider without credentials on deployed environments, and webhooks answer 404", async () => {
    const deployed = { ...env, APP_ENV: "preview" as const };
    expect(configuredProvider(deployed)).toBeNull();
    expect(configuredProvider(env)?.name).toBe("fake");
    const hook = await app.request("http://localhost/api/webhooks/duitku", { method: "POST", body: "" }, deployed);
    expect(hook.status).toBe(404);
  });
});
