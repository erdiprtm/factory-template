import { env } from "cloudflare:workers";
import { grantAdminDays, grantFromPayment, grantTrial, hasAccess } from "@factory/core/entitlements";
import { entitlements, payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

// Entitlement rules (FACTORY_BLUEPRINT.md Section 5) against a real local D1.
const db = drizzle(env.DB, { schema });
const t = (iso: string) => new Date(iso);
const NOW = t("2026-10-11T00:00:00Z");

async function paidPayment(userId: string, planId = "6m") {
  const id = crypto.randomUUID();
  await db.insert(payments).values({
    id,
    userId,
    provider: "duitku",
    providerRef: `ref-${id}`,
    planId,
    amountIdr: 149000,
    status: "paid",
    createdAt: NOW,
    expiresAt: t("2026-10-11T01:00:00Z"),
    paidAt: NOW,
  });
  return id;
}

let user: string;
beforeEach(() => {
  user = `user-${crypto.randomUUID()}`;
});

describe("hasAccess", () => {
  it("is false without entitlements and true while one is active", async () => {
    expect(await hasAccess(db, user, NOW)).toBe(false);
    await grantTrial(db, user, 7, NOW);
    expect(await hasAccess(db, user, t("2026-10-17T23:59:59Z"))).toBe(true);
    expect(await hasAccess(db, user, t("2026-10-18T00:00:01Z"))).toBe(false);
  });
});

describe("trial", () => {
  it("is granted once per user", async () => {
    const first = await grantTrial(db, user, 7, NOW);
    expect(first?.expiresAt.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(await grantTrial(db, user, 7, t("2026-12-01T00:00:00Z"))).toBeNull();
  });

  it("stays once-only under concurrent requests (partial unique index)", async () => {
    const results = await Promise.all([grantTrial(db, user, 7, NOW), grantTrial(db, user, 7, NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const rows = await db.select().from(entitlements).where(eq(entitlements.userId, user));
    expect(rows).toHaveLength(1);
  });
});

describe("purchase extends, never overlaps", () => {
  it("early renewal during an active trial starts at the trial's end", async () => {
    await grantTrial(db, user, 7, NOW);
    const e = await grantFromPayment(
      db,
      { userId: user, paymentId: await paidPayment(user), planId: "6m", months: 6 },
      NOW,
    );
    expect(e.startsAt.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(e.expiresAt.toISOString()).toBe("2027-04-18T00:00:00.000Z");
  });

  it("renewal after expiry starts now", async () => {
    await grantTrial(db, user, 7, NOW);
    const later = t("2027-01-01T00:00:00Z");
    const e = await grantFromPayment(
      db,
      { userId: user, paymentId: await paidPayment(user, "12m"), planId: "12m", months: 12 },
      later,
    );
    expect(e.startsAt).toEqual(later);
    expect(e.expiresAt.toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });

  it("stacks consecutive purchases", async () => {
    await grantFromPayment(db, { userId: user, paymentId: await paidPayment(user), planId: "6m", months: 6 }, NOW);
    const second = await grantFromPayment(
      db,
      { userId: user, paymentId: await paidPayment(user, "12m"), planId: "12m", months: 12 },
      NOW,
    );
    expect(second.startsAt.toISOString()).toBe("2027-04-11T00:00:00.000Z");
    expect(second.expiresAt.toISOString()).toBe("2028-04-11T00:00:00.000Z");
  });

  it("is idempotent per payment (webhook replay can't double-grant)", async () => {
    const paymentId = await paidPayment(user);
    const a = await grantFromPayment(db, { userId: user, paymentId, planId: "6m", months: 6 }, NOW);
    const b = await grantFromPayment(
      db,
      { userId: user, paymentId, planId: "6m", months: 6 },
      t("2026-10-12T00:00:00Z"),
    );
    expect(b.id).toBe(a.id);
    const rows = await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId));
    expect(rows).toHaveLength(1);
  });
});

describe("admin grant", () => {
  it("adds N days on top of the latest expiry", async () => {
    await grantTrial(db, user, 7, NOW);
    const e = await grantAdminDays(db, user, 30, NOW);
    expect(e.source).toBe("admin_grant");
    expect(e.startsAt.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(e.expiresAt.toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
});
