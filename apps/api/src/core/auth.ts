import { emailProvider } from "@factory/core/email";
import { magicLinkEmail } from "@factory/core/email/templates";
import { authSchema } from "@factory/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzle } from "drizzle-orm/d1";
import product from "../../../../product.config";

// The D1 binding type, taken from drizzle so this file needs no Worker ambient types (D-013).
export type D1 = Parameters<typeof drizzle>[0];

export type AuthEnv = {
  APP_ENV: "production" | "preview" | "development" | "test";
  DB: D1;
  /** Comma-separated hosts this Worker answers on, e.g. "app.example.com,*-app-preview.sub.workers.dev". */
  AUTH_HOSTS: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
};

// Only for local dev and tests. Deployed Workers must have the BETTER_AUTH_SECRET secret.
const DEV_SECRET = "dev-only-secret-not-for-deployed-environments-0123456789";

function buildAuth(env: AuthEnv) {
  const local = env.APP_ENV === "development" || env.APP_ENV === "test";
  const secret = env.BETTER_AUTH_SECRET ?? (local ? DEV_SECRET : undefined);
  if (!secret) throw new Error(`BETTER_AUTH_SECRET is not set for APP_ENV=${env.APP_ENV}`);

  return betterAuth({
    appName: product.name,
    basePath: "/api/auth",
    // Production, every preview alias and localhost share one config: the request host is used
    // only if it's in AUTH_HOSTS (set per environment in wrangler.jsonc); anything else is rejected.
    baseURL: {
      allowedHosts: env.AUTH_HOSTS.split(",").map((h) => h.trim()),
      protocol: local ? "http" : "https",
    },
    secret,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema: authSchema }),
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    // Must be explicit: the default follows NODE_ENV, which Workers don't set. Stored in D1
    // because isolates don't share memory. On for deployed environments only, so local dev,
    // tests and E2E don't trip it (test/rate-limit.test.ts proves it works when deployed).
    rateLimit: {
      enabled: !local,
      storage: "database",
      customRules: {
        "/sign-in/magic-link": { window: 60, max: 3 },
        "/magic-link/verify": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              prompt: "select_account",
            },
          }
        : {},
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          await emailProvider(env).send(magicLinkEmail(email, url, product.name, product.locale.default));
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];

// One instance per isolate (env is stable within an isolate); construction does no I/O.
let cached: { env: AuthEnv; auth: Auth } | undefined;
export function getAuth(env: AuthEnv): Auth {
  if (cached?.env !== env) cached = { env, auth: buildAuth(env) };
  return cached.auth;
}
