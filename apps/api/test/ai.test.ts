import { env } from "cloudflare:workers";
import { type AiProvider, mockProvider } from "@factory/core/ai";
import {
  ANONYMOUS_AI_USAGE_DAYS,
  aiCallsSince,
  claimAnonymousAiUsage,
  deleteAiUsage,
  purgeAnonymousAiUsage,
  recordAiUsage,
} from "@factory/core/ai/usage";
import { anonKey } from "@factory/core/quota";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { aiProvider } from "../src/core/ai";
import {
  AI_BUDGET,
  AI_FEATURE_CAPS,
  AI_OFF_ROUTE,
  AI_PHOTO_ROUTE,
  AI_ROUTE,
  AI_TEXT_ROUTE,
  BASE,
  call,
  signInWithConsent,
} from "./helpers";

// AI calls (D-045): a cost cap per account or device and for all visitors, every call logged.
const db = drizzle(env.DB, { schema });
const anon = () => crypto.randomUUID().replaceAll("-", "");
const ip = () => `192.0.2.${Math.floor(Math.random() * 250)}-${crypto.randomUUID().slice(0, 4)}`;
const since = () => new Date(Date.now() - 86_400_000);

const scan = (headers: Record<string, string>, route = AI_ROUTE) =>
  call(route, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": ip(), ...headers },
    body: "{}",
  });

describe("AI cost cap", () => {
  it("logs each call and caps an account per 24 h before it spends a free use", async () => {
    const cookie = await signInWithConsent(`ai-${crypto.randomUUID()}@example.com`);
    const me = await (await call("/api/me", { headers: { cookie } })).json<{ user: { id: string } }>();
    for (let i = 0; i < AI_BUDGET.perUserPerDay; i++) {
      const ok = await scan({ cookie });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ output: { label: "nasi putih" } });
    }
    const capped = await scan({ cookie });
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: "ai_limit" });
    expect(await aiCallsSince(db, me.user.id, since())).toBe(AI_BUDGET.perUserPerDay);
  });

  it("caps all visitors together, then moves a visitor's calls to the account at signup", async () => {
    const first = anon();
    expect((await scan({ "x-anon-id": first })).status).toBe(200);
    expect((await scan({ "x-anon-id": anon() })).status).toBe(200);
    expect((await scan({ "x-anon-id": anon() })).status).toBe(200);
    const busy = await scan({ "x-anon-id": anon() });
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({ error: "ai_busy" });

    const cookie = await signInWithConsent(`ai-claim-${crypto.randomUUID()}@example.com`);
    const me = await (await call("/api/me", { headers: { cookie } })).json<{ user: { id: string } }>();
    await claimAnonymousAiUsage(db, me.user.id, first);
    expect(await aiCallsSince(db, me.user.id, since())).toBe(1);
    expect(await aiCallsSince(db, anonKey(first), since())).toBe(0);
  });

  it("caps one feature on its own while all features share the daily cap (D-050)", async () => {
    const cookie = await signInWithConsent(`ai-feature-${crypto.randomUUID()}@example.com`);
    const me = await (await call("/api/me", { headers: { cookie } })).json<{ user: { id: string } }>();
    expect((await scan({ cookie }, AI_PHOTO_ROUTE)).status).toBe(200);
    const photoCapped = await scan({ cookie }, AI_PHOTO_ROUTE);
    expect(photoCapped.status).toBe(429);
    expect(await photoCapped.json()).toEqual({ error: "ai_limit" });
    // Typed text still works until the shared cap (3 calls, the photo scan included).
    expect((await scan({ cookie }, AI_TEXT_ROUTE)).status).toBe(200);
    expect((await scan({ cookie }, AI_TEXT_ROUTE)).status).toBe(200);
    expect((await scan({ cookie }, AI_TEXT_ROUTE)).status).toBe(429);
    expect(await aiCallsSince(db, me.user.id, since(), "test_photo")).toBe(AI_FEATURE_CAPS.photoPerUserPerDay);
    expect(await aiCallsSince(db, me.user.id, since(), "test_text")).toBe(2);
    expect(await aiCallsSince(db, me.user.id, since())).toBe(AI_FEATURE_CAPS.perUserPerDay);
  });

  it("drops visitors' rows after the retention period and an account's rows on deletion", async () => {
    const result = await mockProvider(() => ({})).json({ system: "", text: "", schema: { name: "t", schema: {} } });
    const old = anonKey(anon());
    const now = new Date();
    await recordAiUsage(
      db,
      { userId: old, feature: "t", result },
      new Date(now.getTime() - (ANONYMOUS_AI_USAGE_DAYS + 1) * 86_400_000),
    );
    await recordAiUsage(db, { userId: "user-to-delete", feature: "t", result }, now);
    await purgeAnonymousAiUsage(db, now);
    expect(await aiCallsSince(db, old, new Date(0))).toBe(0);
    await deleteAiUsage(db, "user-to-delete");
    expect(await aiCallsSince(db, "user-to-delete", new Date(0))).toBe(0);
  });
});

