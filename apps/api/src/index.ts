import { config } from "@factory/config/product";
import { deleteUserData, exportUserData, subscriptionSummary } from "@factory/core/account";
import { isAdminEmail } from "@factory/core/admin";
import { claimAnonymousAiUsage } from "@factory/core/ai/usage";
import { CLIENT_FUNNEL_EVENTS } from "@factory/core/analytics";
import {
  attributionFor,
  paidEventKind,
  paymentAttribution,
  recordClientEvents,
  saveAttribution,
} from "@factory/core/attribution";
import {
  cancelPayment,
  confirmPayment,
  handleWebhook,
  paymentCharge,
  paymentStatus,
  startCheckout,
} from "@factory/core/billing";
import {
  claimAnonymousConsents,
  missingConsents,
  recordConsents,
  requiredConsents,
  revokeConsent,
} from "@factory/core/consents";
import { capturedDevEmails } from "@factory/core/email";
import { grantTrial, hasAccess, latestExpiry } from "@factory/core/entitlements";
import { claimAnonymousFiles, deleteUserFiles, type FileBucket, fileKey, fileRow } from "@factory/core/files";
import { cleanFbId, readFbCookies, saveCheckoutContext } from "@factory/core/meta";
import { QUIZ_MAX_STEPS } from "@factory/core/quiz";
import { quizResponsesFor, saveQuizResponse } from "@factory/core/quiz/store";
import { anonKey, claimAnonymousUses, freeUsesUsed } from "@factory/core/quota";
import { payments, schema } from "@factory/db";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { anonIdOf } from "./core/access";
import { adminRoutes } from "./core/admin";
import type { AiEnv } from "./core/ai";
import { type AnalyticsEnv, experiment } from "./core/analytics";
import { anonymousHomeRedirect } from "./core/anonymous-home";
import { type AuthEnv, getAuth } from "./core/auth";
import { runScheduled } from "./core/cron";
import { hasMarketingConsent, type MarketingEnv, marketingTrackingOn } from "./core/marketing";
import { captureError, withMonitoring } from "./core/monitoring";
import { afterPaymentSettled } from "./core/payment-events";
import { configuredProvider, fakePakasirServer, fakeProvider, type PaymentEnv } from "./core/payments";
import { clientIp, type RateLimitEnv, rateLimit } from "./core/rate-limit";
import { requireSession, type SessionVariables, sessionMiddleware } from "./core/session";
import { apiBodyLimit } from "./core/uploads";
import { exampleFeature } from "./features/example";
import { uploadLimits } from "./features/uploads";
import { claimAnonymousData, deleteProductData, exportProductData } from "./features/user-data";

// Bindings are typed explicitly (not via worker-configuration.d.ts globals) so the app package
// can type-check the RPC client against this source without pulling in Worker ambient types.
export type Bindings = AuthEnv &
  AiEnv &
  PaymentEnv &
  AnalyticsEnv &
  MarketingEnv &
  RateLimitEnv & {
    COMMIT_SHA: string;
    /** Extra admins on top of product.config.ts admin.emails (comma-separated). */
    ADMIN_EMAILS?: string;
    CF_VERSION_METADATA: { id: string; tag: string; timestamp: string };
    /** R2 bucket for users' files (D-049): `<slug>-files`, `<slug>-files-preview` on preview. */
    FILES?: FileBucket;
    /** The app's web export (wrangler.jsonc assets). The Worker runs first only for /api and "/". */
    ASSETS: { fetch(req: Request): Promise<Response> };
  };

export const app = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>();
const db = (env: Bindings) => drizzle(env.DB, { schema });

// "/" runs the Worker first (wrangler.jsonc run_worker_first) only for this: on one domain, a
// visitor without a session goes to the landing page instead of sign-in (D-068). Otherwise, and
// in every product without domain.anonymousHome, it's the app's index.html as before.
app.get("/", (c) => anonymousHomeRedirect(c.req.raw, config.domain) ?? c.env.ASSETS.fetch(c.req.raw));

