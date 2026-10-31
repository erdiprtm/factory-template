import { config } from "@factory/config/product";
import { adminStats, findUserByEmail, isAdminEmail, recentPayments, recentWebhookEvents } from "@factory/core/admin";
import { loadDashboard, loadFeed } from "@factory/core/admin/dashboard";
import { FUNNEL_STEPS } from "@factory/core/analytics";
import {
  deleteSpend,
  jakartaDay,
  loadEconomics,
  markRefunded,
  recentSpend,
  spendFromMetaCsv,
  upsertSpend,
} from "@factory/core/economics";
import { grantAdminDays } from "@factory/core/entitlements";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Bindings } from "../index";
import { experiment, serverAnalytics } from "./analytics";
import { eraseAccount } from "./erase-account";
import { type SessionVariables, sessionMiddleware } from "./session";

/** 401 signed out, 403 not on the allowlist (product.config.ts admin.emails ∪ ADMIN_EMAILS var). */
export const requireAdmin = createMiddleware<{ Bindings: Bindings; Variables: SessionVariables }>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" as const }, 401);
  if (!isAdminEmail(user.email, config.admin.emails, c.env.ADMIN_EMAILS)) {
    return c.json({ error: "forbidden" as const }, 403);
  }
  await next();
});

const grantBody = z.object({ email: z.email(), days: z.int().min(1).max(366) });
// D-110: the email typed twice, so a slip in one field can't delete the wrong person.
const deleteUserBody = z.object({ email: z.email(), confirm: z.string().max(320) });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const spendBody = z.object({
  date: day,
  channel: z.string().regex(/^[a-z0-9_-]{2,30}$/),
  campaign: z.string().trim().min(1).max(200),
  amountIdr: z.int().min(0).max(10_000_000_000),
});
const dashboardQuery = z.object({ range: z.enum(["today", "7d", "30d"]).default("7d") });
const economicsQuery = z.object({ from: day.optional(), to: day.optional(), campaign: z.string().max(200).optional() });
const refundBody = z.object({ paymentId: z.string().regex(/^pay_[0-9a-f]{32}$/) });

/** The funnel /admin shows: after_quiz puts the paywall before any result, so first_result drops out. */
export const funnelSteps = () =>
  config.funnel.paywallPlacement === "after_quiz"
    ? FUNNEL_STEPS.filter((s) => s !== "first_result")
    : [...FUNNEL_STEPS];
const db = (env: Bindings) => drizzle(env.DB, { schema });

/** /api/admin/*: portfolio numbers for this product (Section 7, Phase 7). */
export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>()
  .use("*", sessionMiddleware, requireAdmin)
  .get("/stats", async (c) => c.json(await adminStats(db(c.env))))
  // The monitoring dashboard (D-113): KPIs with trends, per-day series, sources; and the live feed.
  .get("/dashboard", async (c) => {
    const q = dashboardQuery.safeParse(c.req.query());
    if (!q.success) return c.json({ error: "invalid_query" as const }, 400);
    return c.json(await loadDashboard(db(c.env), q.data.range));
  })
  .get("/feed", async (c) => c.json({ items: await loadFeed(db(c.env)) }))
  .get("/payments", async (c) => c.json({ payments: await recentPayments(db(c.env)) }))
  .get("/webhooks", async (c) => c.json({ events: await recentWebhookEvents(db(c.env)) }))
  // Unit economics (D-038): CAC, ROAS d7/d30, AOV, renewal rate, LTV per campaign, and the funnel.
  // Default range: the last 30 Jakarta days.
  .get("/economics", async (c) => {
    const q = economicsQuery.safeParse(c.req.query());
    if (!q.success) return c.json({ error: "invalid_query" as const }, 400);
    const today = jakartaDay(new Date());
    const to = q.data.to ?? today;
    const from = q.data.from ?? jakartaDay(new Date(Date.now() - 29 * 86_400_000));
    const data = await loadEconomics(db(c.env), {
      from,
      to,
      campaign: q.data.campaign,
      plans: config.plans,
      steps: funnelSteps(),
      benchmarks: config.economics.benchmarks,
      experiment,
    });
    return c.json({ ...data, settings: config.economics });
  })
  .get("/spend", async (c) => c.json({ spend: await recentSpend(db(c.env)) }))
  .post("/spend", async (c) => {
    const parsed = spendBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    await upsertSpend(db(c.env), [parsed.data], "manual");
    return c.json({ ok: true as const });
  })
  .delete("/spend/:id", async (c) =>
    (await deleteSpend(db(c.env), c.req.param("id")))
      ? c.json({ ok: true as const })
      : c.json({ error: "not_found" as const }, 404),
  )
  // Ads Manager CSV export (Breakdown → By time → Day), sent as the raw text body.
  .post("/spend/import", async (c) => {
    const { rows, errors } = spendFromMetaCsv(await c.req.text());
    if (rows.length === 0) return c.json({ error: "nothing_imported" as const, errors }, 400);
    await upsertSpend(db(c.env), rows, "csv");
    return c.json({ ok: true as const, imported: rows.length, errors });
  })
  // After refunding at the provider's dashboard: mark it here so access ends and numbers stay right.
  .post("/refund", async (c) => {
    const parsed = refundBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const r = await markRefunded(db(c.env), parsed.data.paymentId, new Date(), { experiment });
    if (r.kind === "not_found") return c.json({ error: "not_found" as const }, 404);
    if (r.kind === "not_paid") return c.json({ error: "not_paid" as const }, 409);
    if (r.kind === "refunded") {
      const { userId, planId, amountIdr } = r.payment;
      await serverAnalytics(c.env).track("refund", { plan: planId, amount_idr: amountIdr, ...r.tag }, userId);
    }
    return c.json({ ok: true as const });
  })
  // Manual access for support and partners. Extends from the user's latest expiry.
  .post("/grant", async (c) => {
    const parsed = grantBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const target = await findUserByEmail(db(c.env), parsed.data.email);
    if (!target) return c.json({ error: "user_not_found" as const }, 404);
    const e = await grantAdminDays(db(c.env), target.id, parsed.data.days);
    return c.json({ ok: true as const, expiresAt: e.expiresAt.toISOString() });
  })
  // Delete someone's account on their request (support, UU PDP) or a test account (D-110): the same
  // erasure as Akun → Hapus akun. Not an admin's own account (use Akun) and not another admin's.
  .post("/delete-user", async (c) => {
    const parsed = deleteUserBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const email = parsed.data.email.trim().toLowerCase();
    if (parsed.data.confirm.trim().toLowerCase() !== email)
      return c.json({ error: "confirmation_mismatch" as const }, 400);
    const target = await findUserByEmail(db(c.env), email);
    if (!target) return c.json({ error: "user_not_found" as const }, 404);
    const me = c.get("user");
    if (!me) return c.json({ error: "unauthorized" as const }, 401);
    if (target.id === me.id) return c.json({ error: "own_account" as const }, 409);
    if (isAdminEmail(email, config.admin.emails, c.env.ADMIN_EMAILS))
      return c.json({ error: "admin_account" as const }, 409);
    await eraseAccount(c.env, target.id);
    // Workers logs keep who deleted whom by opaque ids only, never the email.
    console.info("admin_delete_user", JSON.stringify({ by: me.id, user: target.id }));
    return c.json({ ok: true as const });
  });
