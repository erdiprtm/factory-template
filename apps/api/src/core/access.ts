import { config } from "@factory/config/product";
import { type ConsentType, missingConsents, requiredConsents } from "@factory/core/consents";
import { hasAccess } from "@factory/core/entitlements";
import { anonKey, consumeAnonymousFreeUse, consumeFreeUse, ipKey } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
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

/** The visitor's random device id (attribution anonId, D-033), sent by the app as `x-anon-id`. */
export function anonIdOf(c: Context): string | null {
  const v = c.req.header("x-anon-id");
  return v && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : null;
}

type FreeUseOptions = {
  coreAction: string;
  freeUses: number;
  anonymousFreeUses: number;
  anonymousPerIpPerDay: number;
  /** Consents a visitor must have given on this device before an anonymous use (D-043). */
  consents?: ConsentType[];
};

/**
 * Gate for the product's core action (D-037, D-042):
 * - paid access passes and spends nothing;
 * - a signed-in user spends one of `freeUses`, then gets 402 { reason: "free_uses_used" };
 * - a visitor without an account spends one of `anonymousFreeUses` (per device, and under the IP's
 *   daily cap), then gets 401 { error: "sign_up_required" }. With anonymousFreeUses 0 it's a plain 401.
 *   Before that, the device must have given `consents` (403 { error: "consent_required" }, D-043).
 * Responses carry `x-free-uses-left` when a free use was spent. Put it only on the route that
 * performs the core action (one call = one use), never on reads of past results.
 */
export function freeUseGate(o: FreeUseOptions) {
  return createMiddleware<{ Bindings: Bindings; Variables: { user: SessionUser | null } }>(async (c, next) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB, { schema });
    if (!user) {
      const anonId = anonIdOf(c);
      if (o.anonymousFreeUses <= 0 || !anonId) return c.json({ error: "unauthorized" as const }, 401);
      const missing = await missingConsents(db, anonKey(anonId), o.consents ?? []);
      if (missing.length > 0) return c.json({ error: "consent_required" as const, missing }, 403);
      const ip = await ipKey(c.req.header("cf-connecting-ip") ?? "unknown", c.env.BETTER_AUTH_SECRET ?? "factory");
      const use = await consumeAnonymousFreeUse(db, {
        anonId,
        ipKey: ip,
        action: o.coreAction,
        limit: o.anonymousFreeUses,
        perIpPerDay: o.anonymousPerIpPerDay,
      });
      if (!use.allowed) return c.json({ error: "sign_up_required" as const }, 401);
      c.header("x-free-uses-left", String(use.left));
      return next();
    }
    if (await hasAccess(db, user.id)) return next();
    const use = await consumeFreeUse(db, { userId: user.id, action: o.coreAction, limit: o.freeUses });
    if (!use.allowed) return c.json({ error: "payment_required" as const, reason: "free_uses_used" as const }, 402);
    c.header("x-free-uses-left", String(use.left));
    await next();
  });
}

/** The gate with this product's settings (product.config.ts funnel and the consents it requires). */
export const requireAccessOrFreeUse = freeUseGate({ ...config.funnel, consents: requiredConsents(config.legal) });
