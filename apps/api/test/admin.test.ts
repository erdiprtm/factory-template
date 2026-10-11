import { env } from "cloudflare:workers";
import { entitlements, payments, schema, user } from "@factory/db";
import { count, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { firstPlan, get, lastPlan, post, signInWithConsent } from "./helpers";

// /admin: allowlist + numbers that match the database (Phase 7 acceptance).
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;

async function buy(cookie: string, planId: string) {
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId })).json<{ paymentId: string }>();
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
}

describe("admin access", () => {
  it("is 401 signed out and 403 for non-admins; /me tells the UI", async () => {
    expect((await get("/api/admin/stats", null)).status).toBe(401);
    const cookie = await signInWithConsent(uniqueEmail("plain"));
    expect((await get("/api/admin/stats", cookie)).status).toBe(403);
    expect((await (await get("/api/me", cookie)).json<{ isAdmin: boolean }>()).isAdmin).toBe(false);
  });
});

describe("admin numbers", () => {
  it("match the database", async () => {
    // Some activity: one trial user, one paid user (12m), one admin-granted user.
    const trial = await signInWithConsent(uniqueEmail("t"));
    await post("/api/billing/trial", trial, {});
    const buyer = await signInWithConsent(uniqueEmail("b"));
    await buy(buyer, lastPlan.id);
    const admin = await signInWithConsent("admin@example.com");
    expect((await (await get("/api/me", admin)).json<{ isAdmin: boolean }>()).isAdmin).toBe(true);
    const grantee = uniqueEmail("g");
    await signInWithConsent(grantee);
    const grant = await post("/api/admin/grant", admin, { email: grantee, days: 30 });
    expect(grant.status).toBe(200);

    const stats = await (await get("/api/admin/stats", admin)).json<{
      users: number;
      activeUsers: number;
      activeBySource: { trial: number; paid: number; admin_grant: number };
      revenueByMonth: { month: string; amountIdr: number; count: number }[];
    }>();

    const now = new Date();
    const dbUsers = (await db.select({ n: count() }).from(user).get())?.n;
    expect(stats.users).toBe(dbUsers);
    const activeUserIds = new Set(
      (await db.select({ u: entitlements.userId }).from(entitlements).where(gt(entitlements.expiresAt, now))).map(
        (r) => r.u,
      ),
    );
    expect(stats.activeUsers).toBe(activeUserIds.size);
    expect(stats.activeBySource.trial).toBeGreaterThanOrEqual(1);
    expect(stats.activeBySource.paid).toBeGreaterThanOrEqual(1);
    expect(stats.activeBySource.admin_grant).toBeGreaterThanOrEqual(1);

    const paid = await db.select({ a: payments.amountIdr }).from(payments).where(eq(payments.status, "paid"));
    const totalRevenue = stats.revenueByMonth.reduce((s, m) => s + m.amountIdr, 0);
    expect(totalRevenue).toBe(paid.reduce((s, p) => s + p.a, 0));
    expect(stats.revenueByMonth.reduce((s, m) => s + m.count, 0)).toBe(paid.length);
  });

  it("lists recent payments and webhook events, and validates grants", async () => {
    const admin = await signInWithConsent("admin@example.com");
    const buyer = await signInWithConsent(uniqueEmail("p"));
    await buy(buyer, firstPlan.id);
    const list = await (await get("/api/admin/payments", admin)).json<{ payments: { status: string }[] }>();
    expect(list.payments.some((p) => p.status === "paid")).toBe(true);
    const events = await (await get("/api/admin/webhooks", admin)).json<{ events: { status: string }[] }>();
    expect(events.events.some((e) => e.status === "processed")).toBe(true);
    expect((await post("/api/admin/grant", admin, { email: "nobody@example.com", days: 7 })).status).toBe(404);
    expect((await post("/api/admin/grant", admin, { email: "bad", days: 7 })).status).toBe(400);
  });
});
