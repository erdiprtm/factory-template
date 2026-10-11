import { env } from "cloudflare:workers";
import { entitlements, funnelEvents, payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { BASE, call, firstPlan, get, post, signInWithConsent } from "./helpers";

// Sell engine Module 6 (D-038) acceptance: /admin shows CAC and ROAS correctly for test spend.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const anon = () => crypto.randomUUID().replaceAll("-", "");
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

type Row = {
  campaign: string | null;
  spendIdr: number;
  buyers: number;
  cacIdr: number | null;
  roasD7: number | null;
  roasD30: number | null;
};
type Economics = { campaigns: Row[]; totals: Row; funnel: { step: string; visitors: number; firstBad: boolean }[] };

async function buyerFrom(campaign: string) {
  const cookie = await signInWithConsent(uniqueEmail("econ"));
  const anonId = anon();
  await call("/api/events", {
    method: "POST",
    body: JSON.stringify({ anonId, utm_campaign: campaign, events: [{ event: "lp_view" }, { event: "cta_tap" }] }),
  });
  await post("/api/attribution", cookie, {
    anonId,
    firstSeenAt: Date.now() - 60_000,
    utm_source: "meta",
    utm_campaign: campaign,
  });
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
    paymentId: string;
  }>();
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
  return { cookie, paymentId };
}

const admin = () => signInWithConsent("admin@example.com");
const economics = async (cookie: string, campaign: string) =>
  (await get(`/api/admin/economics?campaign=${encodeURIComponent(campaign)}`, cookie)).json<Economics>();

describe("ad spend → CAC and ROAS", () => {
  it("joins spend to buyers by utm_campaign", async () => {
    const campaign = `test-${crypto.randomUUID().slice(0, 8)}`;
    await buyerFrom(campaign);
    await buyerFrom(campaign);
    const cookie = await admin();
    const spend = firstPlan.priceIdr * 3; // 2 buyers → CAC 1.5 × price; ROAS = 2 × price / spend
    expect(
      (await post("/api/admin/spend", cookie, { date: today, channel: "meta", campaign, amountIdr: spend })).status,
    ).toBe(200);

    const e = await economics(cookie, campaign);
    const row = e.campaigns.find((c) => c.campaign === campaign);
    expect(row).toMatchObject({ spendIdr: spend, buyers: 2, cacIdr: Math.round(spend / 2) });
    expect(row?.roasD7).toBeCloseTo((2 * firstPlan.priceIdr) / spend, 2);
    expect(row?.roasD30).toBeCloseTo((2 * firstPlan.priceIdr) / spend, 2);
    const visitors = Object.fromEntries(e.funnel.map((s) => [s.step, s.visitors]));
    expect(visitors).toMatchObject({ lp_view: 2, cta_tap: 2, purchase: 2 });
  });

  it("a re-entered day replaces the amount; CSV import upserts too", async () => {
    const campaign = `csv-${crypto.randomUUID().slice(0, 8)}`;
    await buyerFrom(campaign);
    const cookie = await admin();
    await post("/api/admin/spend", cookie, { date: today, channel: "meta", campaign, amountIdr: 1 });
    const csv = `Day,Campaign name,Amount spent (IDR)\n${today},${campaign},200000\n`;
    const res = await call("/api/admin/spend/import", {
      method: "POST",
      headers: { "content-type": "text/csv", cookie, origin: BASE },
      body: csv,
    });
    expect(await res.json()).toMatchObject({ ok: true, imported: 1, errors: [] });
    const row = (await economics(cookie, campaign)).campaigns.find((c) => c.campaign === campaign);
    expect(row).toMatchObject({ spendIdr: 200_000, buyers: 1, cacIdr: 200_000 });
  });

  it("rejects a CSV without the needed columns, and bad entries", async () => {
    const cookie = await admin();
    const res = await call("/api/admin/spend/import", {
      method: "POST",
      headers: { cookie, origin: BASE },
      body: "a,b\n1,2",
    });
    expect(res.status).toBe(400);
    expect(
      (await post("/api/admin/spend", cookie, { date: "11/10/2026", channel: "meta", campaign: "x", amountIdr: 1 }))
        .status,
    ).toBe(400);
  });

  it("is admin only", async () => {
    const cookie = await signInWithConsent(uniqueEmail("not-admin"));
    expect((await get("/api/admin/economics", cookie)).status).toBe(403);
    expect(
      (await post("/api/admin/spend", cookie, { date: today, channel: "meta", campaign: "x", amountIdr: 1 })).status,
    ).toBe(403);
  });
});

describe("refund", () => {
  it("ends access, records the refund event, drops out of revenue, and is idempotent", async () => {
    const campaign = `refund-${crypto.randomUUID().slice(0, 8)}`;
    const { cookie: buyer, paymentId } = await buyerFrom(campaign);
    const cookie = await admin();
    expect((await post("/api/admin/refund", cookie, { paymentId })).status).toBe(200);
    expect((await post("/api/admin/refund", cookie, { paymentId })).status).toBe(200);
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("refunded");
    const e = await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId)).get();
    expect(e && e.expiresAt.getTime() <= Date.now()).toBe(true);
    expect((await (await get("/api/me", buyer)).json<{ access: boolean }>()).access).toBe(false);
    const refunds = await db.select().from(funnelEvents).where(eq(funnelEvents.utmCampaign, campaign));
    expect(refunds.filter((r) => r.event === "refund")).toHaveLength(1);
    expect((await economics(cookie, campaign)).campaigns.find((c) => c.campaign === campaign)?.buyers).toBe(0);
    expect((await post("/api/admin/refund", cookie, { paymentId: `pay_${"0".repeat(32)}` })).status).toBe(404);
  });
});
