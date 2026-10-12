// One row per AI call (D-045): who (an account, or `anon:<anonId>` for a visitor, D-042), which
// feature, model, tier, outcome, latency, tokens and cost. Used for per-user daily caps, the global
// anonymous budget, and cost tracking. Failed calls are logged too: they count toward the caps.
import { aiUsage } from "@factory/db";
import { and, desc, eq, gte, like, lt, sql } from "drizzle-orm";
import type { Db } from "../entitlements";
import { anonKey } from "../quota";
import { type AiResult, costMicroUsd } from "./index";

/** Days a visitor's AI log rows are kept when no account claims them (as their consent, D-043). */
export const ANONYMOUS_AI_USAGE_DAYS = 90;

export async function recordAiUsage(
  db: Db,
  input: { userId: string; feature: string; result: AiResult },
  now = new Date(),
): Promise<void> {
  const { result } = input;
  const usage = result.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    feature: input.feature,
    model: result.model,
    tier: result.tier,
    ok: result.ok,
    error: result.ok ? null : result.error,
    latencyMs: result.latencyMs,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    costMicroUsd: result.usage ? costMicroUsd(result.model, result.tier, usage) : null,
    createdAt: now,
  });
}

/** AI calls by one account or visitor since a time: all features, or only `feature` (D-050). */
export async function aiCallsSince(db: Db, userId: string, since: Date, feature?: string): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        gte(aiUsage.createdAt, since),
        feature === undefined ? undefined : eq(aiUsage.feature, feature),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/** AI calls by all visitors without an account since a time: the global anonymous budget. */
export async function anonymousAiCallsSince(db: Db, since: Date): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(aiUsage)
    .where(and(like(aiUsage.userId, "anon:%"), gte(aiUsage.createdAt, since)))
    .get();
  return row?.n ?? 0;
}

/** At signup: a visitor's AI calls become the account's (they keep counting toward its cap). */
export async function claimAnonymousAiUsage(db: Db, userId: string, anonId: string): Promise<void> {
  await db
    .update(aiUsage)
    .set({ userId })
    .where(eq(aiUsage.userId, anonKey(anonId)));
}

/** UU PDP access: the account's AI log, newest first. */
export async function exportAiUsage(db: Db, userId: string) {
  return db
    .select({
      feature: aiUsage.feature,
      model: aiUsage.model,
      ok: aiUsage.ok,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .where(eq(aiUsage.userId, userId))
    .orderBy(desc(aiUsage.createdAt));
}

export async function deleteAiUsage(db: Db, userId: string): Promise<void> {
  await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
}

/** Drops visitors' rows no account claimed (cron). */
export async function purgeAnonymousAiUsage(db: Db, now = new Date()): Promise<void> {
  await db
    .delete(aiUsage)
    .where(
      and(
        like(aiUsage.userId, "anon:%"),
        lt(aiUsage.createdAt, new Date(now.getTime() - ANONYMOUS_AI_USAGE_DAYS * 86_400_000)),
      ),
    );
}

/** AI cost per feature and model since a time, for /admin (micro-USD; null prices count as 0). */
export async function aiCostSince(db: Db, since: Date) {
  return db
    .select({
      feature: aiUsage.feature,
      model: aiUsage.model,
      calls: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${aiUsage.ok} then 0 else 1 end)`,
      costMicroUsd: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)`,
      avgLatencyMs: sql<number>`avg(${aiUsage.latencyMs})`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since))
    .groupBy(aiUsage.feature, aiUsage.model);
}
