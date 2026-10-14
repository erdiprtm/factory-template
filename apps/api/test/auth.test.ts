import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { requiredConsents } from "@factory/core/consents";
import { capturedEmails } from "@factory/core/email";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

// Magic-link sign-in end to end, against real local D1. Emails are captured (APP_ENV=test).
const BASE = "http://localhost";
const call = (path: string, init: RequestInit = {}) => app.request(`${BASE}${path}`, init, env);

async function signIn(email: string): Promise<string> {
  const res = await call("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  expect(res.status).toBe(200);
  const mail = capturedEmails().last(email);
  expect(mail?.subject).toMatch(/Masuk ke/);
  // D-067: replies reach the product's contact address (no MAIL_REPLY_TO in tests).
  expect(mail?.replyTo).toBe(config.legal.contactEmail);
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toContain("/api/auth/magic-link/verify?token=");

  const verify = await app.request(link as string, { redirect: "manual" }, env);
  expect(verify.status).toBe(302);
  const cookie = verify.headers.get("set-cookie") ?? "";
  const token = cookie.match(/better-auth\.session_token=[^;]+/)?.[0];
  expect(token).toBeTruthy();
  return token as string;
}

describe("auth: magic link", () => {
  it("signs a new user in and reports pending consents", async () => {
    const cookie = await signIn(`new-${crypto.randomUUID()}@example.com`);
    const me = await (await call("/api/me", { headers: { cookie } })).json<{
      user: { email: string } | null;
      access: boolean;
      missingConsents: string[];
    }>();
    expect(me.user?.email).toMatch(/@example\.com$/);
    expect(me.access).toBe(false);
    expect(me.missingConsents).toEqual(requiredConsents(config.legal));
  });

  it("rejects a reused magic link", async () => {
    const email = `reuse-${crypto.randomUUID()}@example.com`;
    await signIn(email);
    const link = capturedEmails()
      .last(email)
      ?.text.match(/https?:\/\/\S+/)?.[0] as string;
    const again = await app.request(link, { redirect: "manual" }, env);
    expect(again.headers.get("set-cookie") ?? "").not.toMatch(/better-auth\.session_token=[^;]{10,}/);
  });

  it("refuses hosts outside AUTH_HOSTS", async () => {
    const res = await app.request(
      "http://evil.example/api/auth/sign-in/magic-link",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "x@example.com" }),
      },
      env,
    );
    expect(res.status).not.toBe(200);
  });
});

describe("consents endpoint", () => {
  it("requires a session", async () => {
    const res = await call("/api/consents", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ accept: ["terms", "privacy"] }),
    });
    expect(res.status).toBe(401);
  });

  it("requires every mandatory consent, then records them", async () => {
    const cookie = await signIn(`consent-${crypto.randomUUID()}@example.com`);
    const post = (accept: string[]) =>
      call("/api/consents", {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie },
        body: JSON.stringify({ accept }),
      });

    const partial = await post(["terms"]);
    expect(partial.status).toBe(400);
    expect(await partial.json()).toMatchObject({
      error: "consent_required",
      missingRequired: requiredConsents(config.legal).filter((t) => t !== "terms"),
    });

    expect((await post(requiredConsents(config.legal))).status).toBe(200);
    const me = await (await call("/api/me", { headers: { cookie } })).json<{ missingConsents: string[] }>();
    expect(me.missingConsents).toEqual([]);
  });

  it("reports a signed-out visitor", async () => {
    expect(await (await call("/api/me")).json()).toEqual({
      user: null,
      access: false,
      missingConsents: [],
      providers: { google: false },
      isAdmin: false,
      marketingConsent: false,
      freeUses: { limit: config.funnel.anonymousFreeUses, used: 0 },
    });
  });
});

// D-061: the Expo dev server's origin is trusted in local development only.
describe("dev app origin", () => {
  it("is trusted only when APP_ENV is development", async () => {
    const { devTrustedOrigins } = await import("../src/core/auth");
    expect(devTrustedOrigins({ APP_ENV: "development" })).toEqual(["http://localhost:8081", "http://127.0.0.1:8081"]);
    for (const env of ["test", "preview", "production"] as const)
      expect(devTrustedOrigins({ APP_ENV: env })).toEqual([]);
  });

  it("is rejected outside development (here: tests)", async () => {
    const res = await call("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8081" },
      body: JSON.stringify({ email: `origin-${crypto.randomUUID()}@example.com`, callbackURL: "/" }),
    });
    expect(res.status).toBe(403);
  });
});
