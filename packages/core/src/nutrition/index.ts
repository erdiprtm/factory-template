// Plausibility checks for nutrition numbers (D-082). An AI estimate may be shown only when it's
// labelled, editable and passes these checks in code; a failing one is shown as "cek lagi" and the
// user confirms or edits it. Products keep their own scan pipeline; these rules are shared.

/** Where a number came from. Every number shown to users says which (CLAUDE.md guardrails). */
export type NutritionSource = "label" | "curated" | "ai_estimate";

export type Macros = {
  /** The portion's weight (or volume in ml for drinks), > 0. */
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MacroProblem =
  | "not_a_number"
  | "grams_out_of_range"
  | "protein_over_grams"
  | "carbs_over_grams"
  | "fat_over_grams"
  | "macros_over_grams"
  | "kcal_too_dense"
  | "kcal_mismatch";

export type MacroCheck = { ok: boolean; problems: MacroProblem[] };

export type MacroCheckOptions = {
  /** Plausible portion sizes for this kind of item, e.g. [5, 500] for a snack. Default [1, 2000]. */
  gramsRange?: readonly [number, number];
  /** Max energy density. Default 900 kcal per 100 g (pure fat is ~900). */
  maxKcalPer100g?: number;
  /**
   * How far kcal may be from 4·protein + 4·carbs + 9·fat (fibre, alcohol and rounding move it).
   * Default: 25% of the larger value, but at least 25 kcal.
   */
  energyTolerance?: { relative: number; absolute: number };
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Atwater energy from macros (kcal). */
export const atwaterKcal = (m: Pick<Macros, "protein" | "carbs" | "fat">) => 4 * m.protein + 4 * m.carbs + 9 * m.fat;

/**
 * Checks that an item's numbers can be true. Pure; use it on AI estimates before showing them,
 * and on labels read from photos (a misread digit fails here too).
 */
export function checkMacros(m: Macros, o: MacroCheckOptions = {}): MacroCheck {
  const values = [m.grams, m.kcal, m.protein, m.carbs, m.fat];
  if (!values.every(finite) || m.grams <= 0) return { ok: false, problems: ["not_a_number"] };
  const problems: MacroProblem[] = [];
  const [min, max] = o.gramsRange ?? [1, 2000];
  if (m.grams < min || m.grams > max) problems.push("grams_out_of_range");
  if (m.protein > m.grams) problems.push("protein_over_grams");
  if (m.carbs > m.grams) problems.push("carbs_over_grams");
  if (m.fat > m.grams) problems.push("fat_over_grams");
  if (m.protein + m.carbs + m.fat > m.grams) problems.push("macros_over_grams");
  if (m.kcal > ((o.maxKcalPer100g ?? 900) * m.grams) / 100) problems.push("kcal_too_dense");
  const tol = o.energyTolerance ?? { relative: 0.25, absolute: 25 };
  const expected = atwaterKcal(m);
  const allowed = Math.max(tol.absolute, tol.relative * Math.max(expected, m.kcal));
  if (Math.abs(m.kcal - expected) > allowed) problems.push("kcal_mismatch");
  return { ok: problems.length === 0, problems };
}
