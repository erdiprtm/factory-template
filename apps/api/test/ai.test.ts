import { env } from "cloudflare:workers";
import { mockProvider } from "@factory/core/ai";
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

  it("answers 503 on a feature-capped route when the product has no AI", async () => {
    const res = await scan({ "x-anon-id": anon() }, AI_OFF_ROUTE);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });
});
