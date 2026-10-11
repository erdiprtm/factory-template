import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index";

// Auth rate limiting is on for deployed environments (production/preview), stored in D1.
// Simulates a preview Worker; Resend is stubbed so no real email is sent.
describe("auth rate limit (deployed environments)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("blocks the 4th magic-link request per minute from one IP", async () => {
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.resend.com/"))
        return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
      return realFetch(input, init);
    });
    const previewEnv = {
      ...env,
      APP_ENV: "preview" as const,
      BETTER_AUTH_SECRET: "test-secret-for-rate-limit-only-0123456789abcdef",
      RESEND_API_KEY: "re_test_stub",
    };
    const send = () =>
      app.request(
        "http://localhost/api/auth/sign-in/magic-link",
        {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
          body: JSON.stringify({ email: `rl-${crypto.randomUUID()}@example.com`, callbackURL: "/" }),
        },
        previewEnv,
      );

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await send()).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });
});