describe("AI provider choice", () => {
  const ai = { model: "gpt-6-luna", tier: "default" as const };
  const mock = () => ({});
  it("uses OpenAI with a key, the mock without one outside production, and nothing in production", () => {
    expect(aiProvider({ APP_ENV: "production", OPENAI_API_KEY: "sk-x" }, mock, ai)?.name).toBe("openai");
    expect(aiProvider({ APP_ENV: "development" }, mock, ai)?.name).toBe("mock");
    expect(aiProvider({ APP_ENV: "preview" }, mock, ai)?.name).toBe("mock");
    expect(aiProvider({ APP_ENV: "production" }, mock, ai)).toBeNull();
    expect(aiProvider({ APP_ENV: "development", OPENAI_API_KEY: "sk-x" }, mock, null)).toBeNull();
  });

  // OpenRouter (D-083) and Gemini (D-084): the same rule, each with its own key only.
  const openrouter = {
    provider: "openrouter" as const,
    model: "google/gemini-3.8-flash",
    fallbackModels: [],
    routing: { requireParameters: true, dataCollection: "deny" as const, zdr: true },
    prices: {},
    tier: "default" as const,
    perUserPerDay: 20,
    anonymousPerDay: 300,
  };
  const gemini = {
    provider: "gemini" as const,
    model: "gemini-3.8-flash",
    tier: "default" as const,
    perUserPerDay: 20,
    anonymousPerDay: 300,
  };

  it("uses OpenRouter or Gemini with their own key, the mock without it outside production, nothing in production", () => {
    expect(aiProvider({ APP_ENV: "production", OPENROUTER_API_KEY: "or-x" }, mock, openrouter)?.name).toBe(
      "openrouter",
    );
    expect(aiProvider({ APP_ENV: "production", GEMINI_API_KEY: "g-x" }, mock, gemini)?.name).toBe("gemini");
    for (const ai of [openrouter, gemini]) {
      expect(aiProvider({ APP_ENV: "preview" }, mock, ai)?.name).toBe("mock");
      expect(aiProvider({ APP_ENV: "development" }, mock, ai)?.name).toBe("mock");
      expect(aiProvider({ APP_ENV: "production" }, mock, ai)).toBeNull();
      // Another provider's key never stands in.
      expect(aiProvider({ APP_ENV: "production", OPENAI_API_KEY: "sk-x" }, mock, ai)).toBeNull();
    }
    expect(aiProvider({ APP_ENV: "production", GEMINI_API_KEY: "g-x" }, mock, ai)).toBeNull();
  });

  it("builds the configured provider with AI_MODEL and an injected fetch, and logs its cost per call", async () => {
    const urls: string[] = [];
    const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(url));
      const model = JSON.parse(String(init?.body)).model;
      return new Response(
        JSON.stringify({
          model,
          choices: [{ finish_reason: "stop", message: { content: '{"label":"nasi"}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000321 },
        }),
      );
    }) as typeof globalThis.fetch;
    const p = aiProvider(
      { APP_ENV: "production", OPENROUTER_API_KEY: "or-x", AI_MODEL: "openai/gpt-6-luna" },
      mock,
      openrouter,
      { fetch },
    );
    const req = { system: "s", text: "t", schema: { name: "t", schema: { type: "object" } } };
    const user = `user-${crypto.randomUUID()}`;
    for (let i = 0; i < 2; i++) {
      const result = await (p as AiProvider).json(req);
      expect(result).toMatchObject({ ok: true, model: "openai/gpt-6-luna", costMicroUsd: 321 });
      await recordAiUsage(db, { userId: user, feature: "or_test", result });
    }
    expect(urls).toEqual(Array(2).fill("https://openrouter.ai/api/v1/chat/completions"));
    expect(await aiCallsSince(db, user, since())).toBe(2);
    const rows = await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, user));
    expect(rows.map((r) => r.costMicroUsd)).toEqual([321, 321]);
  });

  it("answers 503 on a feature-capped route when the product has no AI", async () => {
    const res = await scan({ "x-anon-id": anon() }, AI_OFF_ROUTE);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });
});
