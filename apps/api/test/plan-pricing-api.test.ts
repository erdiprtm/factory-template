import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

// D-116: GET /api/pricing and checkout charge the founder price decided on the server, with a
// product config that turns it on (D-078). resetModules + doMock, as in telegram-bot.test.ts.
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: { plans: object[] } & Record<string, unknown> };
  return {
    ...real,
    config: {
      ...real.config,
      pricing: { founderPrice: true, tiers: {} },
      plans: [
        {
          id: "founder-api",
          label: "12 bulan",
          months: 12,
          priceIdr: 249000,
          bonusMonths: 1,
          founder: { priceIdr: 99000, limit: 1 },
        },
        { id: "plain-api", label: "6 bulan", months: 6, priceIdr: 149000, bonusMonths: 0 },
      ],
    },
  };
});

const { app } = await import("../src/index");
const { fakeProvider } = await import("../src/core/payments");
const { BASE, get, post, signInWithConsent } = await import("./helpers");

type Prices = { plans: { id: string; priceIdr: number; founder: { priceIdr: number; left: number } | null }[] };
const prices = async () => (await (await app.request(`${BASE}/api/pricing`, {}, env)).json()) as Prices;

describe("GET /api/pricing and checkout (D-116)", () => {
  it("public; the founder price while slots last, then the normal price; the body's amount is ignored", async () => {
    const res = await app.request(`${BASE}/api/pricing`, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await prices()).plans).toEqual([
      { id: "founder-api", priceIdr: 99000, founder: { priceIdr: 99000, left: 1 } },
      { id: "plain-api", priceIdr: 149000, founder: null },
    ]);

    const cookie = await signInWithConsent(`founder-${crypto.randomUUID()}@example.com`);
    // A client-sent amount is not part of the body: the server decides.
    const started = await post("/api/billing/checkout", cookie, { planId: "founder-api", amountIdr: 1 });
    expect(started.status).toBe(200);
    const { paymentId } = await started.json<{ paymentId: string }>();
    const hook = fakeProvider().pay(paymentId, `evt-${paymentId}`);
    expect((await app.request(hook.url, hook, env)).status).toBe(200);
    const status = await (await get(`/api/billing/status?paymentId=${paymentId}`, cookie)).json<{
      amountIdr: number;
      accessUntil: string;
    }>();
    expect(status.amountIdr).toBe(99000);
    // 12 months + 1 bonus month from now.
    const months = (new Date(status.accessUntil).getTime() - Date.now()) / (30.44 * 86_400_000);
    expect(Math.round(months)).toBe(13);

    // The one founder slot is used: back to the normal price.
    expect((await prices()).plans[0]).toEqual({ id: "founder-api", priceIdr: 249000, founder: null });
    const buyer = await signInWithConsent(`n-${crypto.randomUUID()}@example.com`);
    const next = await (await post("/api/billing/checkout", buyer, { planId: "founder-api" })).json<{
      paymentId: string;
    }>();
    const pending = await (await get(`/api/billing/status?paymentId=${next.paymentId}`, buyer)).json<{
      amountIdr: number;
    }>();
    expect(pending.amountIdr).toBe(249000);
  });
});
