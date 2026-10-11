import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { BASE, call, get, post, signInWithConsent } from "./helpers";

const denyAll = { limit: async () => ({ success: false }) };

describe("security headers", () => {
  it("API responses forbid framing, sniffing and page loads", async () => {
    const res = await call("/api/health");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("applies to auth and webhook routes too", async () => {
    const auth = await call("/api/auth/get-session");
    expect(auth.headers.get("x-content-type-options")).toBe("nosniff");
    const hook = await call("/api/webhooks/fake", { method: "POST", body: "{}" });
    expect(hook.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("input limits", () => {
  it("rejects bodies over 64 KB with 413", async () => {
    const res = await call("/api/consents", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ accept: ["terms"], pad: "x".repeat(70 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  it("billing status only accepts payment ids it issued", async () => {
    const cookie = await signInWithConsent(`sec-${crypto.randomUUID()}@example.com`);
    for (const id of ["", "x", "pay_' OR 1=1 --", `pay_${"a".repeat(33)}`]) {
      expect((await get(`/api/billing/status?paymentId=${encodeURIComponent(id)}`, cookie)).status).toBe(404);
    }
  });

  it("account deletion needs the exact confirmation word", async () => {
    const cookie = await signInWithConsent(`sec-${crypto.randomUUID()}@example.com`);
    for (const body of [null, {}, { confirm: "hapus" }, { confirm: ["HAPUS"] }]) {
      expect((await post("/api/account/delete", cookie, body)).status).toBe(400);
    }
  });
});

describe("rate limits", () => {
  it("limits checkout starts per user (10 per minute)", async () => {
    const cookie = await signInWithConsent(`sec-${crypto.randomUUID()}@example.com`);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await post("/api/billing/checkout", cookie, { planId: config.plans[0]?.id })).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    // Another user is unaffected.
    const other = await signInWithConsent(`sec-${crypto.randomUUID()}@example.com`);
    expect((await post("/api/billing/checkout", other, { planId: config.plans[0]?.id })).status).toBe(200);
  });

  it("answers 429 on webhooks when the limiter says no, before touching the payment", async () => {
    const res = await app.request(
      `${BASE}/api/webhooks/fake`,
      { method: "POST", headers: { "cf-connecting-ip": "198.51.100.9" }, body: "{}" },
      { ...env, WEBHOOK_LIMITER: denyAll },
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });
});
