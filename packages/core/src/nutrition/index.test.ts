import { describe, expect, it } from "vitest";
import { atwaterKcal, checkMacros } from "./index";

// D-082: plausibility checks for AI estimates (and labels read from photos).
describe("checkMacros", () => {
  it("passes real foods", () => {
    // Siomay with peanut sauce, about 200 g.
    expect(checkMacros({ grams: 200, kcal: 360, protein: 18, carbs: 38, fat: 15 })).toEqual({ ok: true, problems: [] });
    // A protein drink, 250 ml, 14 g protein on the front.
    expect(checkMacros({ grams: 250, kcal: 130, protein: 14, carbs: 15, fat: 1.5 }).ok).toBe(true);
    // Butter: dense but possible.
    expect(checkMacros({ grams: 10, kcal: 72, protein: 0.1, carbs: 0, fat: 8.1 }).ok).toBe(true);
  });

  it("flags macros heavier than the item and impossible energy density", () => {
    const r = checkMacros({ grams: 20, kcal: 400, protein: 30, carbs: 10, fat: 5 });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(expect.arrayContaining(["protein_over_grams", "macros_over_grams", "kcal_too_dense"]));
  });

  it("flags kcal that doesn't match 4·P + 4·C + 9·F, within a tolerance", () => {
    expect(atwaterKcal({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
    expect(checkMacros({ grams: 150, kcal: 180, protein: 10, carbs: 20, fat: 5 }).ok).toBe(true);
    expect(checkMacros({ grams: 150, kcal: 600, protein: 10, carbs: 20, fat: 5 }).problems).toContain("kcal_mismatch");
    // Small items: an absolute floor, so rounding on a 5 g snack doesn't fail.
    expect(checkMacros({ grams: 5, kcal: 25, protein: 0.5, carbs: 1, fat: 1 }).ok).toBe(true);
  });

  it("checks the portion against the kind's range, and rejects missing or negative numbers", () => {
    expect(checkMacros({ grams: 3000, kcal: 3000, protein: 100, carbs: 400, fat: 100 }).problems).toContain(
      "grams_out_of_range",
    );
    expect(
      checkMacros({ grams: 600, kcal: 300, protein: 1, carbs: 70, fat: 1 }, { gramsRange: [5, 500] }).problems,
    ).toContain("grams_out_of_range");
    expect(checkMacros({ grams: 100, kcal: Number.NaN, protein: 1, carbs: 1, fat: 1 })).toEqual({
      ok: false,
      problems: ["not_a_number"],
    });
    expect(checkMacros({ grams: 100, kcal: 100, protein: -1, carbs: 1, fat: 1 }).ok).toBe(false);
    expect(checkMacros({ grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 }).ok).toBe(false);
  });
});
