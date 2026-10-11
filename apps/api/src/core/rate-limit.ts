import { config } from "@factory/config/product";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import type { SessionVariables } from "./session";

/** Cloudflare Workers rate limiting binding (`ratelimits` in wrangler.jsonc). */
export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type RateLimitEnv = {
  /** Checkout starts per signed-in user (10 per 60 s). */
  CHECKOUT_LIMITER?: RateLimiter;
  /** Webhook calls per client IP (120 per 60 s). Signed callbacks are cheap, but D1 writes aren't free. */
  WEBHOOK_LIMITER?: RateLimiter;
};

type Env = { Bindings: Bindings; Variables: SessionVariables };

/**
 * 429 once `limiter` says no for this key. Counters are per Cloudflare location and eventually
 * consistent: abuse protection, not accounting. A missing binding means "no limit", which only
 * happens in tests that don't configure one; wrangler.jsonc declares both for every environment.
 */
export function rateLimit(name: keyof RateLimitEnv, key: (c: Context<Env>) => string) {
  return createMiddleware<Env>(async (c, next) => {
    const limiter = c.env[name];
    if (limiter) {
      // Namespaces are shared across Workers on one account, so keys carry the product slug.
      const { success } = await limiter.limit({ key: `${config.slug}:${name}:${key(c)}` });
      if (!success) return c.json({ error: "rate_limited" as const }, 429, { "retry-after": "60" });
    }
    await next();
  });
}

export const clientIp = (c: Context<Env>) => c.req.header("cf-connecting-ip") ?? "unknown";
