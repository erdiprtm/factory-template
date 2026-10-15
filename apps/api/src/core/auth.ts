import { emailProvider } from "@factory/core/email";
import { magicLinkEmail } from "@factory/core/email/templates";
import { authSchema } from "@factory/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
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
  /** Reply-To on every email (D-067). Unset = legal.contactEmail from product.config.ts. */
  MAIL_REPLY_TO?: string;
};

// Only for local dev and tests. Deployed Workers must have the BETTER_AUTH_SECRET secret.
const DEV_SECRET = "dev-only-secret-not-for-deployed-environments-0123456789";

/**
 * Extra origins Better Auth trusts (D-061): only in local development, the Expo dev server (:8081)
 * that `pnpm dev` runs next to wrangler dev (:8787). Never in preview or production.
 */
export function devTrustedOrigins(env: Pick<AuthEnv, "APP_ENV">): string[] {
  return env.APP_ENV === "development" ? ["http://localhost:8081", "http://127.0.0.1:8081"] : [];
}

// ---- Sign-in code (D-079) ---------------------------------------------------------------------
// The magic-link email also carries a 6-digit code (Better Auth's email-otp plugin, "sign-in" type),
// so someone who opened the link in an email app's browser can type the code where they started.
// One request, one email: the code is created in the magic-link send path. Using either one ends
// the other (session hook below). Codes are stored hashed, last 5 minutes and allow 3 attempts.

/** The email-otp plugin's verification identifier for a sign-in code (its toOTPIdentifier). */
export const signInCodeId = (email: string) => `sign-in-otp-${email.toLowerCase()}`;
/** Our own row pairing an email with its latest magic link (the link's stored, hashed token). */
const linkPairId = (email: string) => `sign-in-link-${email.toLowerCase()}`;
/** Our own row counting sign-in emails per address (SEND_LIMIT per SEND_WINDOW_MIN). */
const sendCountId = (email: string) => `sign-in-sends-${email.toLowerCase()}`;
export const SEND_LIMIT = 5;
const CODE_MINUTES = 5;

/** Six random digits, uniformly (rejection sampling, no modulo bias). */
function newSignInCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf);
  while ((buf[0] as number) >= limit);
  return String((buf[0] as number) % 1_000_000).padStart(6, "0");
}
const SEND_WINDOW_MIN = 15;

/** SHA-256, base64url without padding: how magic-link stores its token with storeToken "hashed". */
async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

// Every email-otp route except signing in with a code: codes only come from the magic-link path.
const UNUSED_OTP_PATHS = [
  "/email-otp/send-verification-otp",
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/forget-password/email-otp",
];

function buildAuth(env: AuthEnv) {
  const local = env.APP_ENV === "development" || env.APP_ENV === "test";
  const secret = env.BETTER_AUTH_SECRET ?? (local ? DEV_SECRET : undefined);
  if (!secret) throw new Error(`BETTER_AUTH_SECRET is not set for APP_ENV=${env.APP_ENV}`);

  const emailCode = product.auth.emailCode;
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
    trustedOrigins: devTrustedOrigins(env),
    disabledPaths: emailCode ? UNUSED_OTP_PATHS : [],
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
        // "/sign-in/email-otp" keeps the email-otp plugin's own rule: 3 per minute per IP (D-079).
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
    databaseHooks: {
      session: {
        create: {
          // Whichever was used first, the link or the code, the other one stops working (D-079).
          after: async (session, ctx) => {
            if (!emailCode || !ctx) return;
            const user = await ctx.context.internalAdapter.findUserById(session.userId);
            if (!user) return;
            const adapter = ctx.context.internalAdapter;
            const pair = await adapter.findVerificationValue(linkPairId(user.email));
            if (pair) await adapter.deleteVerificationByIdentifier(pair.value);
            await adapter.deleteVerificationByIdentifier(linkPairId(user.email));
            await adapter.deleteVerificationByIdentifier(signInCodeId(user.email));
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, token }, ctx) => {
          if (!ctx) throw new Error("sendMagicLink without a request context");
          const adapter = ctx.context.internalAdapter;
          // Per address, on top of Better Auth's per-IP limit on this route. Over it, nothing is sent
          // and the answer stays the same (status: true), so this can't probe which emails exist.
          const count = await adapter.findVerificationValue(sendCountId(email));
          const sent = count && count.expiresAt > new Date() ? Number(count.value) : 0;
          if (sent >= SEND_LIMIT) return;
          await adapter.deleteVerificationByIdentifier(sendCountId(email));
          await adapter.createVerificationValue({
            identifier: sendCountId(email),
            value: String(sent + 1),
            expiresAt: count && sent > 0 ? count.expiresAt : new Date(Date.now() + SEND_WINDOW_MIN * 60_000),
          });

          let code: string | undefined;
          if (emailCode) {
            // One active code per address: a resend rotates it. Paired with this link.
            await adapter.deleteVerificationByIdentifier(signInCodeId(email));
            code = newSignInCode();
            await adapter.createVerificationValue({
              identifier: signInCodeId(email),
              // The plugin's own format for storeOTP "hashed": "<sha256 base64url>:<attempts>".
              // test/sign-in-code.test.ts signs in with it, so a plugin change can't go unnoticed.
              value: `${await hashToken(code)}:0`,
              expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
            });
            await adapter.deleteVerificationByIdentifier(linkPairId(email));
            await adapter.createVerificationValue({
              identifier: linkPairId(email),
              value: await hashToken(token),
              expiresAt: new Date(Date.now() + 15 * 60_000),
            });
          }
          // Awaited: every address gets an email (sign-up is open), so the time taken says nothing
          // about whether an account exists, and a send failure still reaches the visitor (D-079).
          await emailProvider(env, product.legal.contactEmail).send(
            magicLinkEmail(
              email,
              url,
              product.name,
              product.locale.default,
              code,
              product.brand.tokens.colors.light.primary,
            ),
          );
          if (code && env.APP_ENV === "development") console.log(`[dev sign-in code] to=${email} code=${code}`);
        },
      }),
      ...(emailCode
        ? [
            emailOTP({
              otpLength: 6,
              expiresIn: CODE_MINUTES * 60,
              allowedAttempts: 3,
              storeOTP: "hashed",
              // Codes are created with the magic link (above); this plugin never sends on its own.
              sendVerificationOTP: async () => {},
            }),
          ]
        : []),
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
