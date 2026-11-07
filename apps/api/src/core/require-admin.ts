import { config } from "@factory/config/product";
import { isAdminEmail } from "@factory/core/admin";
import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import type { SessionVariables } from "./session";

/**
 * 401 signed out, 403 not on the allowlist (product.config.ts admin.emails ∪ ADMIN_EMAILS var).
 * A leaf module on purpose (D-125): core/admin.ts imports erase-account → features/user-data, so a
 * product route importing requireAdmin from core/admin.ts could load mid-cycle and get undefined
 * (its route then 404s). Product code imports it from here; use it after sessionMiddleware.
 */
export const requireAdmin = createMiddleware<{ Bindings: Bindings; Variables: SessionVariables }>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" as const }, 401);
  if (!isAdminEmail(user.email, config.admin.emails, c.env.ADMIN_EMAILS)) {
    return c.json({ error: "forbidden" as const }, 403);
  }
  await next();
});
