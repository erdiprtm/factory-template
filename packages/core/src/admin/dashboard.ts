// /admin's monitoring dashboard (D-113): KPIs with their trend against the previous equal period,
// revenue and visitors per day, traffic sources, and a live feed. First-party data only (funnel
// events, payments, entitlements, ad spend): no tracker and no consent needed (D-033, D-034).
// Queries use the (event, created_at) index on funnel_events and created_at on payments.
import { adSpend, entitlements, funnelEvents, payments, user } from "@factory/db";
import { and, desc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import type { Db } from "../entitlements";
import { maskEmail } from "../notify";

export type DashboardRange = "today" | "7d" | "30d";
const JAKARTA_MS = 7 * 3_600_000;
const DAY = 86_400_000;
const RANGE_DAYS: Record<DashboardRange, number> = { today: 1, "7d": 7, "30d": 30 };

const jakartaDay = (ms: number) => new Date(ms + JAKARTA_MS).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - JAKARTA_MS;

/** The range's Jakarta days (today counts) and the previous equal period, as UTC instants. */
export function rangeWindow(range: DashboardRange, now = new Date()) {
  const days = RANGE_DAYS[range];
  const end = dayStart(jakartaDay(now.getTime())) + DAY;
  const start = end - days * DAY;
  return { start, end, prevStart: start - days * DAY, days };
}

/** Change against the previous period: +0.25 = 25% up; null when there's nothing to compare with. */
export function trend(value: number, prev: number): number | null {
  if (prev === 0) return value === 0 ? 0 : null;
  return Math.round(((value - prev) / prev) * 1000) / 1000;
}

type Row = {
  event: string;
  visitor: string;
  value: number;
  at: number;
  source: string | null;
  campaign: string | null;
};

const MONEY = ["purchase", "renewal", "refund"] as const;
const COUNTED = ["lp_view", "first_result", ...MONEY] as const;

function kpis(rows: Row[]) {
  const sum = (e: string) => rows.filter((r) => r.event === e).reduce((s, r) => s + r.value, 0);
  const count = (e: string) => rows.filter((r) => r.event === e).length;
  const visitors = new Set(rows.filter((r) => r.event === "lp_view").map((r) => r.visitor)).size;
  const buyers = count("purchase");
  return {
    revenueIdr: sum("purchase") + sum("renewal") - sum("refund"),
    buyers,
    renewals: count("renewal"),
    visitors,
    conversion: visitors > 0 ? Math.round((buyers / visitors) * 10_000) / 10_000 : null,
  };
}

/** Everything the dashboard's top shows for a range, from one indexed read of funnel events. */
export async function loadDashboard(db: Db, range: DashboardRange, now = new Date()) {
  const w = rangeWindow(range, now);
  const raw = await db
    .select({
      event: funnelEvents.event,
      anonId: funnelEvents.anonId,
      userId: funnelEvents.userId,
      value: funnelEvents.valueIdr,
      at: funnelEvents.createdAt,
      source: funnelEvents.utmSource,
      campaign: funnelEvents.utmCampaign,
    })
    .from(funnelEvents)
    .where(
      and(
        inArray(funnelEvents.event, [...COUNTED]),
        gte(funnelEvents.createdAt, new Date(w.prevStart)),
        lt(funnelEvents.createdAt, new Date(w.end)),
      ),
    );
  const rows: Row[] = raw.map((r) => ({
    event: r.event,
    visitor: r.anonId ?? r.userId ?? "",
    value: r.value ?? 0,
    at: r.at.getTime(),
    source: r.source,
    campaign: r.campaign,
  }));
  const current = rows.filter((r) => r.at >= w.start);
  const previous = rows.filter((r) => r.at < w.start);
  const now_ = kpis(current);
  const before = kpis(previous);

  const activePaid = await db
    .selectDistinct({ userId: entitlements.userId })
    .from(entitlements)
    .where(and(eq(entitlements.source, "payment"), gt(entitlements.expiresAt, now)));

  // Revenue and visitors per Jakarta day of the range.
  const series = Array.from({ length: w.days }, (_, i) => {
    const from = w.start + i * DAY;
    const inDay = current.filter((r) => r.at >= from && r.at < from + DAY);
    const k = kpis(inDay);
    return { day: jakartaDay(from), revenueIdr: k.revenueIdr, visitors: k.visitors };
  });

  // Traffic sources: utm_source / utm_campaign, "direct" without either. CAC/ROAS where spend exists.
  const spend = await db
    .select({ campaign: adSpend.campaign, amountIdr: adSpend.amountIdr })
    .from(adSpend)
    .where(and(gte(adSpend.day, jakartaDay(w.start)), lte(adSpend.day, jakartaDay(w.end - 1))));
  const spendBy = new Map<string, number>();
  for (const s of spend) spendBy.set(s.campaign, (spendBy.get(s.campaign) ?? 0) + s.amountIdr);
  const groups = new Map<string, Row[]>();
  for (const r of current) {
    const key = `${r.source ?? ""}\u0000${r.campaign ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const sources = [...groups.entries()].map(([key, rs]) => {
    const [source, campaign] = key.split("\u0000");
    const k = kpis(rs);
    const spendIdr = campaign ? (spendBy.get(campaign) ?? null) : null;
    return {
      source: source || null,
      campaign: campaign || null,
      visitors: k.visitors,
      firstResults: new Set(rs.filter((r) => r.event === "first_result").map((r) => r.visitor)).size,
      buyers: k.buyers,
      revenueIdr: k.revenueIdr,
      spendIdr,
      cacIdr: spendIdr !== null && k.buyers > 0 ? Math.round(spendIdr / k.buyers) : null,
      roas: spendIdr ? Math.round((k.revenueIdr / spendIdr) * 100) / 100 : null,
    };
  });

  return {
    range,
    from: jakartaDay(w.start),
    to: jakartaDay(w.end - 1),
    kpis: {
      revenueIdr: { value: now_.revenueIdr, trend: trend(now_.revenueIdr, before.revenueIdr) },
      buyers: { value: now_.buyers, trend: trend(now_.buyers, before.buyers) },
      renewals: { value: now_.renewals, trend: trend(now_.renewals, before.renewals) },
      visitors: { value: now_.visitors, trend: trend(now_.visitors, before.visitors) },
      conversion: {
        value: now_.conversion,
        trend: now_.conversion !== null && before.conversion ? trend(now_.conversion, before.conversion) : null,
      },
      activePaid: { value: activePaid.length, trend: null },
    },
    series,
    sources: sources.sort((a, b) => b.revenueIdr - a.revenueIdr || b.visitors - a.visitors),
  };
}

export type FeedItem =
  | { kind: "payment"; at: string; status: string; planId: string; amountIdr: number; who: string }
  | { kind: "signup"; at: string; who: string };

/** The newest payments (any status) and sign-ups, newest first, with masked emails (D-113). */
export async function loadFeed(db: Db, limit = 20): Promise<FeedItem[]> {
  const pays = await db
    .select({
      status: payments.status,
      planId: payments.planId,
      amountIdr: payments.amountIdr,
      at: payments.createdAt,
      email: user.email,
    })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  const signups = await db
    .select({ at: user.createdAt, email: user.email })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit);
  const items: FeedItem[] = [
    ...pays.map((p) => ({
      kind: "payment" as const,
      at: p.at.toISOString(),
      status: p.status,
      planId: p.planId,
      amountIdr: p.amountIdr,
      who: p.email ? maskEmail(p.email) : "—",
    })),
    ...signups.map((s) => ({ kind: "signup" as const, at: s.at.toISOString(), who: maskEmail(s.email) })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
