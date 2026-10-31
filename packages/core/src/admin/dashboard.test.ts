import { describe, expect, it } from "vitest";
import { biggestDrop } from "../economics/metrics";
import { rangeWindow, trend } from "./dashboard";

// D-113: the dashboard's pure parts.
describe("rangeWindow", () => {
  it("covers whole Jakarta days, today included, and the previous equal period", () => {
    const now = new Date("2026-10-31T01:00:00Z"); // 08:00 WIB on the 31st
    const today = rangeWindow("today", now);
    expect(new Date(today.start).toISOString()).toBe("2026-10-30T17:00:00.000Z"); // 00:00 WIB
    expect(today.end - today.start).toBe(86_400_000);
    const week = rangeWindow("7d", now);
    expect(week.days).toBe(7);
    expect(week.start - week.prevStart).toBe(7 * 86_400_000);
  });
});

describe("trend", () => {
  it("is the change against the previous period, null when there was nothing before", () => {
    expect(trend(125, 100)).toBe(0.25);
    expect(trend(50, 100)).toBe(-0.5);
    expect(trend(0, 0)).toBe(0);
    expect(trend(10, 0)).toBeNull();
  });
});

describe("biggestDrop", () => {
  const step = (s: string, rate: number | null) => ({
    step: s,
    visitors: 0,
    rate,
    benchmark: null,
    below: false,
    firstBad: false,
  });
  it("names the step with the lowest step rate, none without data or losses", () => {
    expect(biggestDrop([step("lp_view", null), step("quiz_start", 0.6), step("purchase", 0.1)])).toBe("purchase");
    expect(biggestDrop([step("lp_view", null), step("quiz_start", null)])).toBeNull();
    expect(biggestDrop([step("lp_view", null), step("quiz_start", 1)])).toBeNull();
  });
});
