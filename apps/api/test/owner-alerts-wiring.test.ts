import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

// D-112: where owner alerts come from. A confirmed purchase and a rejected webhook call ownerAlert;
// the cron sends the summary only at its hour. The gates themselves: owner-alerts.test.ts.
const calls = vi.hoisted(() => ({ alerts: [] as [string, string][], telegram: [] as string[] }));
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return {
    ...real,
    config: {
      ...real.config,
      notifications: {
        telegram: { events: ["purchase", "renewal", "refund"], email: "masked", dailySummaryHourWib: 8 },
      },
    },
  };
});
vi.doMock("../src/core/notify", () => ({
  ownerAlert: async (_env: unknown, event: string, text: string) => {
    calls.alerts.push([event, text]);
  },
  ownerTelegram: () => ({ token: "t", chatId: "c" }),
}));
vi.doMock("@factory/core/notify", async (orig) => ({
  ...((await orig()) as object),
  sendTelegram: async (_cfg: unknown, text: string) => {
    calls.telegram.push(text);
    return true;
  },
}));

const { app } = await import("../src/index");
const { firstPlan, post, signInWithConsent } = await import("./helpers");
const { fakeProvider } = await import("../src/core/payments");
const { runScheduled } = await import("../src/core/cron");

describe("owner alert wiring", () => {
  it("a confirmed purchase pings once, with the buyer's email masked", async () => {
    calls.alerts = [];
    const email = `buyer-${crypto.randomUUID()}@example.com`;
    const cookie = await signInWithConsent(email);
    const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
      paymentId: string;
    }>();
    const hook = () => fakeProvider().pay(paymentId, `evt-${paymentId}`);
    const first = hook();
    await app.request(first.url, first, env);
    const replay = hook();
    await app.request(replay.url, replay, env);
    const purchases = calls.alerts.filter(([e]) => e === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.[1]).toContain(`Pembeli: ${email.slice(0, 2)}***@example.com`);
    expect(purchases[0]?.[1]).not.toContain(email);
    expect(purchases[0]?.[1]).toContain(paymentId);
  });

  it("a forged webhook pings webhook_rejected", async () => {
    calls.alerts = [];
    const forged = fakeProvider().webhook("pay_x", "paid", "evt-forged", "wrong");
    expect((await app.request(forged.url, forged, env)).status).toBe(401);
    expect(calls.alerts.map(([e]) => e)).toEqual(["webhook_rejected"]);
  });

  it("the cron sends the daily summary at its Jakarta hour only", async () => {
    calls.telegram = [];
    await runScheduled(env, new Date("2026-10-31T02:00:00Z")); // 09:00 WIB
    expect(calls.telegram).toEqual([]);
    await runScheduled(env, new Date("2026-10-31T01:05:00Z")); // 08:05 WIB
    expect(calls.telegram).toHaveLength(1);
    expect(calls.telegram[0]).toContain("2026-10-30");
  });
});
