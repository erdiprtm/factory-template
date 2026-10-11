// Unit economics (sell engine Module 6, D-038). Pure functions over rows loaded from D1, so every
// number in /admin is unit-tested. Money is integer IDR; spend is what Ads Manager reports as
// "Amount spent" (before the 11% ad tax, which the target-CAC calculator adds).

export type SpendEntry = { date: string; channel: string; campaign: string; amountIdr: number };
export type Acquisition = { userId: string; campaign: string | null; firstSeenAt: Date };
export type PaidPayment = { userId: string; amountIdr: number; paidAt: Date; months: number };

export type Metrics = {
  spendIdr: number;
  /** Users first seen in the range who have bought (at any time up to now). */
  buyers: number;
  cacIdr: number | null;
  revenueD7Idr: number;
  revenueD30Idr: number;
  roasD7: number | null;
  roasD30: number | null;
  aovIdr: number | null;
  /** Of buyers whose first paid period has ended, the share that bought again. */
  renewalRate: number | null;
  ltvIdr: number | null;
  ltvMinusCacIdr: number | null;
};

const DAY = 86_400_000;
/** Renewal rates near 1 would make LTV explode on tiny samples. */
const MAX_RENEWAL_FOR_LTV = 0.9;

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Metrics for one group of acquisitions and the spend that bought them. */
export function metricsFor(
  spendIdr: number,
  acquisitions: Acquisition[],
  paymentsByUser: Map<string, PaidPayment[]>,
  now: Date,
): Metrics {
  let buyers = 0;
  let revenueD7 = 0;
  let revenueD30 = 0;
  let revenueAll = 0;
  let orders = 0;
  let periodsEnded = 0;
  let renewed = 0;
  for (const a of acquisitions) {
    const paid = [...(paymentsByUser.get(a.userId) ?? [])].sort((x, y) => x.paidAt.getTime() - y.paidAt.getTime());
    const first = paid[0];
    if (!first) continue;
    buyers++;
    for (const p of paid) {
      const age = p.paidAt.getTime() - a.firstSeenAt.getTime();
      if (age <= 7 * DAY) revenueD7 += p.amountIdr;
      if (age <= 30 * DAY) revenueD30 += p.amountIdr;
      revenueAll += p.amountIdr;
      orders++;
    }
    const firstEnds = new Date(first.paidAt);
    firstEnds.setUTCMonth(firstEnds.getUTCMonth() + first.months);
    if (firstEnds <= now) {
      periodsEnded++;
      if (paid.length > 1) renewed++;
    }
  }
  // No spend entered (organic, or spend not imported yet): no CAC rather than a misleading 0.
  const cac = spendIdr > 0 ? ratio(spendIdr, buyers) : null;
  const aov = ratio(revenueAll, orders);
  const renewalRate = ratio(renewed, periodsEnded);
  const ltv = aov === null ? null : aov / (1 - Math.min(renewalRate ?? 0, MAX_RENEWAL_FOR_LTV));
  return {
    spendIdr,
    buyers,
    cacIdr: cac === null ? null : Math.round(cac),
    revenueD7Idr: revenueD7,
    revenueD30Idr: revenueD30,
    roasD7: round2(ratio(revenueD7, spendIdr)),
    roasD30: round2(ratio(revenueD30, spendIdr)),
    aovIdr: aov === null ? null : Math.round(aov),
    renewalRate: round2(renewalRate),
    ltvIdr: ltv === null ? null : Math.round(ltv),
    ltvMinusCacIdr: ltv === null || cac === null ? null : Math.round(ltv - cac),
  };
}

/**
 * Totals (blended: all spend over all new buyers, including organic ones) and one row per
 * campaign, joined on utm_campaign = the spend's campaign name. Buyers without a campaign get the
 * row `campaign: null`.
 */
export function computeEconomics(input: {
  spend: SpendEntry[];
  acquisitions: Acquisition[];
  payments: PaidPayment[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const byUser = new Map<string, PaidPayment[]>();
  for (const p of input.payments) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  const spendBy = new Map<string, number>();
  for (const s of input.spend) spendBy.set(s.campaign, (spendBy.get(s.campaign) ?? 0) + s.amountIdr);
  const campaigns = new Set<string | null>([...spendBy.keys(), ...input.acquisitions.map((a) => a.campaign)]);
  const totalSpend = [...spendBy.values()].reduce((a, b) => a + b, 0);
  return {
    totals: metricsFor(totalSpend, input.acquisitions, byUser, now),
    campaigns: [...campaigns]
      .map((campaign) => ({
        campaign,
        ...metricsFor(
          campaign === null ? 0 : (spendBy.get(campaign) ?? 0),
          input.acquisitions.filter((a) => a.campaign === campaign),
          byUser,
          now,
        ),
      }))
      .sort((a, b) => b.spendIdr - a.spendIdr || b.buyers - a.buyers),
  };
}

// ---- Funnel ----------------------------------------------------------------------------------

export type FunnelStepResult = {
  step: string;
  visitors: number;
  /** Conversion from the previous step (null for the first step or when the previous had 0). */
  rate: number | null;
  benchmark: number | null;
  below: boolean;
  /** The first step below its benchmark: the layer to fix first (/funnel-diagnose). */
  firstBad: boolean;
};

/** Distinct visitors per step and step-to-step conversion, flagged against benchmarks. */
export function computeFunnel(
  events: { event: string; visitor: string }[],
  steps: readonly string[],
  benchmarks: Partial<Record<string, number>>,
): FunnelStepResult[] {
  const seen = new Map<string, Set<string>>(steps.map((s) => [s, new Set()]));
  for (const e of events) seen.get(e.event)?.add(e.visitor);
  let flagged = false;
  return steps.map((step, i) => {
    const visitors = seen.get(step)?.size ?? 0;
    const prev = i > 0 ? (seen.get(steps[i - 1] as string)?.size ?? 0) : 0;
    const rate = i > 0 && prev > 0 ? Math.round((visitors / prev) * 1000) / 1000 : null;
    const benchmark = benchmarks[step] ?? null;
    const below = rate !== null && benchmark !== null && rate < benchmark;
    const firstBad = below && !flagged;
    if (below) flagged = true;
    return { step, visitors, rate, benchmark, below, firstBad };
  });
}

// ---- Target CAC ------------------------------------------------------------------------------

/**
 * Breakeven and target CAC for a price (or an LTV): what one buyer may cost in ad spend before
 * the purchase loses money. Net revenue = price × (1 − payment fee); real ad cost = spend ×
 * (1 + ad tax). Target = breakeven × factor (slightly under, for safety).
 */
export function cacTargets(input: {
  priceIdr: number;
  paymentFeePercent: number;
  adTaxPercent: number;
  targetFactor: number;
}) {
  const net = input.priceIdr * (1 - input.paymentFeePercent / 100);
  const breakeven = net / (1 + input.adTaxPercent / 100);
  return {
    netRevenueIdr: Math.round(net),
    breakevenCacIdr: Math.round(breakeven),
    targetCacIdr: Math.round(breakeven * input.targetFactor),
  };
}
