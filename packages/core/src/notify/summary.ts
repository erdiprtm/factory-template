import { funnelEvents } from "@factory/db";
import { and, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "../entitlements";
import { type DailySummary, dailySummaryText } from "./index";

const JAKARTA_MS = 7 * 3_600_000;

/** The Jakarta day before `now`, as "YYYY-MM-DD". */
export const yesterdayWib = (now: Date) => new Date(now.getTime() + JAKARTA_MS - 86_400_000).toISOString().slice(0, 10);

/**
 * Whether this cron tick is the daily summary's (D-112): the first half-hour of `hourWib` in Jakarta.
 * The cron runs every 30 minutes, so exactly one tick a day matches.
 */
export function summaryDue(now: Date, hourWib: number): boolean {
  const wib = new Date(now.getTime() + JAKARTA_MS);
  return wib.getUTCHours() === hourWib && wib.getUTCMinutes() < 30;
}

/** Yesterday's numbers from first-party funnel events (D-033): money events and the quiz → first result step. */
export async function loadDailySummary(db: Db, day: string): Promise<DailySummary> {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - JAKARTA_MS);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await db
    .select({
      event: funnelEvents.event,
      anonId: funnelEvents.anonId,
      userId: funnelEvents.userId,
      value: funnelEvents.valueIdr,
    })
    .from(funnelEvents)
    .where(
      and(
        gte(funnelEvents.createdAt, start),
        lt(funnelEvents.createdAt, end),
        inArray(funnelEvents.event, ["purchase", "renewal", "refund", "quiz_start", "first_result"]),
      ),
    );
  const count = (e: string) => rows.filter((r) => r.event === e).length;
  const visitors = (e: string) => new Set(rows.filter((r) => r.event === e).map((r) => r.anonId ?? r.userId)).size;
  return {
    day,
    purchases: count("purchase"),
    renewals: count("renewal"),
    revenueIdr: rows
      .filter((r) => r.event === "purchase" || r.event === "renewal")
      .reduce((sum, r) => sum + (r.value ?? 0), 0),
    refunds: count("refund"),
    quizStarts: visitors("quiz_start"),
    firstResults: visitors("first_result"),
  };
}

export { dailySummaryText };
