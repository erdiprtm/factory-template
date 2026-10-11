import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import { getAuth, type SessionUser } from "./auth";

export type SessionVariables = { user: SessionUser | null };

/**
 * Resolves the session through Better Auth's own /get-session endpoint (in-process, no network).
 * With a dynamic baseURL, direct `auth.api.getSession` calls can't resolve the host and return
 * null, while the handler path resolves it from the request URL exactly like browser requests.
 */
async function readSessionUser(env: Bindings, request: Request): Promise<SessionUser | null> {
  // Build auth first, so a missing BETTER_AUTH_SECRET fails loudly (and the smoke test catches it).
  const auth = getAuth(env);
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const url = new URL("/api/auth/get-session", request.url);
  const res = await auth.handler(new Request(url, { headers: { cookie } }));
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: SessionUser } | null;
  return body?.user ?? null;
}

/** Reads the session cookie (or a native client's cookie header) once per request. */
export const sessionMiddleware = createMiddleware<{ Bindings: Bindings; Variables: SessionVariables }>(
  async (c, next) => {
    c.set("user", await readSessionUser(c.env, c.req.raw));
    await next();
  },
);

/** 401 unless signed in. Use on every endpoint that touches a user's data. */
export const requireSession = createMiddleware<{
  Bindings: Bindings;
  Variables: { user: SessionUser };
}>(async (c, next) => {
  if (!c.get("user")) return c.json({ error: "unauthorized" as const }, 401);
  await next();
});
