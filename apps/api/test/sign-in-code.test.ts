import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { capturedEmails } from "@factory/core/email";
import { describe, expect, it } from "vitest";
import { SEND_LIMIT, signInCodeId } from "../src/core/auth";
import { app } from "../src/index";
import { call } from "./helpers";

// D-079: the sign-in email carries a 6-digit code next to the magic link. Someone who opened the
// link in an email app's browser types the code where they started. Runs only where it's on.
const on = config.auth.emailCode;
const json = { "content-type": "application/json" };
const fresh = () => `code-${crypto.randomUUID()}@example.com`;

async function requestEmail(email: string) {
  const res = await call("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  return { res, body: await res.text(), mail: capturedEmails().last(email) };
}
const codeOf = (text?: string) => text?.match(/\b(\d{6})\b/)?.[1];
const linkOf = (text?: string) => text?.match(/https?:\/\/\S+/)?.[0];
const withCode = (email: string, otp: string) =>
  call("/api/auth/sign-in/email-otp", { method: "POST", headers: json, body: JSON.stringify({ email, otp }) });
const sessionOf = (res: Response) => res.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/)?.[0];
const row = (identifier: string) =>
  env.DB.prepare("select value, expires_at from verification where identifier = ?")
    .bind(identifier)
    .first<{ value: string; expires_at: number }>();
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe.skipIf(!on)("sign-in code (D-079)", () => {
  it("one request sends one email with both the link and a 6-digit code", async () => {
    const email = fresh();
    const before = capturedEmails().sent.filter((m) => m.to === email).length;
    const { res, mail } = await requestEmail(email);
    expect(res.status).toBe(200);
    expect(capturedEmails().sent.filter((m) => m.to === email).length - before).toBe(1);
    expect(linkOf(mail?.text)).toContain("/api/auth/magic-link/verify?token=");
    const code = codeOf(mail?.text);
    expect(code).toMatch(/^\d{6}$/);
    expect(mail?.html).toContain(code as string);
  });

  it("the code signs in, in a request with no cookies at all", async () => {
    const email = fresh();
    const code = codeOf((await requestEmail(email)).mail?.text) as string;
    const res = await withCode(email, code);
    expect(res.status).toBe(200);
    const cookie = sessionOf(res);
    expect(cookie).toBeTruthy();
    const me = await (await call("/api/me", { headers: { cookie: cookie as string } })).json<{
      user: { email: string };
    }>();
    expect(me.user.email).toBe(email);
  });

  it("is stored hashed, never as the code itself", async () => {
    const email = fresh();
    const code = codeOf((await requestEmail(email)).mail?.text) as string;
    const stored = await row(signInCodeId(email));
    expect(stored?.value).toBeTruthy();
    expect(stored?.value).not.toContain(code);
  });

  it("three wrong codes end it: the right one is then refused too", async () => {
    const email = fresh();
    const code = codeOf((await requestEmail(email)).mail?.text) as string;
    for (let i = 0; i < 3; i++) expect((await withCode(email, wrong(code))).status).toBe(400);
    const res = await withCode(email, code);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("TOO_MANY_ATTEMPTS");
  });

  it("an expired code is refused", async () => {
    const email = fresh();
    const code = codeOf((await requestEmail(email)).mail?.text) as string;
    await env.DB.prepare("update verification set expires_at = ? where identifier = ?")
      .bind(Date.now() - 1000, signInCodeId(email))
      .run();
    const res = await withCode(email, code);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("OTP_EXPIRED");
  });

  it("the link used first makes the code invalid", async () => {
    const email = fresh();
    const { mail } = await requestEmail(email);
    const verify = await app.request(linkOf(mail?.text) as string, { redirect: "manual" }, env);
    expect(sessionOf(verify)).toBeTruthy();
    expect((await withCode(email, codeOf(mail?.text) as string)).status).toBe(400);
  });

  it("the code used first makes the link invalid", async () => {
    const email = fresh();
    const { mail } = await requestEmail(email);
    expect((await withCode(email, codeOf(mail?.text) as string)).status).toBe(200);
    const verify = await app.request(linkOf(mail?.text) as string, { redirect: "manual" }, env);
    expect(sessionOf(verify)).toBeUndefined();
  });

  it("a resend rotates the code: the old one stops working", async () => {
    const email = fresh();
    const first = codeOf((await requestEmail(email)).mail?.text) as string;
    const second = codeOf((await requestEmail(email)).mail?.text) as string;
    if (first !== second) expect((await withCode(email, first)).status).toBe(400);
    expect((await withCode(email, second)).status).toBe(200);
  });

  it("caps emails per address; over the cap the answer is the same and nothing is sent", async () => {
    const email = fresh();
    const answers: string[] = [];
    for (let i = 0; i < SEND_LIMIT; i++) answers.push((await requestEmail(email)).body);
    const sent = capturedEmails().sent.filter((m) => m.to === email).length;
    const over = await requestEmail(email);
    expect(over.res.status).toBe(200);
    expect(over.body).toBe(answers[0]);
    expect(capturedEmails().sent.filter((m) => m.to === email).length).toBe(sent);
  });

  it("a known and an unknown address get the same answer", async () => {
    const known = fresh();
    const code = codeOf((await requestEmail(known)).mail?.text) as string;
    expect((await withCode(known, code)).status).toBe(200);
    const a = await requestEmail(known);
    const b = await requestEmail(fresh());
    expect([a.res.status, a.body]).toEqual([b.res.status, b.body]);
  });

  it("only sign-in with a code is open: codes never come from the plugin's own send route", async () => {
    const res = await call("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: fresh(), type: "sign-in" }),
    });
    expect(res.status).toBe(404);
  });
});
