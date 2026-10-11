import { config } from "@factory/config/product";
import { adminStats, findUserByEmail, isAdminEmail, recentPayments, recentWebhookEvents } from "@factory/core/admin";
import { grantAdminDays } from "@factory/core/entitlements";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Bindings } from "../index";
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
const db = (env: Bindings) => drizzle(env.DB, { schema });

/** /api/admin/*: portfolio numbers for this product (Section 7, Phase 7). */
export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>()
  .use("*", sessionMiddleware, requireAdmin)
  .get("/stats", async (c) => c.json(await adminStats(db(c.env))))
  .get("/payments", async (c) => c.json({ payments: await recentPayments(db(c.env)) }))
  .get("/webhooks", async (c) => c.json({ events: await recentWebhookEvents(db(c.env)) }))
  // Manual access for support and partners. Extends from the user's latest expiry.
  .post("/grant", async (c) => {
    const parsed = grantBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" as const }, 400);
    const target = await findUserByEmail(db(c.env), parsed.data.email);
    if (!target) return c.json({ error: "user_not_found" as const }, 404);
    const e = await grantAdminDays(db(c.env), target.id, parsed.data.days);
    return c.json({ ok: true as const, expiresAt: e.expiresAt.toISOString() });
  });
