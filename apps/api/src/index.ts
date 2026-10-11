import { Hono } from "hono";
import { cors } from "hono/cors";

// Bindings are typed explicitly (not via worker-configuration.d.ts globals) so the app package
// can type-check the RPC client against this source without pulling in Worker ambient types.
export type Bindings = {
  APP_ENV: "production" | "preview" | "development";
  COMMIT_SHA: string;
  CF_VERSION_METADATA: { id: string; tag: string; timestamp: string };
};

const app = new Hono<{ Bindings: Bindings }>();

// Only local dev needs CORS: Expo's dev server (:8081) calls wrangler dev (:8787).
// Deployed, the app and API share one origin.
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const local = new URL(c.req.url).hostname === "localhost";
      return local && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : null;
    },
  }),
);

const routes = app.basePath("/api").get("/health", (c) =>
  c.json({
    status: "ok" as const,
    env: c.env.APP_ENV,
    commit: c.env.COMMIT_SHA,
    version: c.env.CF_VERSION_METADATA.id,
  }),
);

export type AppType = typeof routes;
export default app;
