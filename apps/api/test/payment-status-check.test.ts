import { env } from "cloudflare:workers";
import { entitlements, payments, schema, user } from "@factory/db";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// D-128: the missed-webhook fallback (Myna Fit, 2026-11-11). The hosted-page fake acts like DOKU
// (statusFallbackMs set) unless a test turns it off to act like Duitku. Owner alerts are captured.
const calls = vi.hoisted(() => ({ alerts: [] as [string, string][] }));
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return {
    ...real,
    config: {
      ...real.config,
      notifications: {
        telegram: {
          events: ["purchase", "renewal", "refund", "payment_rescued", "repeat_checkout"],
          email: "masked",
          dailySummaryHourWib: null,
        },
      },
    },
  };
});
vi.doMock("../src/core/notify", () => ({
  ownerAlert: async (_env: unknown, event: string, text: string) => {
    calls.alerts.push([event, text]);
  },
  ownerTelegram: () => null,
}));

const { capturedEmails } = await import("@factory/core/email");
const { fakeProvider } = await import("../src/core/payments");
const { runScheduled } = await import("../src/core/cron");
const { firstPlan, get, PAID, post, signInWithConsent } = await import("./helpers");

const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const fake = fakeProvider();

beforeAll(() => {
  fake.statusFallbackMs = 20_000;
});
afterEach(() => {
  fake.statusFallbackMs = 20_000;
  calls.alerts = [];
});

async function checkout(cookie: string): Promise<string> {
  const res = await post("/api/billing/checkout", cookie, { planId: firstPlan.id });
  expect(res.status).toBe(200);
  return (await res.json<{ paymentId: string }>()).paymentId;
}

/** Moves a payment's clock back: created `minutes` ago, its next check slot free. */
async function age(paymentId: string, minutes: number, status?: "expired") {
  const at = new Date(Date.now() - minutes * 60_000);
  await db
    .update(payments)
    .set({
      createdAt: at,
      expiresAt: new Date(at.getTime() + 60 * 60_000),
      statusNextCheckAt: null,
      ...(status ? { status } : {}),
    })
    .where(eq(payments.id, paymentId));
}

const freeSlot = (paymentId: string) =>
  db
    .update(payments)
    .set({ statusNextCheckAt: new Date(Date.now() - 1000) })
    .where(eq(payments.id, paymentId));

const statusOf = async (paymentId: string) =>
  (await db.select({ s: payments.status }).from(payments).where(eq(payments.id, paymentId)).get())?.s;

describe("return page status fallback", () => {
  it("waits 60 s after the first poll, then asks at most once per 20 s and settles like a webhook", async () => {
    const email = uniqueEmail("ret");
    const cookie = await signInWithConsent(email);
    const paymentId = await checkout(cookie);
    fake.statuses.set(paymentId, "paid"); // paid at DOKU, but the webhook never comes

    const poll = () => get(`/api/billing/status?paymentId=${paymentId}`, cookie);
    expect(await (await poll()).json()).toMatchObject({ status: "pending" });
    expect(await (await poll()).json()).toMatchObject({ status: "pending" });
    expect(fake.statusCalls.get(paymentId) ?? 0).toBe(0); // armed, not asked yet

    await freeSlot(paymentId);
    expect(await (await poll()).json()).toMatchObject({ status: "paid" });
    expect(fake.statusCalls.get(paymentId)).toBe(1);
    expect((await get(PAID, cookie)).status).toBe(200);
    expect(capturedEmails().last(email)?.subject).toMatch(/Pembayaran .* berhasil/);
    expect(calls.alerts.map(([e]) => e)).toEqual(["purchase", "payment_rescued"]);
    expect(calls.alerts[1]?.[1]).toContain(paymentId);

    // The late webhook changes nothing: one entitlement for the payment.
    const late = fake.webhook(paymentId, "paid");
    const { app } = await import("../src/index");
    expect((await app.request(late.url, late, env)).status).toBe(200);
    const rows = await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId));
    expect(rows).toHaveLength(1);
  });

  it("throttles repeated checks to one per slot", async () => {
    const cookie = await signInWithConsent(uniqueEmail("thr"));
    const paymentId = await checkout(cookie);
    await age(paymentId, 3);
    await freeSlot(paymentId);
    for (let i = 0; i < 4; i++) await post("/api/billing/check", cookie, { paymentId });
    expect(fake.statusCalls.get(paymentId)).toBe(1);
    const res = await post("/api/billing/check", cookie, { paymentId });
    const body = await res.json<{ status: string; checked: boolean; retryAfterSec: number }>();
    expect(body).toMatchObject({ status: "pending", checked: true });
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it("never asks Duitku-like providers (webhook only)", async () => {
    fake.statusFallbackMs = undefined;
    const cookie = await signInWithConsent(uniqueEmail("duitku"));
    const paymentId = await checkout(cookie);
    fake.statuses.set(paymentId, "paid");
    await age(paymentId, 3);
    await get(`/api/billing/status?paymentId=${paymentId}`, cookie);
    const res = await post("/api/billing/check", cookie, { paymentId });
    expect(await res.json()).toMatchObject({ status: "pending", checked: false });
    expect(fake.statusCalls.get(paymentId) ?? 0).toBe(0);
  });
});

