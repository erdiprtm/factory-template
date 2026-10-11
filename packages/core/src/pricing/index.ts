// Price framing for landers and the paywall (sell engine, D-035/D-037). Pure: no database.
// Indonesian buyers compare against small daily/weekly spends, so plans are also shown per week.

export type PricedPlan = { id: string; months: number; priceIdr: number };

const WEEKS_PER_MONTH = 52 / 12;

/** The plan's price per week, rounded to the nearest Rp100 ("≈ Rp4.800/minggu"). */
export function perWeekIdr(plan: PricedPlan): number {
  return Math.max(100, Math.round(plan.priceIdr / (plan.months * WEEKS_PER_MONTH) / 100) * 100);
}

/** The lowest per-week price across plans (for "mulai dari ≈ …/minggu"). */
export function cheapestPerWeekIdr(plans: readonly PricedPlan[]): number {
  return Math.min(...plans.map(perWeekIdr));
}

/**
 * How much the longer plan saves against buying the shorter one repeatedly for the same months,
 * e.g. 12 months vs two 6-month plans. Null when it doesn't save anything.
 */
export function savingVs(longer: PricedPlan, shorter: PricedPlan): { idr: number; percent: number } | null {
  if (longer.months <= shorter.months) return null;
  const sameMonths = (shorter.priceIdr / shorter.months) * longer.months;
  const idr = Math.round(sameMonths - longer.priceIdr);
  if (idr <= 0) return null;
  return { idr, percent: Math.round((idr / sameMonths) * 100) };
}
