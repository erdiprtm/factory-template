import { env } from "cloudflare:workers";
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
    expect(me.missingConsents).toEqual(["terms", "privacy"]);
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
    expect(await partial.json()).toMatchObject({ error: "consent_required", missingRequired: ["privacy"] });

    expect((await post(["terms", "privacy"])).status).toBe(200);
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
    });
  });
});
