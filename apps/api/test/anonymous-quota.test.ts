import { env } from "cloudflare:workers";
import { claimAnonymousUses, freeUsesUsed } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { ANON_LIMITS, BASE, CORE_ANON, call, signInWithConsent } from "./helpers";

// Sell engine "pay for proof" (D-042): the first real result before signing up, server-enforced
// per device and per IP per day; the device's uses move to the account at signup.
const db = drizzle(env.DB, { schema });
const anon = () => crypto.randomUUID().replaceAll("-", "");
const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}-${crypto.randomUUID().slice(0, 4)}`;

const run = (headers: Record<string, string>) =>
  call(CORE_ANON, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: "{}",
  });

describe("anonymous free uses", () => {
  it("gives a device its anonymous uses, then asks it to sign up", async () => {
    const h = { "x-anon-id": anon(), "cf-connecting-ip": ip() };
    const first = await run(h);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-free-uses-left")).toBe("0");
    const again = await run(h);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: "sign_up_required" });
  });

  it("caps each IP per day, so new devices or private windows can't farm free uses", async () => {
    const sameIp = ip();
    expect((await run({ "x-anon-id": anon(), "cf-connecting-ip": sameIp })).status).toBe(200);
    expect((await run({ "x-anon-id": anon(), "cf-connecting-ip": sameIp })).status).toBe(200);
    const third = anon();
    expect((await run({ "x-anon-id": third, "cf-connecting-ip": sameIp })).status).toBe(401);
    // The refused device didn't lose its use: on another IP it still has one.
    expect((await run({ "x-anon-id": third, "cf-connecting-ip": ip() })).status).toBe(200);
  });

  it("needs a device id; with anonymous uses off it's a plain 401", async () => {
    expect((await run({ "cf-connecting-ip": ip() })).status).toBe(401);
    expect((await run({ "x-anon-id": "short", "cf-connecting-ip": ip() })).status).toBe(401);
  });

  it("moves the device's uses to the account at signup, so they can't be doubled", async () => {
    const anonId = anon();
    expect((await run({ "x-anon-id": anonId, "cf-connecting-ip": ip() })).status).toBe(200);
    const cookie = await signInWithConsent(`anon-claim-${crypto.randomUUID()}@example.com`);
    // The app sends the touch after sign-in; that claims the anonymous uses (here: 1 of 2 total).
    const me = await (await call("/api/me", { headers: { cookie } })).json<{ user: { id: string } }>();
    await claimAnonymousUses(db, {
      userId: me.user.id,
      anonId,
      action: ANON_LIMITS.coreAction,
      limit: ANON_LIMITS.freeUses,
    });
    expect(await freeUsesUsed(db, me.user.id, ANON_LIMITS.coreAction)).toBe(1);
    const signedIn = (n: number) => run({ cookie, "cf-connecting-ip": ip(), "x-request": String(n) });
    expect((await signedIn(1)).status).toBe(200);
    const over = await signedIn(2);
    expect(over.status).toBe(402);
    expect(await over.json()).toEqual({ error: "payment_required", reason: "free_uses_used" });
    // The device row is gone: a second claim adds nothing.
    expect(await claimAnonymousUses(db, { userId: me.user.id, anonId, action: ANON_LIMITS.coreAction, limit: 2 })).toBe(
      0,
    );
  });

  it("POST /api/attribution claims the device's uses for the product's core action", async () => {
    const anonId = anon();
    const cookie = await signInWithConsent(`anon-attr-${crypto.randomUUID()}@example.com`);
    const res = await call("/api/attribution", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: JSON.stringify({ anonId, firstSeenAt: Date.now() }),
    });
    expect(res.status).toBe(200);
  });
});
