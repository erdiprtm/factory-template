import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { capturedEmails } from "@factory/core/email";
import { requireAccess } from "../src/core/access";
import { sessionMiddleware } from "../src/core/session";
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

// Tests read plans from product.config.ts, so they pass in every product repo (D-028).
type Plan = (typeof config.plans)[number];
// The schema requires at least one plan.
export const firstPlan = config.plans[0] as Plan;
export const lastPlan = (config.plans[config.plans.length - 1] ?? firstPlan) as Plan;

// A paid route that exists only in tests, behind the real sessionMiddleware + requireAccess.
// Template tests use it instead of the example feature, which products delete (D-032).
export const PAID = "/api/__test/paid";
app.get(PAID, sessionMiddleware, requireAccess, (c) => c.json({ ok: true as const }));