/** Work that must not delay the response (analytics). Tests have no execution context: just finish it. */
async function background(c: Context, work: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}

// API responses are JSON only: nothing may be framed, sniffed or loaded as a page resource.
// The app's HTML gets its headers from apps/app/public/_headers (served by the assets layer).
const apiHeaders: NonNullable<Parameters<typeof secureHeaders>[0]> = {
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  xFrameOptions: "DENY",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
};
const sameOriginHeaders = secureHeaders(apiHeaders);
// POST /api/events is the one endpoint another origin calls: the site's sendBeacon (D-033). With
// CORP same-origin the browser blocks its (empty) response and logs a console error. It returns
// 204 with no body, so cross-origin is safe there; every other route stays same-origin.
const beaconHeaders = secureHeaders({ ...apiHeaders, crossOriginResourcePolicy: "cross-origin" });
app.use("/api/*", (c, next) => (c.req.path === "/api/events" ? beaconHeaders(c, next) : sameOriginHeaders(c, next)));
// No endpoint takes more than a small JSON or form body, except the admin's ad-spend CSV import and
// the product's upload routes (features/uploads.ts, D-044).
app.use("/api/*", apiBodyLimit({ ...uploadLimits, "/api/admin/spend/import": 1024 * 1024 }));

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
// Pakasir (D-092): X-Secret compared in constant time, then confirmed with its status API.
app.post("/api/webhooks/:provider", rateLimit("WEBHOOK_LIMITER", clientIp), async (c) => {
  const provider = configuredProvider(c.env);
  if (!provider || c.req.param("provider") !== provider.name) return c.notFound();
  const outcome = await handleWebhook(db(c.env), provider, c.req.raw, config.plans);
  if (outcome.kind === "unauthorized") return c.json({ error: "invalid_signature" as const }, 401);
  if (outcome.kind === "retry") return c.json({ error: "not_confirmed_yet" as const }, 503);
  if (outcome.kind === "processed") await afterPaymentSettled(c.env, outcome, (work) => background(c, work));
  return provider.webhookAck();
});

