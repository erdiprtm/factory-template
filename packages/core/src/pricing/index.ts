// Price framing for landers and the paywall (sell engine, D-035/D-037). Pure: no database.
// Indonesian buyers compare against small daily/weekly spends, so plans are also shown per week.

import { pakasirMethod } from "../billing/pakasir-methods";

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

/** The plan to highlight: the configured one, else the longest (usually the 12-month plan). */
export function highlightedPlan<P extends PricedPlan & { highlight?: boolean }>(plans: readonly P[]): P | undefined {
  return plans.find((p) => p.highlight) ?? [...plans].sort((a, b) => b.months - a.months)[0];
}

/** The plan a longer one is compared with for its saving: the next shorter one. */
export function comparedPlan<P extends PricedPlan>(plans: readonly P[], plan: P): P | undefined {
  return [...plans].filter((p) => p.months < plan.months).sort((a, b) => b.months - a.months)[0];
}

const METHOD_LABELS: Record<string, string> = {
  QRIS: "QRIS",
  DANA: "DANA",
  SHOPEEPAY: "ShopeePay",
  OVO: "OVO",
  GOPAY: "GoPay",
  LINKAJA: "LinkAja",
  VIRTUAL_ACCOUNT: "Virtual Account",
};

/** Display names for product.config.ts payments.methods (unknown codes are shown as given). */
export const methodLabel = (code: string) => METHOD_LABELS[code] ?? pakasirMethod(code)?.label ?? code;

/**
 * Compact chips for /pricing (D-098): one per method, except bank virtual accounts, which share one
 * chip ("VA BRI · BNI · BSI"). Config order is kept, the VA chip where the first VA was.
 */
export function methodChips(codes: readonly string[]): string[] {
  const chips: string[] = [];
  const banks: string[] = [];
  let vaAt = -1;
  for (const code of codes) {
    const bank = pakasirMethod(code)?.bank;
    if (!bank) {
      chips.push(methodLabel(code));
      continue;
    }
    if (vaAt === -1) {
      vaAt = chips.length;
      chips.push("");
    }
    banks.push(bank);
  }
  if (vaAt !== -1) chips[vaAt] = `VA ${banks.join(" · ")}`;
  return chips;
}

// Pakasir's method codes, labels and limits, for the app's own checkout (D-092).
export { PAKASIR_METHODS, type PakasirMethod, pakasirMethod, pakasirMethodsFor } from "../billing/pakasir-methods";
