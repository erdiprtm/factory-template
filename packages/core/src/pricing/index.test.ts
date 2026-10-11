import { describe, expect, it } from "vitest";
import { cheapestPerWeekIdr, perWeekIdr, savingVs } from "./index";

const six = { id: "6m", months: 6, priceIdr: 149_000 };
const twelve = { id: "12m", months: 12, priceIdr: 249_000 };

describe("pricing framing", () => {
  it("per week, rounded to Rp100", () => {
    expect(perWeekIdr(six)).toBe(5_700); // 149000 / 26 = 5730.8
    expect(perWeekIdr(twelve)).toBe(4_800); // 249000 / 52 = 4788.5
    expect(cheapestPerWeekIdr([six, twelve])).toBe(4_800);
  });

  it("the 12-month plan's saving vs buying 6 months twice", () => {
    expect(savingVs(twelve, six)).toEqual({ idr: 49_000, percent: 16 });
    expect(savingVs(six, twelve)).toBeNull();
    expect(savingVs({ id: "x", months: 12, priceIdr: 400_000 }, six)).toBeNull();
  });
});
