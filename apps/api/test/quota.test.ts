import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { consumeFreeUse } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { CORE, get, post, signInWithConsent, startTrial } from "./helpers";

// Sell engine Module 5 (D-037): the first real result before the paywall, enforced server-side.
// Limits come from product.config.ts, so this holds in every product repo.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const me = async (cookie: string) =>
  (await get("/api/me", cookie)).json<{ freeUses: { limit: number; used: number } }>();

describe("free uses of the core action", () => {
  it("allows exactly funnel.freeUses, then answers 402 free_uses_used", async () => {
    const cookie = await signInWithConsent(uniqueEmail("quota"));
    const limit = config.funnel.freeUses;
    for (let i = 1; i <= limit; i++) {
      const res = await post(CORE, cookie, {});
      expect(res.status).toBe(200);
      expect(res.headers.get("x-free-uses-left")).toBe(String(limit - i));
    }
    const over = await post(CORE, cookie, {});
    expect(over.status).toBe(402);
    expect(await over.json()).toEqual({ error: "payment_required", reason: "free_uses_used" });
    expect((await me(cookie)).freeUses).toEqual({ limit, used: limit });
  });

  it("paid access doesn't spend free uses", async () => {
    const cookie = await signInWithConsent(uniqueEmail("quota-trial"));
    await startTrial(cookie);
    for (let i = 0; i < config.funnel.freeUses + 2; i++) expect((await post(CORE, cookie, {})).status).toBe(200);
    expect((await me(cookie)).freeUses.used).toBe(0);
  });

  it("needs a session", async () => {
    expect((await post(CORE, null, {})).status).toBe(401);
  });

  it("can't be exceeded by concurrent requests", async () => {
    const userId = `concurrent-${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeFreeUse(db, { userId, action: "core", limit: 3 })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(await consumeFreeUse(db, { userId, action: "core", limit: 0 })).toEqual({
      allowed: false,
      used: 0,
      left: 0,
    });
  });
});
