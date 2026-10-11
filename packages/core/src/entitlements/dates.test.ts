import { describe, expect, it } from "vitest";
import { addMonths, nextPeriod } from "./dates";

const d = (iso: string) => new Date(iso);

describe("addMonths", () => {
  it("adds calendar months in UTC", () => {
    expect(addMonths(d("2026-01-15T10:00:00Z"), 6).toISOString()).toBe("2026-07-15T10:00:00.000Z");
    expect(addMonths(d("2026-10-11T00:00:00Z"), 12).toISOString()).toBe("2027-10-11T00:00:00.000Z");
  });
  it("clamps to the end of shorter months", () => {
    expect(addMonths(d("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(d("2027-08-31T00:00:00Z"), 6).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("nextPeriod (extends, never overlaps)", () => {
  const now = d("2026-10-11T00:00:00Z");
  it("starts now when there is no active entitlement", () => {
    const p = nextPeriod(now, null, { months: 6 });
    expect(p.startsAt).toEqual(now);
    expect(p.expiresAt.toISOString()).toBe("2027-04-11T00:00:00.000Z");
  });
  it("early renewal starts at the current expiry, so no days are lost", () => {
    const p = nextPeriod(now, d("2026-11-01T00:00:00Z"), { months: 12 });
    expect(p.startsAt.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(p.expiresAt.toISOString()).toBe("2027-11-01T00:00:00.000Z");
  });
  it("renewal after expiry starts now", () => {
    const p = nextPeriod(now, d("2026-09-01T00:00:00Z"), { months: 6 });
    expect(p.startsAt).toEqual(now);
  });
  it("supports day-based periods (trial, admin grant)", () => {
    expect(nextPeriod(now, null, { days: 7 }).expiresAt.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });
});
