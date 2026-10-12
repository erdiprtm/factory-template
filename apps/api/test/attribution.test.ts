import { env } from "cloudflare:workers";
import { attributions, funnelEvents, payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { runScheduled } from "../src/core/cron";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { call, firstPlan, get, post, signInWithConsent } from "./helpers";

// Sell engine, Module 1 (D-033): funnel events and first-touch attribution, against real local D1.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const anon = () => crypto.randomUUID().replaceAll("-", "");

// The site sends these with sendBeacon: text/plain, cross-origin, no cookie.
const beacon = (body: unknown) =>
  call("/api/events", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body) });

async function userId(email: string) {
  return (
    (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).get())?.id ?? ""
  );
}

async function pay(cookie: string) {
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
    paymentId: string;
  }>();
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
  return paymentId;
}

describe("POST /api/events", () => {
  it("stores browser funnel steps with the device's campaign", async () => {
    const anonId = anon();
    const res = await beacon({
      anonId,
      utm_source: "meta",
      utm_campaign: "c-events",
      events: [{ event: "lp_view" }, { event: "quiz_step", step: 2 }],
    });
    expect(res.status).toBe(204);
    // The site calls this cross-origin (sendBeacon): its empty response may be read cross-origin.
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect((await call("/api/health")).headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const rows = await db.select().from(funnelEvents).where(eq(funnelEvents.anonId, anonId));
    expect(rows.map((r) => [r.event, r.step, r.utmCampaign]).sort()).toEqual([
      ["lp_view", null, "c-events"],
      ["quiz_step", 2, "c-events"],
    ]);
  });

  it("rejects money events, bad ids and oversized batches", async () => {
    const anonId = anon();
    expect((await beacon({ anonId, events: [{ event: "purchase" }] })).status).toBe(400);
    expect((await beacon({ anonId: "short", events: [{ event: "lp_view" }] })).status).toBe(400);
    expect((await beacon({ anonId, events: Array(21).fill({ event: "lp_view" }) })).status).toBe(400);
    expect((await call("/api/events", { method: "POST", body: "not json" })).status).toBe(400);
    expect(await db.select().from(funnelEvents).where(eq(funnelEvents.anonId, anonId))).toEqual([]);
  });
});

describe("attribution → payment → purchase/renewal", () => {
  it("keeps the first touch, copies it onto payments, and records purchase then renewal", async () => {
    const email = uniqueEmail("attr");
    const cookie = await signInWithConsent(email);
    const anonId = anon();
    const touch = {
      anonId,
      firstSeenAt: Date.now() - 60_000,
      utm_source: "meta",
      utm_campaign: "c-buy",
      fbclid: "IwAR-x",
    };
    expect(await (await post("/api/attribution", cookie, touch)).json()).toEqual({ ok: true, saved: true });
    // A later device or visit never replaces the first touch.
    const later = { ...touch, anonId: anon(), utm_campaign: "c-later" };
    expect(await (await post("/api/attribution", cookie, later)).json()).toEqual({ ok: true, saved: false });

    const first = await pay(cookie);
    const second = await pay(cookie);
    const row = await db.select().from(payments).where(eq(payments.id, first)).get();
    expect(row).toMatchObject({ utmSource: "meta", utmCampaign: "c-buy", fbclid: "IwAR-x" });

    const id = await userId(email);
    const events = await db.select().from(funnelEvents).where(eq(funnelEvents.userId, id));
    expect(events.map((e) => e.event).sort()).toEqual(["purchase", "renewal"]);
    expect(
      events.every((e) => e.anonId === anonId && e.utmCampaign === "c-buy" && e.valueIdr === firstPlan.priceIdr),
    ).toBe(true);
    expect(second).not.toBe(first);
  });

  it("works without attribution (direct visitors)", async () => {
    const email = uniqueEmail("direct");
    const cookie = await signInWithConsent(email);
    const paymentId = await pay(cookie);
    expect(await db.select().from(payments).where(eq(payments.id, paymentId)).get()).toMatchObject({
      utmCampaign: null,
    });
    const events = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.userId, await userId(email)));
    expect(events).toMatchObject([{ event: "purchase", anonId: null, utmCampaign: null }]);
  });

  it("needs a session and a valid touch", async () => {
    const touch = { anonId: anon(), firstSeenAt: 1 };
    expect((await post("/api/attribution", null, touch)).status).toBe(401);
    const cookie = await signInWithConsent(uniqueEmail("badtouch"));
    expect((await post("/api/attribution", cookie, { anonId: "x", firstSeenAt: 1 })).status).toBe(400);
  });
});

describe("UU PDP", () => {
  it("exports and erases attribution and funnel events; payments keep only the campaign", async () => {
    const email = uniqueEmail("pdp");
    const cookie = await signInWithConsent(email);
    const anonId = anon();
    await beacon({ anonId, utm_campaign: "c-pdp", events: [{ event: "lp_view" }] });
    await post("/api/attribution", cookie, { anonId, firstSeenAt: Date.now(), utm_campaign: "c-pdp", fbclid: "Fb1" });
    const paymentId = await pay(cookie);

    const data = await (await get("/api/account/export", cookie)).json<{
      attribution: { utmCampaign: string };
      funnelEvents: { event: string }[];
    }>();
    expect(data.attribution.utmCampaign).toBe("c-pdp");
    expect(data.funnelEvents.map((e) => e.event).sort()).toEqual(["lp_view", "purchase"]);

    const id = await userId(email);
    expect((await post("/api/account/delete", cookie, { confirm: "HAPUS" })).status).toBe(200);
    expect(await db.select().from(attributions).where(eq(attributions.userId, id))).toEqual([]);
    expect(await db.select().from(funnelEvents).where(eq(funnelEvents.anonId, anonId))).toEqual([]);
    expect(await db.select().from(payments).where(eq(payments.id, paymentId)).get()).toMatchObject({
      utmCampaign: "c-pdp",
      fbclid: null,
    });
  });
});

describe("retention", () => {
  it("the cron drops funnel events older than 400 days", async () => {
    const anonId = anon();
    await beacon({ anonId, events: [{ event: "lp_view" }] });
    await runScheduled(env, new Date(Date.now() + 401 * 86_400_000));
    expect(await db.select().from(funnelEvents).where(eq(funnelEvents.anonId, anonId))).toEqual([]);
  });
});
