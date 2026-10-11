import { config } from "@factory/config/product";
import { hasAccess } from "@factory/core/entitlements";
import { consumeFreeUse } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import type { SessionUser } from "./auth";

/**
 * Gate for paid features: 401 if signed out, 402 if no active entitlement (trial, payment,
 * admin grant or store purchase). Use after sessionMiddleware. Never bypass it for paid features.
 */
export const requireAccess = createMiddleware<{ Bindings: Bindings; Variables: { user: SessionUser | null } }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" as const }, 401);
    const db = drizzle(c.env.DB, { schema });
    if (!(await hasAccess(db, user.id))) return c.json({ error: "payment_required" as const }, 402);
    await next();
  },
);

/**
 * Gate for the product's core action (D-037): paid access, OR one of the free uses from
 * product.config.ts funnel.freeUses, so the first real result comes before the paywall.
 * 401 signed out; 402 { error: "payment_required", reason: "free_uses_used" } once they run out.
 * Responses carry `x-free-uses-left` when a free use was spent. Put it only on the route that
 * performs the core action (one call = one use), never on reads of past results.
 */
export const requireAccessOrFreeUse = createMiddleware<{
  Bindings: Bindings;
  Variables: { user: SessionUser | null };
}>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" as const }, 401);
  const db = drizzle(c.env.DB, { schema });
  if (await hasAccess(db, user.id)) return next();
  const use = await consumeFreeUse(db, {
    userId: user.id,
    action: config.funnel.coreAction,
    limit: config.funnel.freeUses,
  });
  if (!use.allowed) return c.json({ error: "payment_required" as const, reason: "free_uses_used" as const }, 402);
  c.header("x-free-uses-left", String(use.left));
  await next();
});
