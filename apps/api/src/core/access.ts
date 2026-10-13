import { config } from "@factory/config/product";
import { type ConsentType, missingConsents, requiredConsents } from "@factory/core/consents";
import { hasAccess } from "@factory/core/entitlements";
import {
  anonKey,
  consumeAnonymousFreeUse,
  consumeFreeUse,
  hasAnonymousFreeUseLeft,
  hasFreeUseLeft,
  ipKey,
} from "@factory/core/quota";
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
  /**
   * "on_request" (default): the use is spent before the handler runs.
   * "on_success" (D-056): the gate only checks; the handler calls `spendFreeUse(c)` once it has a
   * real result, so a failed attempt (a blurry photo) never costs the visitor's only free use.
   */
  spend?: "on_request" | "on_success";
};

/** What the gate let through, for `spendFreeUse` (keyed by the request, no Hono variable typing). */
type Grant =
  | { kind: "access" }
  | { kind: "user"; userId: string; o: FreeUseOptions }
  | { kind: "anon"; anonId: string; ipKey: string; o: FreeUseOptions };
const grants = new WeakMap<Request, Grant>();

const signUpRequired = (c: Context) => c.json({ error: "sign_up_required" as const }, 401);
const freeUsesUsed = (c: Context) =>
  c.json({ error: "payment_required" as const, reason: "free_uses_used" as const }, 402);

/**
 * Gate for the product's core action (D-037, D-042, D-056):
 * - paid access passes and spends nothing;
 * - a signed-in user spends one of `freeUses`, then gets 402 { reason: "free_uses_used" };
 * - a visitor without an account spends one of `anonymousFreeUses` (per device, and under the IP's
 *   daily cap), then gets 401 { error: "sign_up_required" }. With anonymousFreeUses 0 it's a plain 401.
 *   Before that, the device must have given `consents` (403 { error: "consent_required" }, D-043).
 * With `spend: "on_success"` the same checks run but nothing is spent until `spendFreeUse(c)`.
 * Responses carry `x-free-uses-left` when a free use was spent. Put it only on the route that
 * performs the core action (one call = one use), never on reads of past results.
 */
export function freeUseGate(o: FreeUseOptions) {
  const later = o.spend === "on_success";
  return createMiddleware<{ Bindings: Bindings; Variables: { user: SessionUser | null } }>(async (c, next) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB, { schema });
    if (!user) {
      const anonId = anonIdOf(c);
      if (o.anonymousFreeUses <= 0 || !anonId) return c.json({ error: "unauthorized" as const }, 401);
      const missing = await missingConsents(db, anonKey(anonId), o.consents ?? []);
      if (missing.length > 0) return c.json({ error: "consent_required" as const, missing }, 403);
      const ip = await ipKey(c.req.header("cf-connecting-ip") ?? "unknown", c.env.BETTER_AUTH_SECRET ?? "factory");
      const args = {
        anonId,
        ipKey: ip,
        action: o.coreAction,
        limit: o.anonymousFreeUses,
        perIpPerDay: o.anonymousPerIpPerDay,
      };
      if (later) {
        if (!(await hasAnonymousFreeUseLeft(db, args))) return signUpRequired(c);
        grants.set(c.req.raw, { kind: "anon", anonId, ipKey: ip, o });
        return next();
      }
      const use = await consumeAnonymousFreeUse(db, args);
      if (!use.allowed) return signUpRequired(c);
      c.header("x-free-uses-left", String(use.left));
      return next();
    }
    if (await hasAccess(db, user.id)) {
      grants.set(c.req.raw, { kind: "access" });
      return next();
    }
    const args = { userId: user.id, action: o.coreAction, limit: o.freeUses };
    if (later) {
      if (!(await hasFreeUseLeft(db, args))) return freeUsesUsed(c);
      grants.set(c.req.raw, { kind: "user", userId: user.id, o });
      return next();
    }
    const use = await consumeFreeUse(db, args);
    if (!use.allowed) return freeUsesUsed(c);
    c.header("x-free-uses-left", String(use.left));
    await next();
  });
}

/**
 * Spends the free use a `spend: "on_success"` gate let through (D-056). Call it once the handler
 * has a real result, before sending it. Returns null when the result may be sent (spent, or paid
 * access), or the response to send instead: when concurrent requests raced for the last free use,
 * only one wins (the spend is atomic) and the others get the usual 401/402 without the result.
 */
export async function spendFreeUse<E extends { Bindings: Bindings }>(c: Context<E>): Promise<Response | null> {
  const grant = grants.get(c.req.raw);
  if (!grant) throw new Error('spendFreeUse needs a freeUseGate({ spend: "on_success" }) before the handler');
  grants.delete(c.req.raw);
  if (grant.kind === "access") return null;
  const db = drizzle(c.env.DB, { schema });
  const { o } = grant;
  if (grant.kind === "user") {
    const use = await consumeFreeUse(db, { userId: grant.userId, action: o.coreAction, limit: o.freeUses });
    if (!use.allowed) return freeUsesUsed(c);
    c.header("x-free-uses-left", String(use.left));
    return null;
  }
  const use = await consumeAnonymousFreeUse(db, {
    anonId: grant.anonId,
    ipKey: grant.ipKey,
    action: o.coreAction,
    limit: o.anonymousFreeUses,
    perIpPerDay: o.anonymousPerIpPerDay,
  });
  if (!use.allowed) return signUpRequired(c);
  c.header("x-free-uses-left", String(use.left));
  return null;
}

const productGate = { ...config.funnel, consents: requiredConsents(config.legal) };

/** The gate with this product's settings (product.config.ts funnel and the consents it requires). */
export const requireAccessOrFreeUse = freeUseGate(productGate);

/** Same rules, but the handler spends with `spendFreeUse(c)` once it has a real result (D-056). */
export const checkAccessOrFreeUse = freeUseGate({ ...productGate, spend: "on_success" });
