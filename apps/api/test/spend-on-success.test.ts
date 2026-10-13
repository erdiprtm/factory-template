import { describe, expect, it } from "vitest";
import { BASE, CORE_LATER, call, signInWithConsent, startTrial } from "./helpers";

// D-056: a failed result never costs a free use; a real one costs exactly one, even under races.
const anon = () => crypto.randomUUID().replaceAll("-", "");
const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}-${crypto.randomUUID().slice(0, 4)}`;

async function consentDevice(anonId: string) {
  const { config } = await import("@factory/config/product");
  const { requiredConsents } = await import("@factory/core/consents");
  await call("/api/anonymous-consents", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-anon-id": anonId },
    body: JSON.stringify({ accept: requiredConsents(config.legal) }),
  });
}

const run = (headers: Record<string, string>, ok: boolean) =>
  call(CORE_LATER, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify({ ok }),
  });

describe("spend on success", () => {
  it("a visitor's failed attempts keep the free use; the first real result spends it", async () => {
    const anonId = anon();
    await consentDevice(anonId);
    const h = { "x-anon-id": anonId, "cf-connecting-ip": ip() };
    for (let i = 0; i < 3; i++) expect(await (await run(h, false)).json()).toEqual({ status: "unclear" });
    const first = await run(h, true);
    expect(await first.json()).toEqual({ status: "ok" });
    expect(first.headers.get("x-free-uses-left")).toBe("0");
    // Spent: the next request stops at the gate.
    const again = await run(h, true);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: "sign_up_required" });
  });

  it("concurrent requests can't double-spend the last free use", async () => {
    const anonId = anon();
    await consentDevice(anonId);
    const h = { "x-anon-id": anonId, "cf-connecting-ip": ip() };
    const results = await Promise.all(Array.from({ length: 6 }, () => run(h, true)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
  });

  it("a signed-in user: failures are free, each result spends one, then 402", async () => {
    const cookie = await signInWithConsent(`later-${crypto.randomUUID()}@example.com`);
    const h = { cookie, "cf-connecting-ip": ip() };
    expect((await run(h, false)).status).toBe(200);
    expect((await run(h, true)).headers.get("x-free-uses-left")).toBe("1");
    expect((await run(h, true)).headers.get("x-free-uses-left")).toBe("0");
    const over = await run(h, true);
    expect(over.status).toBe(402);
    expect(await over.json()).toEqual({ error: "payment_required", reason: "free_uses_used" });
  });

  it("paid access spends nothing", async () => {
    const cookie = await signInWithConsent(`later-paid-${crypto.randomUUID()}@example.com`);
    await startTrial(cookie);
    for (let i = 0; i < 4; i++) {
      const res = await run({ cookie, "cf-connecting-ip": ip() }, true);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-free-uses-left")).toBeNull();
    }
  });

  it("still needs the device's consent before an anonymous attempt", async () => {
    const res = await run({ "x-anon-id": anon(), "cf-connecting-ip": ip() }, true);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "consent_required" });
  });
});
