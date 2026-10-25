import { env } from "cloudflare:workers";
import { loadEconomics, markRefunded } from "@factory/core/economics";
import { anonIdIn, type Experiment, variantFor } from "@factory/core/experiments";
import { funnelEvents, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

// A/B experiments (D-094), with a product config that runs one (the template's runs none: D-078).
// resetModules + doMock: a hoisted vi.mock didn't reach the API's own imports in the workers pool.
const experiment: Experiment = { name: "quiz_length", variants: { short: 50, long: 50 } };
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return { ...real, config: { ...real.config, experiments: { quiz_length: { variants: experiment.variants } } } };
});

const { app } = await import("../src/index");
const { call, firstPlan, post, signInWithConsent } = await import("./helpers");
const { fakeProvider } = await import("../src/core/payments");

const db = drizzle(env.DB, { schema });
let n = 0;
const deviceIn = (variant: string) => anonIdIn(experiment, variant, `t${Date.now().toString(36)}${n++}`);
const beacon = (body: unknown) =>
  call("/api/events", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body) });
const eventsOf = (anonId: string) => db.select().from(funnelEvents).where(eq(funnelEvents.anonId, anonId));

async function buyer(anonId: string) {
  const email = `exp-${crypto.randomUUID()}@example.com`;
  const cookie = await signInWithConsent(email);
  await post("/api/attribution", cookie, { anonId, firstSeenAt: Date.now() - 60_000, utm_campaign: "c-exp" });
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
    paymentId: string;
  }>();
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
  return paymentId;
}

describe("funnel events carry the device's arm", () => {
  it("the API derives the arm from the anonId and ignores one the browser claims", async () => {
    for (const variant of ["short", "long"]) {
      const anonId = deviceIn(variant);
      const claimed = variant === "short" ? "long" : "short";
      const res = await beacon({ anonId, variant: claimed, experiment: "other", events: [{ event: "quiz_start" }] });
      expect(res.status).toBe(204);
      expect(await eventsOf(anonId)).toMatchObject([{ event: "quiz_start", experiment: "quiz_length", variant }]);
    }
  });

  it("purchase and refund get the arm of the buyer's first device", async () => {
    const anonId = deviceIn("long");
    const paymentId = await buyer(anonId);
    expect(await eventsOf(anonId)).toMatchObject([{ event: "purchase", variant: "long" }]);
    const refund = await markRefunded(db, paymentId, new Date(), { experiment });
    expect(refund).toMatchObject({ kind: "refunded", tag: { experiment: "quiz_length", variant: "long" } });
    expect((await eventsOf(anonId)).map((e) => [e.event, e.variant]).sort()).toEqual([
      ["purchase", "long"],
      ["refund", "long"],
    ]);
  });
});

describe("/admin economics split by arm", () => {
  it("counts each arm's funnel apart and reports the day each arm first appeared", async () => {
    const short = [deviceIn("short"), deviceIn("short")];
    const long = deviceIn("long");
    for (const anonId of short)
      await beacon({ anonId, utm_campaign: "c-split", events: [{ event: "lp_view" }, { event: "cta_tap" }] });
    await beacon({ anonId: long, utm_campaign: "c-split", events: [{ event: "lp_view" }] });
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const e = await loadEconomics(db, {
      from: today,
      to: today,
      campaign: "c-split",
      plans: [],
      steps: ["lp_view", "cta_tap"],
      benchmarks: {},
      experiment,
    });
    expect(e.experiment?.name).toBe("quiz_length");
    const arm = (v: string) => e.experiment?.variants.find((a) => a.variant === v);
    expect(arm("short")?.funnel.map((s) => s.visitors)).toEqual([2, 2]);
    expect(arm("long")?.funnel.map((s) => s.visitors)).toEqual([1, 0]);
    expect(arm("short")).toMatchObject({ weight: 50, firstSeen: today });
    // The whole funnel still counts everyone.
    expect(e.funnel.map((s) => s.visitors)).toEqual([3, 2]);
  });

  it("without an experiment there is no split", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const e = await loadEconomics(db, { from: today, to: today, plans: [], steps: ["lp_view"], benchmarks: {} });
    expect(e.experiment).toBeNull();
  });

  it("the arm is a pure function of the anonId", () => {
    const id = deviceIn("short");
    expect(variantFor(experiment, id)).toBe("short");
    expect(variantFor({ ...experiment }, id)).toBe("short");
  });
});

describe("/admin consent counts (D-107)", () => {
  it("the consent events are accepted first-party and counted overall and per arm", async () => {
    const a = deviceIn("short");
    const b = deviceIn("long");
    const c = deviceIn("long");
    const ev = (...names: string[]) => names.map((event) => ({ event }));
    expect(
      (await beacon({ anonId: a, utm_campaign: "c-consent", events: ev("consent_shown", "consent_granted") })).status,
    ).toBe(204);
    await beacon({ anonId: b, utm_campaign: "c-consent", events: ev("consent_shown", "consent_denied") });
    await beacon({ anonId: c, utm_campaign: "c-consent", events: ev("consent_shown") });
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const e = await loadEconomics(db, {
      from: today,
      to: today,
      campaign: "c-consent",
      plans: [],
      steps: ["lp_view"],
      benchmarks: {},
      experiment,
    });
    expect(e.consent).toEqual({ shown: 3, granted: 1, denied: 1, noChoice: 1 });
    const arm = (v: string) => e.experiment?.variants.find((x) => x.variant === v)?.consent;
    expect(arm("short")).toEqual({ shown: 1, granted: 1, denied: 0, noChoice: 0 });
    expect(arm("long")).toEqual({ shown: 2, granted: 0, denied: 1, noChoice: 1 });
  });
});
