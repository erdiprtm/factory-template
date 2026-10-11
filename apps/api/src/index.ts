import { config } from "@factory/config/product";
import { deleteUserData, exportUserData, subscriptionSummary } from "@factory/core/account";
import { isAdminEmail } from "@factory/core/admin";
import { handleWebhook, paymentStatus, startCheckout } from "@factory/core/billing";
import { missingConsents, recordConsents, requiredConsents } from "@factory/core/consents";
import { capturedDevEmails, emailProvider } from "@factory/core/email";
import { receiptEmail } from "@factory/core/email/templates";
import { grantTrial, hasAccess } from "@factory/core/entitlements";
import { payments, schema } from "@factory/db";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { adminRoutes } from "./core/admin";
import { type AnalyticsEnv, serverAnalytics } from "./core/analytics";
import { type AuthEnv, getAuth } from "./core/auth";
import { runScheduled } from "./core/cron";
import { captureError, withMonitoring } from "./core/monitoring";
import { configuredProvider, fakeProvider, type PaymentEnv } from "./core/payments";
import { clientIp, type RateLimitEnv, rateLimit } from "./core/rate-limit";
import { requireSession, type SessionVariables, sessionMiddleware } from "./core/session";
import { exampleFeature } from "./features/example";
import { deleteProductData, exportProductData } from "./features/user-data";

// Bindings are typed explicitly (not via worker-configuration.d.ts globals) so the app package
// can type-check the RPC client against this source without pulling in Worker ambient types.
export type Bindings = AuthEnv &
  PaymentEnv &
  AnalyticsEnv &
  RateLimitEnv & {
    COMMIT_SHA: string;
    /** Extra admins on top of product.config.ts admin.emails (comma-separated). */
    ADMIN_EMAILS?: string;
    CF_VERSION_METADATA: { id: string; tag: string; timestamp: string };
  };

export const app = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>();
const db = (env: Bindings) => drizzle(env.DB, { schema });

// API responses are JSON only: nothing may be framed, sniffed or loaded as a page resource.
// The app's HTML gets its headers from apps/app/public/_headers (served by the assets layer).
app.use(
  "/api/*",
  secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    xFrameOptions: "DENY",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
  }),
);
// No endpoint takes more than a small JSON or form body.
app.use("/api/*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "body_too_large" as const }, 413) }));

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

// Payment provider callbacks (no session). Signature checked by the provider; idempotent.
app.post("/api/webhooks/:provider", rateLimit("WEBHOOK_LIMITER", clientIp), async (c) => {
  const provider = configuredProvider(c.env);
  if (!provider || c.req.param("provider") !== provider.name) return c.notFound();
  const outcome = await handleWebhook(db(c.env), provider, c.req.raw, config.plans);
  if (outcome.kind === "unauthorized") return c.json({ error: "invalid_signature" as const }, 401);
  if (outcome.kind === "retry") return c.json({ error: "not_confirmed_yet" as const }, 503);
  if (outcome.kind === "processed") {
    // Source of truth for payment analytics: the browser may be gone by the time this lands.
    const { userId, planId, amountIdr, status } = outcome.payment;
    const event = outcome.entitlement ? "payment_paid" : status !== "paid" ? "payment_failed" : null;
    if (event) {
      const sent = serverAnalytics(c.env).track(event, { plan: planId, amount_idr: amountIdr, status }, userId);
      try {
        c.executionCtx.waitUntil(sent);
      } catch {
        await sent; // no execution context (tests): just finish it
      }
    }
  }
  if (outcome.kind === "processed" && outcome.entitlement) {
    const plan = config.plans.find((p) => p.id === outcome.payment.planId);
    const owner = await db(c.env)
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, outcome.payment.userId))
      .get();
    if (owner && plan) {
      const receipt = receiptEmail(owner.email, {
        appName: config.name,
        planLabel: plan.label,
        amountIdr: outcome.payment.amountIdr,
        paymentId: outcome.payment.id,
        expiresAt: outcome.entitlement.expiresAt,
      });
      // A receipt failure must not make the provider retry an already-granted payment.
      await emailProvider(c.env)
        .send(receipt)
        .catch((err: unknown) => console.error("receipt email failed", err instanceof Error ? err.message : err));
    }
  }
  return provider.webhookAck();
});

// Local dev only (E2E reads the magic link from here). Never reachable when deployed:
// requires APP_ENV=development AND a localhost host.
app.get("/api/dev/last-email", (c) => {
  if (c.env.APP_ENV !== "development" || new URL(c.req.url).hostname !== "localhost") return c.notFound();
  const mail = capturedDevEmails().last(c.req.query("to"));
  return mail ? c.json(mail) : c.notFound();
});

// Local dev only: pretend to be the provider's payment page. Marks the payment paid at the
// fake provider, delivers its signed webhook through the real handler, then returns like Duitku.
app.get("/api/dev/fake-pay", async (c) => {
  if (c.env.APP_ENV !== "development" || new URL(c.req.url).hostname !== "localhost") return c.notFound();
  const paymentId = c.req.query("paymentId") ?? "";
  const hook = fakeProvider().pay(paymentId);
  await app.request(new URL("/api/webhooks/fake", c.req.url), hook, c.env, c.executionCtx);
  return c.redirect(`/billing/return?paymentId=${encodeURIComponent(paymentId)}`);
});

// Local dev only: simulate time passing by ending the user's current access (E2E: trial expiry).
app.post("/api/dev/expire-access", async (c) => {
  if (c.env.APP_ENV !== "development" || new URL(c.req.url).hostname !== "localhost") return c.notFound();
  const email = c.req.query("email") ?? "";
  const owner = await db(c.env)
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!owner) return c.notFound();
  const past = new Date(Date.now() - 60_000);
  await db(c.env).update(schema.entitlements).set({ expiresAt: past }).where(eq(schema.entitlements.userId, owner.id));
  return c.json({ ok: true as const });
});

