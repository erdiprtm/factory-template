import { env } from "cloudflare:workers";
import { funnelEvents, schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

// D-112: owner alerts on Telegram. A product config that turns them on (the template's is off, D-078).
// resetModules + doMock: a hoisted vi.mock didn't reach the API's own imports in the workers pool.
const sent = vi.hoisted(() => ({ messages: [] as string[] }));
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return {
    ...real,
    config: {
      ...real.config,
      notifications: {
        telegram: {
          events: ["purchase", "renewal", "refund", "webhook_rejected"],
          email: "masked",
          dailySummaryHourWib: 8,
        },
      },
    },
  };
});
vi.doMock("@factory/core/notify", async (orig) => ({
  ...((await orig()) as object),
  sendTelegram: async (_cfg: unknown, text: string) => {
    sent.messages.push(text);
    return true;
  },
}));

const { ownerAlert, ownerTelegram } = await import("../src/core/notify");
const { loadDailySummary } = await import("@factory/core/notify/summary");

const live = { APP_ENV: "production", TELEGRAM_BOT_TOKEN: "123:ABC", TELEGRAM_CHAT_ID: "42" };

describe("ownerAlert gates", () => {
  it("sends only with both secrets, outside dev and tests", async () => {
    expect(ownerTelegram(live)).toEqual({ token: "123:ABC", chatId: "42" });
    expect(ownerTelegram({ ...live, TELEGRAM_CHAT_ID: undefined })).toBeNull();
    expect(ownerTelegram({ ...live, APP_ENV: "test" })).toBeNull();
    expect(ownerTelegram({ ...live, APP_ENV: "development" })).toBeNull();
    sent.messages = [];
    await ownerAlert({ ...live, TELEGRAM_BOT_TOKEN: undefined }, "purchase", "no");
    await ownerAlert(live, "purchase", "yes");
    expect(sent.messages).toEqual(["yes"]);
  });

  it("a rejected webhook pings at most once per 10 minutes", async () => {
    sent.messages = [];
    const t = Date.now();
    await ownerAlert(live, "webhook_rejected", "a", t);
    await ownerAlert(live, "webhook_rejected", "b", t + 60_000);
    await ownerAlert(live, "webhook_rejected", "c", t + 11 * 60_000);
    expect(sent.messages).toEqual(["a", "c"]);
  });
});

describe("daily summary from D1", () => {
  it("counts yesterday's money events and the quiz → first result step", async () => {
    const db = drizzle(env.DB, { schema });
    const day = "2026-01-15"; // a fixed past day, so other tests' events don't count
    const at = new Date(Date.parse(`${day}T05:00:00Z`)); // noon in Jakarta
    const row = (event: string, anonId: string, valueIdr: number | null = null) => ({
      id: crypto.randomUUID(),
      event,
      anonId,
      userId: null,
      step: null,
      utmSource: null,
      utmCampaign: null,
      valueIdr,
      experiment: null,
      variant: null,
      createdAt: at,
    });
    await db
      .insert(funnelEvents)
      .values([
        row("purchase", "a", 249000),
        row("renewal", "b", 149000),
        row("refund", "c", 149000),
        row("quiz_start", "d"),
        row("quiz_start", "d"),
        row("quiz_start", "e"),
        row("first_result", "d"),
      ]);
    expect(await loadDailySummary(db, day)).toEqual({
      day,
      purchases: 1,
      renewals: 1,
      revenueIdr: 398000,
      refunds: 1,
      quizStarts: 2,
      firstResults: 1,
    });
  });
});
