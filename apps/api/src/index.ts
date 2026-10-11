import { config } from "@factory/config/product";
import { missingConsents, recordConsents, requiredConsents } from "@factory/core/consents";
import { hasAccess } from "@factory/core/entitlements";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { type AuthEnv, getAuth } from "./core/auth";
import { requireSession, type SessionVariables, sessionMiddleware } from "./core/session";

// Bindings are typed explicitly (not via worker-configuration.d.ts globals) so the app package
// can type-check the RPC client against this source without pulling in Worker ambient types.
export type Bindings = AuthEnv & {
  COMMIT_SHA: string;
  CF_VERSION_METADATA: { id: string; tag: string; timestamp: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>();

// Only local dev needs CORS: Expo's dev server (:8081) calls wrangler dev (:8787).
// Deployed, the app and API share one origin.
app.use(
  "/api/*",
  cors({
    credentials: true,
    origin: (origin, c) => {
      const local = new URL(c.req.url).hostname === "localhost";
      return local && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : null;
    },
  }),
);

// Better Auth: magic link, Google, sessions. Rate-limited inside (D1-backed).
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

const consentBody = z.object({ accept: z.array(z.enum(["terms", "privacy", "sensitive_data", "marketing"])) });

const routes = app
  .basePath("/api")
  .get("/health", (c) =>
    c.json({
      status: "ok" as const,
      env: c.env.APP_ENV,
      commit: c.env.COMMIT_SHA,
      version: c.env.CF_VERSION_METADATA.id,
    }),
  )
  .use("/me", sessionMiddleware)
  .get("/me", async (c) => {
    const user = c.get("user");
    const providers = { google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) };
    if (!user) return c.json({ user: null, access: false, missingConsents: [] as string[], providers });
    const db = drizzle(c.env.DB, { schema });
    const required = requiredConsents(config.legal);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      access: await hasAccess(db, user.id),
      missingConsents: (await missingConsents(db, user.id, required)) as string[],
      providers,
    });
  })
  .use("/consents", sessionMiddleware, requireSession)
  .post("/consents", async (c) => {
    const parsed = consentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const required = requiredConsents(config.legal);
    const missingRequired = required.filter((t) => !parsed.data.accept.includes(t));
    if (missingRequired.length > 0) return c.json({ error: "consent_required" as const, missingRequired }, 400);
    const db = drizzle(c.env.DB, { schema });
    await recordConsents(db, c.get("user").id, parsed.data.accept);
    return c.json({ ok: true as const });
  });

export type AppType = typeof routes;
export default app;