const consentBody = z.object({ accept: z.array(z.enum(["terms", "privacy", "sensitive_data", "marketing"])) });
const checkoutBody = z.object({ planId: z.string().max(64) });
const paymentIdQuery = z.object({ paymentId: z.string().regex(/^pay_[0-9a-f]{32}$/) });
const deleteBody = z.object({ confirm: z.literal("HAPUS") });

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
    if (!user) return c.json({ user: null, access: false, missingConsents: [] as string[], providers, isAdmin: false });
    const required = requiredConsents(config.legal);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      access: await hasAccess(db(c.env), user.id),
      missingConsents: (await missingConsents(db(c.env), user.id, required)) as string[],
      providers,
      isAdmin: isAdminEmail(user.email, config.admin.emails, c.env.ADMIN_EMAILS),
    });
  })
  .use("/consents", sessionMiddleware, requireSession)
  .post("/consents", async (c) => {
    const parsed = consentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const required = requiredConsents(config.legal);
    const missingRequired = required.filter((t) => !parsed.data.accept.includes(t));
    if (missingRequired.length > 0) return c.json({ error: "consent_required" as const, missingRequired }, 400);
    await recordConsents(db(c.env), c.get("user").id, parsed.data.accept);
    return c.json({ ok: true as const });
  })
  .use("/billing/*", sessionMiddleware, requireSession)
  .use(
    "/billing/checkout",
    rateLimit("CHECKOUT_LIMITER", (c) => c.get("user")?.id ?? clientIp(c)),
  )
  .post("/billing/trial", async (c) => {
    if (!config.trial.enabled) return c.json({ error: "trial_disabled" as const }, 400);
    const trial = await grantTrial(db(c.env), c.get("user").id, config.trial.days);
    if (!trial) return c.json({ error: "trial_used" as const }, 409);
    return c.json({ ok: true as const, expiresAt: trial.expiresAt.toISOString() });
  })
  .post("/billing/checkout", async (c) => {
    const parsed = checkoutBody.safeParse(await c.req.json().catch(() => null));
    const plan = parsed.success ? config.plans.find((p) => p.id === parsed.data.planId) : undefined;
    if (!plan) return c.json({ error: "unknown_plan" as const }, 400);
    const user = c.get("user");
    const pending = await missingConsents(db(c.env), user.id, requiredConsents(config.legal));
    if (pending.length > 0) return c.json({ error: "consent_required" as const }, 403);
    // No sandbox credentials yet (e.g. a fresh product): a clear 503, not a 500.
    const provider = configuredProvider(c.env);
    if (!provider) return c.json({ error: "payments_unavailable" as const }, 503);
    const { paymentId, redirectUrl } = await startCheckout(db(c.env), provider, {
      user: { id: user.id, name: user.name, email: user.email },
      plan,
      methods: config.payments.methods,
      origin: new URL(c.req.url).origin,
    });
    return c.json({ paymentId, redirectUrl });
  })
  .get("/billing/status", async (c) => {
    const query = paymentIdQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "not_found" as const }, 404);
    const row = await paymentStatus(db(c.env), c.get("user").id, query.data.paymentId);
    if (!row) return c.json({ error: "not_found" as const }, 404);
    return c.json({ status: row.status, planId: row.planId, amountIdr: row.amountIdr });
  })
  .get("/billing/history", async (c) => {
    const rows = await db(c.env)
      .select({
        id: payments.id,
        planId: payments.planId,
        amountIdr: payments.amountIdr,
        status: payments.status,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .where(eq(payments.userId, c.get("user").id))
      .orderBy(desc(payments.createdAt))
      .limit(50);
    return c.json({
      payments: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
      })),
    });
  })
  .use("/account/*", sessionMiddleware, requireSession)
  .get("/account/summary", async (c) => {
    const user = c.get("user");
    return c.json({
      profile: { name: user.name, email: user.email },
      subscription: await subscriptionSummary(db(c.env), user.id),
    });
  })
  // UU PDP right of access: the user's data as a JSON download.
  .get("/account/export", async (c) => {
    const userId = c.get("user").id;
    const data = { ...(await exportUserData(db(c.env), userId)), product: await exportProductData(db(c.env), userId) };
    c.header("content-disposition", `attachment; filename="data-${config.slug}.json"`);
    c.header("cache-control", "no-store");
    return c.json(data);
  })
  // UU PDP right to erasure. Requires typing the confirmation word.
  .post("/account/delete", async (c) => {
    if (!deleteBody.safeParse(await c.req.json().catch(() => null)).success)
      return c.json({ error: "confirmation_required" as const }, 400);
    await deleteProductData(db(c.env), c.get("user").id);
    await deleteUserData(db(c.env), c.get("user").id);
    for (const name of [
      "better-auth.session_token",
      "better-auth.session_data",
      "__Secure-better-auth.session_token",
      "__Secure-better-auth.session_data",
    ]) {
      c.header("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`, { append: true });
    }
    return c.json({ ok: true as const });
  })
  .route("/admin", adminRoutes)
  // PRODUCT-OWNED features mount below. The example shows the requireAccess pattern.
  .route("/example", exampleFeature);

export type AppType = typeof routes;

// Errors Hono catches (thrown in routes) are reported here; withSentry covers the rest
// (uncaught fetch/scheduled errors). Clients get a generic JSON error, never internals.
app.onError((err, c) => {
  captureError(err);
  console.error("unhandled", err instanceof Error ? err.message : err);
  return c.json({ error: "internal_error" as const }, 500);
});

export default withMonitoring({
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: Bindings, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(runScheduled(env));
  },
});
