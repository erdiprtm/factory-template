import type { AiConfigParsed, ProductConfig } from "@factory/config";
import { config } from "@factory/config/product";
import {
  type AiJsonRequest,
  type AiProvider,
  type AiResult,
  geminiProvider,
  mockProvider,
  openAiProvider,
  openRouterProvider,
  withFallback,
} from "@factory/core/ai";
import { aiCallsSince, anonymousAiCallsSince, recordAiUsage } from "@factory/core/ai/usage";
import { anonKey } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Bindings } from "../index";
import { anonIdOf } from "./access";
import type { SessionUser } from "./auth";

export type AiEnv = {
  /** OpenAI API key, for ai.provider "openai" (Wrangler secret; SETUP_HUMAN step 11). */
  OPENAI_API_KEY?: string;
  /** OpenRouter API key, for ai.provider "openrouter" (D-083; SETUP_HUMAN step 11c). */
  OPENROUTER_API_KEY?: string;
  /** Gemini API key from a paid project, for ai.provider "gemini" (D-084; SETUP_HUMAN step 11d). */
  GEMINI_API_KEY?: string;
  /** Overrides product.config.ts ai.model without a code change (e.g. to try a new model). */
  AI_MODEL?: string;
  APP_ENV: string;
};

/**
 * product.config.ts `ai`, or one parsed alone by `pnpm ai:eval` (D-085), whose OpenRouter zdr may
 * be unset: then it follows this product's legal.sensitiveDataConsent. No provider = "openai".
 */
export type AiSettings =
  | NonNullable<ProductConfig["ai"]>
  | AiConfigParsed
  | { provider?: "openai"; model: string; tier: "default" | "fast" };

/**
 * The product's AI provider (D-045, D-083, D-084), the one place a provider is built from config:
 * the configured provider when its key is set, otherwise the product's mock in development, test
 * and preview. Production without the key gets null, and the route answers 503: a missing key must
 * never fall back to fake results in front of paying users. Only the configured providers' keys
 * count (the primary's, and ai.fallback's, D-091): an OpenAI key doesn't make a Gemini product call
 * OpenAI.
 */
export function aiProvider(
  env: AiEnv,
  mock: (req: AiJsonRequest) => unknown,
  ai: AiSettings | null = config.ai,
  opts: { fetch?: typeof fetch } = {},
): AiProvider | null {
  if (!ai) return null;
  const primary = realProvider(env, { ...ai, model: env.AI_MODEL?.trim() || ai.model }, opts);
  // ai.fallback (D-091): another provider for when the primary can't answer at all. Without its
  // key there's no fallback; without the primary's key, the fallback alone serves.
  const fallback = "fallback" in ai && ai.fallback ? realProvider(env, ai.fallback, opts) : null;
  const real = primary && fallback ? withFallback(primary, fallback) : (primary ?? fallback);
  return real ?? (env.APP_ENV === "production" ? null : mockProvider(mock));
}

type ProviderSettings = AiSettings | NonNullable<AiConfigParsed["fallback"]>;

/** One provider from its settings, when its own key is set; null otherwise. */
function realProvider(env: AiEnv, ai: ProviderSettings, opts: { fetch?: typeof fetch }): AiProvider | null {
  if (ai.provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY?.trim();
    return apiKey
      ? openRouterProvider({
          apiKey,
          model: ai.model,
          fallbackModels: ai.fallbackModels,
          routing: { ...ai.routing, zdr: ai.routing.zdr ?? config.legal.sensitiveDataConsent },
          prices: ai.prices,
          fetch: opts.fetch,
        })
      : null;
  }
  if (ai.provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY?.trim();
    return apiKey
      ? geminiProvider({
          apiKey,
          model: ai.model,
          thinking: ai.thinking,
          mediaResolution: ai.mediaResolution,
          prices: ai.prices,
          fetch: opts.fetch,
        })
      : null;
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  return apiKey ? openAiProvider({ apiKey, model: ai.model, tier: ai.tier, fetch: opts.fetch }) : null;
}

const DAY_MS = 86_400_000;

type Env = { Bindings: Bindings; Variables: { user: SessionUser | null } };

type BudgetOptions = { perUserPerDay: number; anonymousPerDay: number } & (
  | { feature?: never; featurePerUserPerDay?: never }
  | { feature: string; featurePerUserPerDay: number }
);

/**
 * Cost cap for AI routes (D-045). Put it BEFORE requireAccessOrFreeUse, so a refused call spends no
 * free use. Use after sessionMiddleware.
 * - each account or device: perUserPerDay calls per 24 h, all features together (429 { error: "ai_limit" });
 * - with `feature` (D-050): also featurePerUserPerDay calls of that feature per 24 h (429 { error: "ai_limit" }).
 *   `feature` is the same name the route passes to runAi;
 * - all visitors without an account together: anonymousPerDay per 24 h (429 { error: "ai_busy" }).
 * A visitor without a device id passes on to the free-use gate, which answers 401.
 */
export function aiBudgetGate(o: BudgetOptions) {
  return createMiddleware<Env>(async (c, next) => {
    const db = drizzle(c.env.DB, { schema });
    const user = c.get("user");
    const anonId = anonIdOf(c);
    const subject = user ? user.id : anonId ? anonKey(anonId) : null;
    if (!subject) return next();
    const since = new Date(Date.now() - DAY_MS);
    if ((await aiCallsSince(db, subject, since)) >= o.perUserPerDay) return c.json({ error: "ai_limit" as const }, 429);
    if (o.feature !== undefined && (await aiCallsSince(db, subject, since, o.feature)) >= o.featurePerUserPerDay)
      return c.json({ error: "ai_limit" as const }, 429);
    if (!user && (await anonymousAiCallsSince(db, since)) >= o.anonymousPerDay)
      return c.json({ error: "ai_busy" as const }, 429);
    await next();
  });
}

type AiCaps = { perUserPerDay: number; anonymousPerDay: number } | null;

const aiUnavailable = createMiddleware<Env>(async (c) => c.json({ error: "ai_unavailable" as const }, 503));

/** The cap with this product's settings (product.config.ts ai). 503 when the product has no AI. */
export const requireAiBudget = config.ai ? aiBudgetGate(config.ai) : aiUnavailable;

/**
 * requireAiBudget plus a cap for one feature (D-050), e.g. photo scans at 20 a day next to cheap
 * typed-text parsing. ai.perUserPerDay still caps all features together, so set it to their sum.
 */
export function requireAiBudgetFor(feature: string, perUserPerDay: number, ai: AiCaps = config.ai) {
  return ai
    ? aiBudgetGate({
        perUserPerDay: ai.perUserPerDay,
        anonymousPerDay: ai.anonymousPerDay,
        feature,
        featurePerUserPerDay: perUserPerDay,
      })
    : aiUnavailable;
}

/**
 * Runs one AI call for the signed-in user or the visitor's device and logs it (after the response,
 * when the runtime allows). `feature` names the call in the log and /admin, e.g. "meal_scan".
 */
export async function runAi(
  c: Context<Env>,
  provider: AiProvider,
  feature: string,
  req: AiJsonRequest,
): Promise<AiResult> {
  const result = await provider.json(req);
  const user = c.get("user");
  const anonId = anonIdOf(c);
  const userId = user ? user.id : anonId ? anonKey(anonId) : "anon:unknown";
  const log = recordAiUsage(drizzle(c.env.DB, { schema }), { userId, feature, result }).catch((e: unknown) =>
    console.warn("ai usage log failed", e),
  );
  try {
    c.executionCtx.waitUntil(log);
  } catch {
    await log; // no execution context (tests)
  }
  return result;
}
