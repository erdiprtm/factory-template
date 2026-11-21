import { config } from "@factory/config/product";
import { recordServerEvent, saveAttribution } from "@factory/core/attribution";
import {
  checkPaymentStatus,
  checkPurchaseKey,
  createDownloadLink,
  DOWNLOAD_HOURS,
  DOWNLOAD_MAX_USES,
  type Download,
  downloadForPayment,
  downloadLinkToken,
  downloadsForEmail,
  guestId,
  purchaseKey,
  type SettleOutcome,
  startCheckout,
  useDownloadLink,
} from "@factory/core/billing";
import { recordConsents } from "@factory/core/consents";
import { emailProvider } from "@factory/core/email";
import { downloadEmail } from "@factory/core/email/templates";
import { cleanFbId, readFbCookies, saveCheckoutContext } from "@factory/core/meta";
import { paidText } from "@factory/core/notify";
import { schema } from "@factory/db";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings } from "../index";
import { experiment, serverAnalytics } from "./analytics";
import { downloadSecret } from "./auth";
import { capiOptions, marketingTrackingOn, sendPaymentConversion } from "./marketing";
import { ownerAlert } from "./notify";
import { afterStatusCheck } from "./payment-events";
import { configuredProvider } from "./payments";
import { clientIp, rateLimit } from "./rate-limit";

// One-time digital purchases (D-130): checkout without an account, the thank-you page, the
// download itself and "kirim ulang link". Settling stays in core's settlePayment (one download per
// payment); afterDigitalPurchase sends the events and the email once, for the one winning caller.

const db = (env: Bindings) => drizzle(env.DB, { schema });
const productById = (id: string) => config.digitalProducts.find((p) => p.id === id);

/** The app's thank-you page for a purchase: `k` lets this one browser see that one payment. */
export const thankYouPath = (paymentId: string, key: string) =>
  `/beli/terima-kasih?paymentId=${paymentId}&k=${encodeURIComponent(key)}`;

/** The download link a buyer clicks (email or thank-you page): GET /api/downloads/<token>. */
const linkUrl = (origin: string, token: string) => `${origin}/api/downloads/${token}`;

/** Emails a new download link for a granted purchase. False when the product is gone from the config. */
async function emailLink(
  env: Bindings,
  download: Download,
  origin: string,
  paid?: { amountIdr: number; paymentId: string },
): Promise<boolean> {
  const product = productById(download.productId);
  if (!product) return false;
  const { token } = await createDownloadLink(db(env), downloadSecret(env), download.id);
  await emailProvider(env, config.legal.contactEmail).send(
    downloadEmail(download.email, {
      appName: config.name,
      productLabel: product.label,
      url: linkUrl(origin, token),
      hours: DOWNLOAD_HOURS,
      maxUses: DOWNLOAD_MAX_USES,
      paid,
      copy: product.email,
    }),
  );
  return true;
}

/**
 * After a digital purchase was settled (D-130), from any path (webhook, status check, cron):
 * analytics, the funnel's purchase (so /admin's revenue and ROAS count it), the owner's ping,
 * Meta CAPI with marketing consent only (D-034), and the email with the link. Only the caller
 * whose settle moved the payment to paid gets `download`, so this runs once per purchase.
 */
export async function afterDigitalPurchase(
  env: Bindings,
  outcome: SettleOutcome,
  defer: (work: Promise<unknown>) => Promise<void>,
): Promise<void> {
  if (outcome.kind !== "processed" || !outcome.download) return;
  const d = db(env);
  const { id, userId, planId, amountIdr, utmCampaign, utmSource } = outcome.payment;
  const product = productById(planId);
  await recordServerEvent(d, { event: "purchase", userId, valueIdr: amountIdr, utmCampaign, utmSource, experiment });
  await defer(
    serverAnalytics(env).track(
      "product_purchase",
      { product: planId, amount_idr: amountIdr, utm_campaign: utmCampaign },
      userId,
    ),
  );
  const tg = config.notifications.telegram;
  if (tg)
    await defer(
      ownerAlert(
        env,
        "purchase",
        paidText({
          event: "purchase",
          product: config.name,
          plan: product?.label ?? planId,
          amountIdr,
          provider: outcome.payment.provider,
          paymentId: id,
          email: outcome.download.email,
          emailMode: tg.email,
          campaign: utmCampaign,
          source: utmSource,
        }),
      ),
    );
  const capi = capiOptions(env);
  if (capi)
    await defer(
      sendPaymentConversion(d, capi, { event: "purchase", payment: outcome.payment, email: outcome.download.email }),
    );
  // An email failure must not make the provider retry: the buyer can ask for the link again.
  const origin = outcome.payment.checkoutOrigin ?? (config.domain.app ? `https://${config.domain.app}` : null);
  if (origin)
    await emailLink(env, outcome.download, origin, { amountIdr, paymentId: id }).catch((err: unknown) =>
      console.error("download email failed", err instanceof Error ? err.message : err),
    );
}

