import { describe, expect, it } from "vitest";
import { parseAmount, parseCsv, parseDay, spendFromMetaCsv } from "./csv";
import { cacTargets, computeConsent, computeEconomics, computeFunnel } from "./metrics";

const d = (s: string) => new Date(s);
const now = d("2027-12-01T00:00:00Z");

describe("computeEconomics", () => {
  // Campaign A: Rp1.000.000 spend, 2 buyers. u1 buys 249k on day 2 and renews after 12 months;
  // u2 buys 149k on day 10 (after d7, inside d30). u3 came from A but never bought.
  const input = {
    now,
    spend: [
      { date: "2026-10-01", channel: "meta", campaign: "A", amountIdr: 600_000 },
      { date: "2026-10-02", channel: "meta", campaign: "A", amountIdr: 400_000 },
      { date: "2026-10-01", channel: "meta", campaign: "B", amountIdr: 300_000 },
    ],
    acquisitions: [
      { userId: "u1", campaign: "A", firstSeenAt: d("2026-10-01T00:00:00Z") },
      { userId: "u2", campaign: "A", firstSeenAt: d("2026-10-01T00:00:00Z") },
      { userId: "u3", campaign: "A", firstSeenAt: d("2026-10-01T00:00:00Z") },
      { userId: "u4", campaign: null, firstSeenAt: d("2026-10-02T00:00:00Z") },
    ],
    payments: [
      { userId: "u1", amountIdr: 249_000, paidAt: d("2026-10-03T00:00:00Z"), months: 12 },
      { userId: "u1", amountIdr: 249_000, paidAt: d("2027-10-03T00:00:00Z"), months: 12 },
      { userId: "u2", amountIdr: 149_000, paidAt: d("2026-10-11T00:00:00Z"), months: 6 },
      { userId: "u4", amountIdr: 149_000, paidAt: d("2026-10-02T01:00:00Z"), months: 6 },
    ],
  };
  const { totals, campaigns } = computeEconomics(input);
  const a = campaigns.find((c) => c.campaign === "A");
  const b = campaigns.find((c) => c.campaign === "B");

  it("CAC and ROAS d7/d30 per campaign", () => {
    expect(a).toMatchObject({
      spendIdr: 1_000_000,
      buyers: 2,
      cacIdr: 500_000,
      revenueD7Idr: 249_000,
      revenueD30Idr: 398_000,
    });
    expect(a?.roasD7).toBe(0.25);
    expect(a?.roasD30).toBe(0.4);
    expect(b).toMatchObject({ spendIdr: 300_000, buyers: 0, cacIdr: null, roasD7: 0 });
  });

  it("AOV, renewal rate and LTV", () => {
    // Orders 249k, 249k, 149k → AOV 215.667; both first periods ended (12m and 6m), 1 of 2 renewed.
    expect(a?.aovIdr).toBe(215_667);
    expect(a?.renewalRate).toBe(0.5);
    expect(a?.ltvIdr).toBe(431_333);
    expect(a?.ltvMinusCacIdr).toBe(-68_667);
  });

  it("blended totals include organic buyers and all spend", () => {
    expect(totals).toMatchObject({ spendIdr: 1_300_000, buyers: 3, cacIdr: 433_333 });
    expect(campaigns.find((c) => c.campaign === null)).toMatchObject({ spendIdr: 0, buyers: 1, cacIdr: null });
  });
});

describe("computeFunnel", () => {
  it("counts distinct visitors per step and flags the first step below its benchmark", () => {
    const events = [
      ...["a", "b", "c", "d"].map((v) => ({ event: "lp_view", visitor: v })),
      ...["a", "b", "c"].map((v) => ({ event: "cta_tap", visitor: v })),
      { event: "cta_tap", visitor: "a" },
      { event: "quiz_start", visitor: "a" },
      { event: "purchase", visitor: "a" },
      // Entered midway (straight to checkout): not counted past the first step it skipped.
      { event: "purchase", visitor: "z" },
    ];
    const f = computeFunnel(events, ["lp_view", "cta_tap", "quiz_start", "purchase"], {
      cta_tap: 0.5,
      quiz_start: 0.5,
      purchase: 0.5,
    });
    expect(f.map((s) => [s.step, s.visitors, s.rate, s.below, s.firstBad])).toEqual([
      ["lp_view", 4, null, false, false],
      ["cta_tap", 3, 0.75, false, false],
      ["quiz_start", 1, 0.333, true, true],
      ["purchase", 1, 1, false, false],
    ]);
  });
});