// First-party funnel events from the site and the app (sell engine, D-033). No session: the
// device's random anonId keys them. The site sends them cross-origin with sendBeacon (text/plain,
// a "simple" request, so no CORS preflight). purchase/renewal/refund are server-only.
const eventsBody = z.object({
  anonId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  utm_source: z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  events: z
    .array(z.object({ event: z.enum(CLIENT_FUNNEL_EVENTS), step: z.int().min(0).max(50).optional() }))
    .min(1)
    .max(20),
});
app.post("/api/events", rateLimit("EVENTS_LIMITER", clientIp), async (c) => {
  let body: unknown = null;
  try {
    body = JSON.parse(await c.req.text());
  } catch {}
  const parsed = eventsBody.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
  const { anonId, utm_source, utm_campaign, events } = parsed.data;
  await recordClientEvents(db(c.env), { anonId, attribution: { utm_source, utm_campaign }, events, experiment });
  return c.body(null, 204);
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

// Local dev only: "the buyer paid" at the fake Pakasir API (D-092). With webhook=1 it also delivers
// Pakasir's webhook through the real handler; without it, the checkout screen's poll finds it.
app.post("/api/dev/pakasir-pay", async (c) => {
  if (c.env.APP_ENV !== "development" || new URL(c.req.url).hostname !== "localhost") return c.notFound();
  const paymentId = c.req.query("paymentId") ?? "";
  if (!fakePakasirServer().complete(paymentId)) return c.notFound();
  if (c.req.query("webhook") === "1") {
    const hook = fakePakasirServer().webhook(paymentId, { url: new URL("/api/webhooks/pakasir", c.req.url).href });
    const res = await app.request(hook, undefined, c.env, c.executionCtx);
    return c.json({ ok: true as const, webhook: res.status });
  }
  return c.json({ ok: true as const });
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

const touchBody = z.object({
  anonId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  firstSeenAt: z.int().positive(),
  landingPath: z.string().max(300).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  fbclid: z.string().max(500).optional(),
});
// Quiz answers (D-036): small and well-formed; the product's app validates their meaning.
const quizValue = z.union([z.string().max(100), z.array(z.string().max(100)).min(1).max(8), z.number().finite()]);
const quizBody = z.object({
  quizId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
  answers: z
    .record(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/), quizValue)
    .refine((a) => Object.keys(a).length <= QUIZ_MAX_STEPS, {
      message: `at most ${QUIZ_MAX_STEPS} answers`,
    }),
  completedAt: z.int().positive(),
});
const consentBody = z.object({ accept: z.array(z.enum(["terms", "privacy", "sensitive_data", "marketing"])) });
// fbp/fbc: the Pixel's cookies, sent by the web app so the server event matches the browser's.
const checkoutBody = z.object({
  planId: z.string().max(64),
  /** Pakasir only (D-092): the method picked in the app's own checkout. */
  method: z.string().max(40).optional(),
  fbp: z.string().max(600).optional(),
  fbc: z.string().max(600).optional(),
});
const marketingBody = z.object({ granted: z.boolean() });
const paymentIdQuery = z.object({ paymentId: z.string().regex(/^pay_[0-9a-f]{32}$/) });
const paymentIdBody = paymentIdQuery;
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
    const anonId = anonIdOf(c);
    const required = requiredConsents(config.legal);
    if (!user)
      return c.json({
        user: null,
        access: false,
        // With a device id: what this visitor still has to accept before an anonymous use (D-043).
        missingConsents: (anonId ? await missingConsents(db(c.env), anonKey(anonId), required) : []) as string[],
        providers,
        isAdmin: false,
        marketingConsent: false,
        // A visitor's anonymous free uses (D-042), from the device id the app sends.
        freeUses: {
          limit: config.funnel.anonymousFreeUses,
          used: anonId ? await freeUsesUsed(db(c.env), anonKey(anonId), config.funnel.coreAction) : 0,
        },
      });
    // Consent given on this device before signup counts for the account (D-043).
    if (anonId) await claimAnonymousConsents(db(c.env), user.id, anonId);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      access: await hasAccess(db(c.env), user.id),
      missingConsents: (await missingConsents(db(c.env), user.id, required)) as string[],
      providers,
      isAdmin: isAdminEmail(user.email, config.admin.emails, c.env.ADMIN_EMAILS),
      marketingConsent: await hasMarketingConsent(db(c.env), user.id),
      // Free uses of the core action (D-037), so the app can say how many are left.
      freeUses: {
        limit: config.funnel.freeUses,
        used: await freeUsesUsed(db(c.env), user.id, config.funnel.coreAction),
      },
    });
  })
  // A stored file (D-049), only for its owner: the signed-in account, or the visitor's device.
  .use("/files/:id", sessionMiddleware)
  .get("/files/:id", async (c) => {
    const row = c.env.FILES ? await fileRow(db(c.env), c.req.param("id")) : null;
    const user = c.get("user");
    const anonId = anonIdOf(c);
    const owner = user ? user.id : anonId ? anonKey(anonId) : null;
    if (!row || !c.env.FILES || row.userId !== owner) return c.json({ error: "not_found" as const }, 404);
    const object = await c.env.FILES.get(fileKey(row.id));
    if (!object) return c.json({ error: "not_found" as const }, 404);
    return c.body(object.body, 200, {
      "content-type": row.contentType,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
  })
  .use("/consents", sessionMiddleware, requireSession)
  .use("/consents/*", sessionMiddleware, requireSession)
  .post("/consents", async (c) => {
    const parsed = consentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    // Complete = what's already recorded plus what's accepted now (the /consent screen sends only
    // the missing ones, e.g. sensitive_data for an older account).
    const userId = c.get("user").id;
    const missing = await missingConsents(db(c.env), userId, requiredConsents(config.legal));
    const missingRequired = missing.filter((t) => !parsed.data.accept.includes(t));
    if (missingRequired.length > 0) return c.json({ error: "consent_required" as const, missingRequired }, 400);
    await recordConsents(db(c.env), userId, parsed.data.accept);
    return c.json({ ok: true as const });
  })
  // The "iklan/marketing" choice (UU PDP): grant or withdraw at any time. Recorded in consents.
  .post("/consents/marketing", async (c) => {
    const parsed = marketingBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const userId = c.get("user").id;
    if (parsed.data.granted) await recordConsents(db(c.env), userId, ["marketing"]);
    else await revokeConsent(db(c.env), userId, "marketing");
    return c.json({ ok: true as const, marketingConsent: parsed.data.granted });
  })
  // Consent before signup (D-043), for "pay for proof": recorded under the device id and moved to the
  // account at sign-in (/me). Only the required documents; marketing has its own banner.
  .use("/anonymous-consents", rateLimit("EVENTS_LIMITER", clientIp))
  .post("/anonymous-consents", async (c) => {
    const anonId = anonIdOf(c);
    if (!anonId) return c.json({ error: "device_id_required" as const }, 400);
    const parsed = consentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const required = requiredConsents(config.legal);
    const missing = await missingConsents(db(c.env), anonKey(anonId), required);
    const missingRequired = missing.filter((t) => !parsed.data.accept.includes(t));
    if (missingRequired.length > 0) return c.json({ error: "consent_required" as const, missingRequired }, 400);
    await recordConsents(
      db(c.env),
      anonKey(anonId),
      required.filter((t) => parsed.data.accept.includes(t)),
    );
    return c.json({ ok: true as const });
  })
  // Attaches the device's first-touch attribution to the user, once (first touch wins).
  .use("/attribution", sessionMiddleware, requireSession)
  .post("/attribution", async (c) => {
    const parsed = touchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const userId = c.get("user").id;
    const saved = await saveAttribution(db(c.env), userId, parsed.data);
    // Free uses spent before signing up count toward the account's (D-042).
    await claimAnonymousUses(db(c.env), {
      userId,
      anonId: parsed.data.anonId,
      action: config.funnel.coreAction,
      limit: config.funnel.freeUses,
    });
    await claimAnonymousAiUsage(db(c.env), userId, parsed.data.anonId);
    await claimAnonymousFiles(db(c.env), userId, parsed.data.anonId);
    await claimAnonymousData(db(c.env), userId, parsed.data.anonId);
    return c.json({ ok: true as const, saved });
  })
  // Quiz answers from before signup, attached once signed in (a retake replaces them).
  .use("/quiz", sessionMiddleware, requireSession)
  .post("/quiz", async (c) => {
    const parsed = quizBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const { quizId, answers, completedAt } = parsed.data;
    const at = new Date(Math.min(completedAt, Date.now()));
    await saveQuizResponse(db(c.env), { userId: c.get("user").id, quizId, answers, completedAt: at });
    return c.json({ ok: true as const });
  })
  .get("/quiz", async (c) => c.json({ responses: await quizResponsesFor(db(c.env), c.get("user").id) }))
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
    const origin = new URL(c.req.url).origin;
    // The app's own checkout (Pakasir, D-092) needs one configured method; the provider checks
    // it against the plan's amount, which always comes from product.config.ts, never the browser.
    const method = parsed.data?.method;
    if (provider.needsMethod && (!method || !config.payments.methods.includes(method))) {
      return c.json({ error: "unknown_method" as const }, 400);
    }
    const started = await startCheckout(db(c.env), provider, {
      user: { id: user.id, name: user.name, email: user.email },
      plan,
      methods: config.payments.methods,
      method: provider.needsMethod ? method : undefined,
      origin,
      attribution: paymentAttribution(await attributionFor(db(c.env), user.id)),
    }).catch((err: unknown) => {
      // The payment row is marked failed; the buyer sees "try again".
      console.error("checkout failed", err instanceof Error ? err.message : err);
      return null;
    });
    if (!started) return c.json({ error: "provider_error" as const }, 502);
    const { paymentId, redirectUrl } = started;
    // Browser context for the Meta Conversions API, kept only with marketing consent (D-034).
    if (marketingTrackingOn(c.env) && (await hasMarketingConsent(db(c.env), user.id))) {
      const cookies = readFbCookies(c.req.header("cookie") ?? "");
      await saveCheckoutContext(db(c.env), paymentId, {
        fbp: cleanFbId(parsed.data?.fbp) ?? cookies.fbp,
        fbc: cleanFbId(parsed.data?.fbc) ?? cookies.fbc,
        clientIp: c.req.header("cf-connecting-ip"),
        userAgent: c.req.header("user-agent"),
        sourceUrl: `${origin}/pricing`,
      });
    }
    return c.json({ paymentId, redirectUrl });
  })
  .get("/billing/status", async (c) => {
    const query = paymentIdQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "not_found" as const }, 404);
    const userId = c.get("user").id;
    // Providers that allow polling (Pakasir, D-092) are asked too, at most once per 4 s per
    // payment (server-side throttle), and a confirmed payment is settled here like a webhook.
    const provider = configuredProvider(c.env);
    if (provider?.statusIntervalMs) {
      const settled = await confirmPayment(db(c.env), provider, {
        userId,
        paymentId: query.data.paymentId,
        plans: config.plans,
      });
      await afterPaymentSettled(c.env, settled, (work) => background(c, work));
    }
    const row = await paymentStatus(db(c.env), userId, query.data.paymentId);
    if (!row) return c.json({ error: "not_found" as const }, 404);
    // The browser Pixel sends the same event (and event id) as the server's CAPI, deduplicated.
    const event =
      row.status === "paid"
        ? await paidEventKind(db(c.env), { id: query.data.paymentId, userId, paidAt: row.paidAt })
        : null;
    // Paid: when access now ends, for "Aktif sampai <tanggal>" on the return screen (D-098).
    const until = row.status === "paid" ? await latestExpiry(db(c.env), userId) : null;
    return c.json({
      status: row.status,
      planId: row.planId,
      amountIdr: row.amountIdr,
      event,
      accessUntil: until ? until.toISOString() : null,
    });
  })
  // The app's own checkout screen (Pakasir, D-092): what to pay, owner only.
  .get("/billing/charge", async (c) => {
    const query = paymentIdQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "not_found" as const }, 404);
    const row = await paymentCharge(db(c.env), c.get("user").id, query.data.paymentId);
    if (!row) return c.json({ error: "not_found" as const }, 404);
    return c.json({ ...row, expiresAt: row.expiresAt.toISOString() });
  })
  // Another method, or the countdown ended (D-092): cancel at the provider, unless it was just paid.
  .post("/billing/cancel", async (c) => {
    const parsed = paymentIdBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "not_found" as const }, 404);
    const provider = configuredProvider(c.env);
    if (!provider?.cancel) return c.json({ error: "not_found" as const }, 404);
    const userId = c.get("user").id;
    const result = await cancelPayment(db(c.env), provider, {
      userId,
      paymentId: parsed.data.paymentId,
      plans: config.plans,
    });
    if (result.kind === "not_found") return c.json({ error: "not_found" as const }, 404);
    if (result.kind === "settled") await afterPaymentSettled(c.env, result.outcome, (work) => background(c, work));
    if (result.kind === "cancel_failed") return c.json({ error: "cancel_failed" as const }, 502);
    const row = await paymentStatus(db(c.env), userId, parsed.data.paymentId);
    return c.json({ status: row?.status ?? ("expired" as const) });
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
    if (c.env.FILES) await deleteUserFiles(db(c.env), c.env.FILES, c.get("user").id);
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