/**
 * The thank-you page's link (D-130): the newest link still valid, else a first one while the
 * purchase is younger than DOWNLOAD_HOURS. Never a fresh link past that (the email's resend is the way).
 */
async function pageLink(env: Bindings, download: Download, paidAt: Date | null, now = new Date()) {
  const d = db(env);
  const secret = downloadSecret(env);
  const valid = await d
    .select({ id: schema.downloadLinks.id, uses: schema.downloadLinks.uses, max: schema.downloadLinks.maxUses })
    .from(schema.downloadLinks)
    .where(and(eq(schema.downloadLinks.downloadId, download.id), gt(schema.downloadLinks.expiresAt, now)))
    .orderBy(desc(schema.downloadLinks.createdAt))
    .limit(5);
  const open = valid.find((l) => l.uses < l.max);
  if (open) return downloadLinkToken(secret, open.id);
  const any = await d
    .select({ id: schema.downloadLinks.id })
    .from(schema.downloadLinks)
    .where(eq(schema.downloadLinks.downloadId, download.id))
    .get();
  const young = paidAt && now.getTime() - paidAt.getTime() < DOWNLOAD_HOURS * 3_600_000;
  if (any || !young) return null;
  return (await createDownloadLink(d, secret, download.id, now)).token;
}

const checkoutBody = z.object({
  email: z.email().max(254),
  // Terms and privacy are required to buy; marketing (Meta CAPI) is the buyer's choice (D-034).
  accept: z
    .array(z.enum(["terms", "privacy", "marketing"]))
    .refine((a) => a.includes("terms") && a.includes("privacy")),
  touch: z
    .object({
      anonId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
      firstSeenAt: z.int().positive(),
      landingPath: z.string().max(300).optional(),
      utm_source: z.string().max(100).optional(),
      utm_medium: z.string().max(100).optional(),
      utm_campaign: z.string().max(200).optional(),
      utm_content: z.string().max(200).optional(),
      fbclid: z.string().max(500).optional(),
    })
    .optional(),
  fbp: z.string().max(600).optional(),
  fbc: z.string().max(600).optional(),
});
const statusQuery = z.object({ paymentId: z.string().regex(/^pay_[0-9a-f]{32}$/), k: z.string().max(100) });
const resendBody = z.object({ email: z.email().max(254) });

