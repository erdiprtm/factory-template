import { env } from "cloudflare:workers";
import { capturedEmails } from "@factory/core/email";
import { app } from "../src/index";

export const BASE = "http://localhost";

export const call = (path: string, init: RequestInit = {}) => app.request(`${BASE}${path}`, init, env);

/** Signs in via magic link (captured email) and returns the session cookie. */
export async function signIn(email: string): Promise<string> {
  await call("/api/auth/sign-in/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  const link = capturedEmails()
    .last(email)
    ?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("no magic link captured");
  const verify = await app.request(link, { redirect: "manual" }, env);
  const token = verify.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/)?.[0];
  if (!token) throw new Error("no session cookie");
  return token;
}

/** Signed-in user who has accepted the required consents. */
export async function signInWithConsent(email: string): Promise<string> {
  const cookie = await signIn(email);
  await post("/api/consents", cookie, { accept: ["terms", "privacy"] });
  return cookie;
}

export const post = (path: string, cookie: string | null, body: unknown) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

export const get = (path: string, cookie: string | null) => call(path, { headers: cookie ? { cookie } : {} });