describe("Saya sudah bayar (POST /api/billing/check)", () => {
  it("the incident: three checkouts, the first paid, all expired → finds it, grants once, pings repeat_checkout once", async () => {
    const email = uniqueEmail("incident");
    const cookie = await signInWithConsent(email);
    const ids = [await checkout(cookie), await checkout(cookie), await checkout(cookie)];
    expect(calls.alerts.filter(([e]) => e === "repeat_checkout")).toHaveLength(1);
    fake.statuses.set(ids[0] as string, "paid");
    for (const [i, id] of ids.entries()) await age(id, 70 - i, "expired");

    const res = await post("/api/billing/check", cookie, {});
    const body = await res.json<{ paymentId: string; status: string; accessUntil: string | null }>();
    expect(body).toMatchObject({ paymentId: ids[0], status: "paid" });
    expect(body.accessUntil).not.toBeNull();
    expect(await statusOf(ids[1] as string)).toBe("expired");
    expect((await get(PAID, cookie)).status).toBe(200);
    expect(calls.alerts.map(([e]) => e)).toContain("payment_rescued");
  });

  it("is owner-only", async () => {
    const owner = await signInWithConsent(uniqueEmail("own"));
    const paymentId = await checkout(owner);
    const other = await signInWithConsent(uniqueEmail("other"));
    expect((await post("/api/billing/check", other, { paymentId })).status).toBe(404);
    expect((await post("/api/billing/check", null, { paymentId })).status).toBe(401);
  });

  it("answers with no payment when there is nothing to check", async () => {
    const cookie = await signInWithConsent(uniqueEmail("none"));
    expect(await (await post("/api/billing/check", cookie, {})).json()).toMatchObject({
      paymentId: null,
      checked: false,
    });
  });
});

describe("cron status fallback", () => {
  it("asks about unpaid payments of the last 2 hours older than 5 minutes, once per run", async () => {
    const cookie = await signInWithConsent(uniqueEmail("cron"));
    const fresh = await checkout(cookie);
    const due = await checkout(cookie);
    const old = await checkout(cookie);
    for (const id of [fresh, due, old]) fake.statuses.set(id, "paid");
    await age(fresh, 1);
    await age(due, 30, "expired");
    await age(old, 3 * 60, "expired");

    const result = await runScheduled(env);
    expect(result.rescued).toBeGreaterThanOrEqual(1);
    expect(await statusOf(due)).toBe("paid");
    expect(await statusOf(fresh)).toBe("pending");
    expect(await statusOf(old)).toBe("expired");
    expect(fake.statusCalls.get(fresh) ?? 0).toBe(0);
    expect(fake.statusCalls.get(old) ?? 0).toBe(0);
    expect(calls.alerts.map(([e]) => e)).toContain("payment_rescued");
  });
});

describe("/admin payment tools", () => {
  const adminEmail = "admin@example.com";

  it("Cek ulang settles any unpaid payment; non-admins get 403", async () => {
    const admin = await signInWithConsent(adminEmail);
    const cookie = await signInWithConsent(uniqueEmail("adm"));
    const paymentId = await checkout(cookie);
    expect((await post("/api/admin/payments/recheck", cookie, { paymentId })).status).toBe(403);

    expect(await (await post("/api/admin/payments/recheck", admin, { paymentId })).json()).toMatchObject({
      status: "pending",
      result: "unchanged",
    });
    fake.statuses.set(paymentId, "paid");
    await age(paymentId, 5 * 60, "expired"); // far outside the automatic windows: admin still may
    const res = await post("/api/admin/payments/recheck", admin, { paymentId });
    expect(await res.json()).toMatchObject({ ok: true, status: "paid" });
    expect((await get(PAID, cookie)).status).toBe(200);
    expect(calls.alerts.map(([e]) => e)).toEqual(["purchase"]); // no rescue ping: the admin is looking
  });

  it("a manual stand-in grant needs a choice: replace ends it, stack keeps it", async () => {
    const admin = await signInWithConsent(adminEmail);
    for (const mode of ["replace", "stack"] as const) {
      const email = uniqueEmail(`cover-${mode}`);
      const cookie = await signInWithConsent(email);
      const paymentId = await checkout(cookie);
      await age(paymentId, 6 * 60, "expired");
      expect((await post("/api/admin/grant", admin, { email, days: 30 })).status).toBe(200);
      fake.statuses.set(paymentId, "paid");

      const ask = await post("/api/admin/payments/recheck", admin, { paymentId });
      expect(ask.status).toBe(409);
      expect(await ask.json()).toMatchObject({ error: "needs_confirm", planLabel: firstPlan.label });
      expect(await statusOf(paymentId)).toBe("expired");

      const done = await post("/api/admin/payments/recheck", admin, { paymentId, grantMode: mode });
      expect(await done.json()).toMatchObject({ ok: true, status: "paid" });
      const u = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
      const grant = await db
        .select()
        .from(entitlements)
        .where(and(eq(entitlements.userId, u?.id ?? ""), eq(entitlements.source, "admin_grant")))
        .get();
      const paid = await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId)).get();
      if (mode === "replace") {
        expect(grant?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
        expect(paid?.startsAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      } else {
        expect(paid?.startsAt.getTime()).toBe(grant?.expiresAt.getTime());
      }
    }
  });

  it("Kirim ulang struk sends the receipt of a paid payment only", async () => {
    const admin = await signInWithConsent(adminEmail);
    const email = uniqueEmail("receipt");
    const cookie = await signInWithConsent(email);
    const paymentId = await checkout(cookie);
    expect((await post("/api/admin/payments/receipt", admin, { paymentId })).status).toBe(409);
    fake.statuses.set(paymentId, "paid");
    await post("/api/admin/payments/recheck", admin, { paymentId });
    const receipts = () => capturedEmails().sent.filter((m) => m.to === email && /berhasil/.test(m.subject)).length;
    const before = receipts();
    expect(before).toBe(1);
    expect((await post("/api/admin/payments/receipt", admin, { paymentId })).status).toBe(200);
    expect(receipts()).toBe(2);
  });
});
