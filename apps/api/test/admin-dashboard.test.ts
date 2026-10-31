import { env } from "cloudflare:workers";
import { loadDashboard, loadFeed } from "@factory/core/admin/dashboard";
import { adSpend, funnelEvents, schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { get, signInWithConsent } from "./helpers";

// D-113: /admin's dashboard from first-party data, with and without data, and admin-only routes.
const db = drizzle(env.DB, { schema });

function row(event: string, anonId: string, at: Date, extra: Partial<typeof funnelEvents.$inferInsert> = {}) {
  return {
    id: crypto.randomUUID(),
    event,
    anonId,
    userId: null,
    step: null,
    utmSource: null,
    utmCampaign: null,
    valueIdr: null,
    experiment: null,
    variant: null,
    createdAt: at,
    ...extra,
  };
}

describe("loadDashboard", () => {
  it("KPIs with trends, per-day series and sources with CAC/ROAS", async () => {
    // A fixed day far from other tests' data: "now" is 2025-03-10 12:00 WIB.
    const now = new Date("2025-03-10T05:00:00Z");
    const today = new Date("2025-03-10T03:00:00Z");
    const yesterday = new Date("2025-03-09T03:00:00Z");
    const meta = { utmSource: "meta", utmCampaign: "c-dash" };
    await db
      .insert(funnelEvents)
      .values([
        row("lp_view", "v1", today, meta),
        row("lp_view", "v1", today, meta),
        row("lp_view", "v2", today, meta),
        row("lp_view", "v3", today),
        row("first_result", "v1", today, meta),
        row("purchase", "v1", today, { ...meta, valueIdr: 249000 }),
        row("renewal", "v9", today, { valueIdr: 149000 }),
        row("refund", "v8", today, { valueIdr: 49000 }),
        row("lp_view", "p1", yesterday, meta),
        row("purchase", "p1", yesterday, { ...meta, valueIdr: 100000 }),
      ]);
    await db.insert(adSpend).values({
      id: crypto.randomUUID(),
      day: "2025-03-10",
      channel: "meta",
      campaign: "c-dash",
      amountIdr: 100000,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    const d = await loadDashboard(db, "today", now);
    expect(d.from).toBe("2025-03-10");
    expect(d.kpis.revenueIdr).toEqual({ value: 249000 + 149000 - 49000, trend: 2.49 });
    expect(d.kpis.buyers).toEqual({ value: 1, trend: 0 });
    expect(d.kpis.visitors.value).toBe(3);
    expect(d.kpis.conversion.value).toBeCloseTo(1 / 3, 3);
    expect(d.series).toEqual([{ day: "2025-03-10", revenueIdr: 349000, visitors: 3 }]);
    const metaRow = d.sources.find((s) => s.campaign === "c-dash");
    expect(metaRow).toMatchObject({ source: "meta", visitors: 2, firstResults: 1, buyers: 1, revenueIdr: 249000 });
    expect(metaRow).toMatchObject({ cacIdr: 100000, roas: 2.49 });
    expect(d.sources.find((s) => s.source === null && s.campaign === null)?.visitors).toBe(1);
  });

  it("an empty range: zeros, no trends to invent, no sources", async () => {
    const d = await loadDashboard(db, "7d", new Date("2020-01-15T05:00:00Z"));
    expect(d.kpis.revenueIdr).toEqual({ value: 0, trend: 0 });
    expect(d.kpis.conversion.value).toBeNull();
    expect(d.series).toHaveLength(7);
    expect(d.series.every((p) => p.revenueIdr === 0 && p.visitors === 0)).toBe(true);
    expect(d.sources).toEqual([]);
  });
});

describe("feed and routes", () => {
  it("the feed masks emails, newest first; the routes are admin-only", async () => {
    const email = `feed-${crypto.randomUUID()}@example.com`;
    await signInWithConsent(email);
    const items = await loadFeed(db);
    const mine = items.find((i) => i.kind === "signup" && i.who === `fe***@example.com`);
    expect(mine).toBeTruthy();
    expect(JSON.stringify(items)).not.toContain(email);
    expect([...items].map((i) => i.at)).toEqual(
      [...items]
        .map((i) => i.at)
        .sort()
        .reverse(),
    );

    const member = await signInWithConsent(`m-${crypto.randomUUID()}@example.com`);
    expect((await get("/api/admin/dashboard?range=7d", member)).status).toBe(403);
    expect((await get("/api/admin/feed", member)).status).toBe(403);
    const admin = await signInWithConsent("admin@example.com");
    expect((await get("/api/admin/dashboard?range=30d", admin)).status).toBe(200);
    expect((await get("/api/admin/dashboard?range=year", admin)).status).toBe(400);
    expect((await get("/api/admin/feed", admin)).status).toBe(200);
  });
});
