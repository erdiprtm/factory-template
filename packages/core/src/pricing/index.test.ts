import { describe, expect, it } from "vitest";
import {
  cheapestPerWeekIdr,
  comparedPlan,
  highlightedPlan,
  methodChips,
  methodLabel,
  perWeekIdr,
  savingVs,
} from "./index";

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

  it("highlights the configured plan, else the longest, and compares it with the next shorter", () => {
    expect(highlightedPlan([six, twelve])?.id).toBe("12m");
    expect(highlightedPlan([{ ...six, highlight: true }, twelve])?.id).toBe("6m");
    expect(comparedPlan([six, twelve], twelve)?.id).toBe("6m");
    expect(comparedPlan([six, twelve], six)).toBeUndefined();
    expect([methodLabel("SHOPEEPAY"), methodLabel("NEWPAY")]).toEqual(["ShopeePay", "NEWPAY"]);
  });

  it("method chips are compact: bank virtual accounts share one, where the first was (D-098)", () => {
    expect(methodChips(["qris", "bri_va", "bni_va", "bsi_va"])).toEqual(["QRIS", "VA BRI · BNI · BSI"]);
    expect(methodChips(["bri_va", "qris", "cimb_niaga_va"])).toEqual(["VA BRI · CIMB Niaga", "QRIS"]);
    expect(methodChips(["QRIS", "SHOPEEPAY", "VIRTUAL_ACCOUNT"])).toEqual(["QRIS", "ShopeePay", "Virtual Account"]);
    expect(methodChips([])).toEqual([]);
  });
});
