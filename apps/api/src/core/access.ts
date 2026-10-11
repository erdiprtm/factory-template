import { hasAccess } from "@factory/core/entitlements";
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
