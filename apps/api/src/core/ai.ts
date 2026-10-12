import { config } from "@factory/config/product";
import { type AiJsonRequest, type AiProvider, type AiResult, mockProvider, openAiProvider } from "@factory/core/ai";
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
  /** OpenAI API key (Wrangler secret; SETUP_HUMAN step 11). Without it: the mock outside production. */
  OPENAI_API_KEY?: string;
  /** Overrides product.config.ts ai.model without a code change (e.g. to try a new model). */
  AI_MODEL?: string;
  APP_ENV: string;
};

/**
 * The product's AI provider (D-045): OpenAI when OPENAI_API_KEY is set, otherwise the product's
 * mock in development, test and preview. Production without a key gets null, and the route answers
 * 503: a missing key must never fall back to fake results in front of paying users.
 */
export function aiProvider(
  env: AiEnv,
  mock: (req: AiJsonRequest) => unknown,
  ai: { model: string; tier: "default" | "fast" } | null = config.ai,
): AiProvider | null {
  if (!ai) return null;
  const key = env.OPENAI_API_KEY?.trim();
  if (key) return openAiProvider({ apiKey: key, model: env.AI_MODEL?.trim() || ai.model, tier: ai.tier });
  return env.APP_ENV === "production" ? null : mockProvider(mock);
}

const DAY_MS = 86_400_000;

type Env = { Bindings: Bindings; Variables: { user: SessionUser | null } };

type BudgetOptions = { perUserPerDay: number; anonymousPerDay: number };

/**
 * Cost cap for AI routes (D-045). Put it BEFORE requireAccessOrFreeUse, so a refused call spends no
 * free use. Use after sessionMiddleware.
 * - each account or device: perUserPerDay calls per 24 h (429 { error: "ai_limit" });
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
    if (!user && (await anonymousAiCallsSince(db, since)) >= o.anonymousPerDay)
      return c.json({ error: "ai_busy" as const }, 429);
    await next();
  });
}

/** The cap with this product's settings (product.config.ts ai). 503 when the product has no AI. */
export const requireAiBudget = config.ai
  ? aiBudgetGate(config.ai)
  : createMiddleware<Env>(async (c) => c.json({ error: "ai_unavailable" as const }, 503));

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