describe("cacTargets", () => {
  it("breakeven = price after fee, over 1 + ad tax; target slightly under", () => {
    expect(cacTargets({ priceIdr: 249_000, paymentFeePercent: 2, adTaxPercent: 11, targetFactor: 0.9 })).toEqual({
      netRevenueIdr: 244_020,
      breakevenCacIdr: 219_838,
      targetCacIdr: 197_854,
    });
  });
});

describe("Meta Ads Manager CSV", () => {
  it("parses quoted fields and both separators", () => {
    expect(parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n')).toEqual([
      ["a", "b,c", 'd "q"'],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads IDR amounts and days in either locale", () => {
    expect(
      ["150000", "150000.4", "150.000", "1.500.000", "1,500,000.25", "1.500.000,50", "Rp 75.000", "x"].map(parseAmount),
    ).toEqual([150_000, 150_000, 150_000, 1_500_000, 1_500_000, 1_500_001, 75_000, null]);
    expect([parseDay("2026-10-11"), parseDay("1/10/2026"), parseDay("Oct 1")]).toEqual([
      "2026-10-11",
      "2026-10-01",
      null,
    ]);
  });

  it("imports a daily English export, summing duplicate day+campaign rows", () => {
    const csv = [
      "Day,Campaign name,Amount spent (IDR),Reporting starts,Reporting ends",
      "2026-10-01,Promo A,100000,2026-10-01,2026-10-01",
      "2026-10-01,Promo A,50000,2026-10-01,2026-10-01",
      "2026-10-02,Promo B,75000.5,2026-10-02,2026-10-02",
      ",,225000.5,,", // the summary row has no campaign
    ].join("\n");
    expect(spendFromMetaCsv(csv)).toEqual({
      rows: [
        { date: "2026-10-01", channel: "meta", campaign: "Promo A", amountIdr: 150_000 },
        { date: "2026-10-02", channel: "meta", campaign: "Promo B", amountIdr: 75_001 },
      ],
      errors: [],
    });
  });

  it("imports an Indonesian export without a Day column when each row is one day; explains multi-day rows", () => {
    const csv = [
      "Nama kampanye;Awal pelaporan;Akhir pelaporan;Jumlah yang dibelanjakan (IDR)",
      "Promo A;2026-10-01;2026-10-01;100.000",
      "Promo B;2026-10-01;2026-10-07;700.000",
    ].join("\n");
    const r = spendFromMetaCsv(csv);
    expect(r.rows).toEqual([{ date: "2026-10-01", channel: "meta", campaign: "Promo A", amountIdr: 100_000 }]);
    expect(r.errors[0]).toMatch(/Breakdown → By time → Day/);
    expect(spendFromMetaCsv("foo,bar\n1,2").errors).toHaveLength(3);
  });
});

describe("computeConsent (D-107)", () => {
  it("counts devices asked and their latest choice; asked and never answered = no choice", () => {
    const ev = (event: string, visitor: string) => ({ event, visitor });
    expect(
      computeConsent([
        ev("consent_shown", "a"),
        ev("consent_granted", "a"),
        ev("consent_shown", "b"),
        ev("consent_denied", "b"),
        ev("consent_shown", "c"),
        ev("consent_shown", "c"),
        ev("consent_denied", "d"), // answered on the site before asks were counted
        ev("consent_shown", "e"),
        ev("consent_denied", "e"),
        ev("consent_granted", "e"), // changed their mind: latest wins
        ev("lp_view", "f"),
      ]),
    ).toEqual({ shown: 5, granted: 2, denied: 2, noChoice: 1 });
    expect(computeConsent([])).toEqual({ shown: 0, granted: 0, denied: 0, noChoice: 0 });
  });
});
