import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

// D-114: the owner's two-way Telegram bot, with a product config that turns commands on (D-078).
// resetModules + doMock: a hoisted vi.mock didn't reach the API's own imports in the workers pool.
const tg = vi.hoisted(() => ({ calls: [] as [string, unknown][] }));
vi.resetModules();
vi.doMock("@factory/config/product", async (orig) => {
  const real = (await orig()) as { config: Record<string, unknown> };
  return {
    ...real,
    config: {
      ...real.config,
      notifications: {
        telegram: { events: ["purchase"], email: "masked", dailySummaryHourWib: null, commands: true },
      },
    },
  };
});
vi.doMock("@factory/core/notify", async (orig) => ({
  ...((await orig()) as object),
  telegramCall: async (_token: string, method: string, body: unknown) => {
    tg.calls.push([method, body]);
    return { ok: true };
  },
}));

const { app } = await import("../src/index");
const { BASE, signInWithConsent } = await import("./helpers");

const bot = {
  ...env,
  TELEGRAM_BOT_TOKEN: "123:ABC",
  TELEGRAM_CHAT_ID: "42",
  TELEGRAM_WEBHOOK_SECRET: "s3cret-Token_1",
};
const update = (chat: number, text: string) => ({ update_id: 1, message: { message_id: 1, chat: { id: chat }, text } });
const hook = (body: unknown, secret: string | null = "s3cret-Token_1", e: object = bot) =>
  app.request(
    `${BASE}/api/telegram/webhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
      body: JSON.stringify(body),
    },
    e,
  );

describe("POST /api/telegram/webhook", () => {
  it("404 without the secrets: the route doesn't exist for a product that didn't connect a bot", async () => {
    expect((await hook(update(42, "/bantuan"), "s3cret-Token_1", env)).status).toBe(404);
  });

  it("401 for a wrong or missing secret", async () => {
    expect((await hook(update(42, "/bantuan"), "wrong")).status).toBe(401);
    expect((await hook(update(42, "/bantuan"), null)).status).toBe(401);
  });

  it("another chat, or plain text: 200 and silence", async () => {
    for (const res of [await hook(update(7, "/minggu")), await hook(update(42, "halo"))]) {
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("");
    }
  });

  it("the owner gets answers in the response, as a sendMessage to their chat", async () => {
    const help = await (await hook(update(42, "/bantuan"))).json<{ method: string; chat_id: string; text: string }>();
    expect(help).toMatchObject({ method: "sendMessage", chat_id: "42" });
    expect(help.text).toContain("/hari_ini");
    for (const [cmd, part] of [
      ["/hari_ini", "hari ini"],
      ["/minggu", "7 hari"],
      ["/bulan", "30 hari"],
      ["/funnel", "funnel 7 hari"],
      ["/sumber", "sumber 7 hari"],
      ["/terakhir", "pembayaran terakhir"],
    ] as const) {
      const r = await (await hook(update(42, cmd))).json<{ text: string }>();
      expect(r.text, cmd).toContain(part);
    }
  });

  it("never shows a full email in /terakhir", async () => {
    const r = await (await hook(update(42, "/terakhir"))).json<{ text: string }>();
    expect(r.text).not.toMatch(/[a-z0-9]{3,}@example\.com/);
  });
});

describe("POST /api/admin/telegram/connect", () => {
  it("names the missing secrets; connected, it sets the webhook and the owner's command menu", async () => {
    const admin = await signInWithConsent("admin@example.com");
    const call = (e: object) =>
      app.request(`${BASE}/api/admin/telegram/connect`, { method: "POST", headers: { cookie: admin } }, e);
    const missing = await call(env);
    expect(missing.status).toBe(409);
    expect(await missing.json()).toMatchObject({
      missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET"],
    });
    tg.calls = [];
    expect((await call(bot)).status).toBe(200);
    expect(tg.calls.map(([m]) => m)).toEqual(["setWebhook", "setMyCommands"]);
    expect(tg.calls[0]?.[1]).toMatchObject({
      url: `${BASE}/api/telegram/webhook`,
      secret_token: "s3cret-Token_1",
      allowed_updates: ["message"],
    });
    expect(tg.calls[1]?.[1]).toMatchObject({ scope: { type: "chat", chat_id: "42" } });
  });
});