export const digitalRoutes = new Hono<{ Bindings: Bindings }>()
  // The public catalog: what the buy page shows. Web only in the app (native shows no web prices).
  .get("/products", (c) =>
    c.json({ products: config.digitalProducts.map((p) => ({ id: p.id, label: p.label, priceIdr: p.priceIdr })) }),
  )
  .use("/products/:id/checkout", rateLimit("CHECKOUT_LIMITER", clientIp))
  .post("/products/:id/checkout", async (c) => {
    const product = productById(c.req.param("id"));
    if (!product) return c.json({ error: "unknown_product" as const }, 404);
    const parsed = checkoutBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const provider = configuredProvider(c.env);
    if (!provider || provider.needsMethod) return c.json({ error: "payments_unavailable" as const }, 503);
    const d = db(c.env);
    const buyer = guestId();
    const { email, accept, touch } = parsed.data;
    await recordConsents(d, buyer, accept);
    if (touch) await saveAttribution(d, buyer, touch);
    const attribution = touch
      ? {
          utmSource: touch.utm_source ?? null,
          utmMedium: touch.utm_medium ?? null,
          utmCampaign: touch.utm_campaign ?? null,
          utmContent: touch.utm_content ?? null,
          fbclid: touch.fbclid ?? null,
        }
      : undefined;
    const origin = new URL(c.req.url).origin;
    const secret = downloadSecret(c.env);
    const started = await startCheckout(d, provider, {
      user: { id: buyer, name: "", email },
      plan: { id: product.id, label: product.label, months: 0, priceIdr: product.priceIdr },
      methods: config.payments.methods,
      origin,
      attribution,
      digital: { returnPath: async (paymentId) => thankYouPath(paymentId, await purchaseKey(secret, paymentId)) },
    }).catch((err: unknown) => {
      console.error("product checkout failed", err instanceof Error ? err.message : err);
      return null;
    });
    if (!started) return c.json({ error: "provider_error" as const }, 502);
    if (accept.includes("marketing") && marketingTrackingOn(c.env)) {
      const cookies = readFbCookies(c.req.header("cookie") ?? "");
      await saveCheckoutContext(d, started.paymentId, {
        fbp: cleanFbId(parsed.data.fbp) ?? cookies.fbp,
        fbc: cleanFbId(parsed.data.fbc) ?? cookies.fbc,
        clientIp: c.req.header("cf-connecting-ip"),
        userAgent: c.req.header("user-agent"),
        sourceUrl: `${origin}/beli/${product.id}`,
      });
    }
    return c.json({ paymentId: started.paymentId, redirectUrl: started.redirectUrl });
  })
  // The thank-you page polls this with its key. DOKU's missed-webhook fallback (D-128) runs here too.
  .get("/products/status", async (c) => {
    const q = statusQuery.safeParse(c.req.query());
    if (!q.success || !(await checkPurchaseKey(downloadSecret(c.env), q.data.paymentId, q.data.k)))
      return c.json({ error: "not_found" as const }, 404);
    const d = db(c.env);
    const payment = await d.select().from(schema.payments).where(eq(schema.payments.id, q.data.paymentId)).get();
    const product = payment ? productById(payment.planId) : undefined;
    if (!payment?.buyerEmail || !product) return c.json({ error: "not_found" as const }, 404);
    const provider = configuredProvider(c.env);
    const defer = async (work: Promise<unknown>) => {
      try {
        c.executionCtx.waitUntil(work);
      } catch {
        await work;
      }
    };
    if (provider?.statusFallbackMs && payment.status !== "paid") {
      const check = await checkPaymentStatus(d, provider, {
        userId: payment.userId,
        paymentId: payment.id,
        source: "return",
        plans: config.plans,
      });
      await afterStatusCheck(c.env, check, "return", defer);
    }
    const now = await d
      .select({ status: schema.payments.status, paidAt: schema.payments.paidAt })
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id))
      .get();
    const download = now?.status === "paid" ? await downloadForPayment(d, payment.id) : null;
    const token = download ? await pageLink(c.env, download, now?.paidAt ?? null) : null;
    return c.json(
      {
        status: now?.status ?? payment.status,
        product: { id: product.id, label: product.label },
        amountIdr: payment.amountIdr,
        email: payment.buyerEmail,
        downloadUrl: token ? `/api/downloads/${token}` : null,
      },
      200,
      { "cache-control": "no-store" },
    );
  })
  // "Kirim ulang link": a new link to the purchase's email. The same answer whatever the email,
  // so nobody learns who bought what.
  .use("/products/resend", rateLimit("CHECKOUT_LIMITER", clientIp))
  .post("/products/resend", async (c) => {
    const parsed = resendBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const origin = new URL(c.req.url).origin;
    const recent = new Date(Date.now() - 10 * 60_000);
    for (const download of await downloadsForEmail(db(c.env), parsed.data.email)) {
      // At most one emailed link per purchase per 10 minutes.
      const fresh = await db(c.env)
        .select({ id: schema.downloadLinks.id })
        .from(schema.downloadLinks)
        .where(and(eq(schema.downloadLinks.downloadId, download.id), gt(schema.downloadLinks.createdAt, recent)))
        .get();
      if (!fresh) await emailLink(c.env, download, origin).catch(() => false);
    }
    return c.json({ ok: true as const });
  })
  // The file itself: one use of a valid link, streamed from the product's private R2 bucket.
  .get("/downloads/:token", async (c) => {
    const html = (c.req.header("accept") ?? "").includes("text/html");
    const use = await useDownloadLink(db(c.env), downloadSecret(c.env), c.req.param("token"));
    if (use.kind !== "ok") {
      // A person clicking an old link gets the page that sends a new one; tools get the status.
      if (html) return c.redirect(`/beli/unduh?link=${use.kind}`, 302);
      return use.kind === "gone"
        ? c.json({ error: "link_expired" as const }, 410)
        : c.json({ error: "invalid_link" as const }, 403);
    }
    const product = productById(use.productId);
    const object = product && c.env.FILES ? await c.env.FILES.get(product.fileKey) : null;
    if (!product || !object) {
      console.error("download file missing", use.productId);
      return c.json({ error: "file_missing" as const }, 404);
    }
    await serverAnalytics(c.env).track("product_download", { product: product.id });
    const name = product.fileName ?? `${product.id}.pdf`;
    return c.body(object.body, 200, {
      "content-type": name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
  });

/** Purchases past their links' lifetime keep their rows; their links are purged daily (cron). */
export async function purgeDownloadLinks(env: Bindings, now = new Date()): Promise<number> {
  const old = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const rows = await db(env)
    .delete(schema.downloadLinks)
    .where(lt(schema.downloadLinks.expiresAt, old))
    .returning({ id: schema.downloadLinks.id });
  return rows.length;
}
