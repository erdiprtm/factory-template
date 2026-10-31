import { describe, expect, it } from "vitest";
import {
  funnelText,
  helpText,
  kpiText,
  lastPaymentsText,
  OWNER_COMMANDS,
  parseCommand,
  sameSecret,
  sourcesText,
} from "./commands";

// D-114: the owner's Telegram commands, as text.
describe("parseCommand", () => {
  it("reads /command, /command@Bot and trailing words; anything else is no command", () => {
    expect(parseCommand("/minggu")).toBe("minggu");
    expect(parseCommand("/Hari_Ini@MynaFitBot tolong")).toBe("hari_ini");
    expect(parseCommand("halo")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
    expect(parseCommand("/")).toBeNull();
  });

  it("registers commands Telegram accepts (1–32 lowercase letters, digits, underscores)", () => {
    for (const c of OWNER_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });
});

describe("answers", () => {
  it("KPIs with ▲/▼ against the previous period", () => {
    const text = kpiText("P", "7 hari", {
      revenueIdr: { value: 500000, trend: 0.25 },
      buyers: { value: 2, trend: -0.5 },
      renewals: { value: 0, trend: 0 },
      visitors: { value: 40, trend: null },
      conversion: { value: 0.05, trend: null },
      activePaid: { value: 7, trend: null },
    });
    expect(text).toContain("Pendapatan bersih: Rp500.000 (▲ 25%)");
    expect(text).toContain("Pembeli baru: 2 (▼ 50%)");
    expect(text).toContain("Pengunjung: 40\n");
    expect(text).toContain("Kunjungan → beli: 5%");
  });

  it("the funnel marks its biggest drop; sources and payments read plainly", () => {
    const f = funnelText(
      "P",
      [
        { step: "lp_view", visitors: 100, rate: null },
        { step: "purchase", visitors: 2, rate: 0.02 },
      ],
      "purchase",
    );
    expect(f).toContain("Lihat landing page: 100\n");
    expect(f).toContain("Beli: 2 (2%) ← penurunan terbesar");
    expect(sourcesText("P", [])).toContain("Belum ada data.");
    expect(
      sourcesText("P", [{ source: null, campaign: null, visitors: 3, buyers: 1, revenueIdr: 249000, roas: null }]),
    ).toContain("Langsung: 3 pengunjung · 1 pembeli · Rp249.000");
    const p = lastPaymentsText("P", [
      { status: "paid", planId: "12m", amountIdr: 249000, who: "er***@x.id", at: "2026-10-31T03:05:00.000Z" },
    ]);
    expect(p).toContain("31-10 10:05 WIB · Berhasil · 12m · Rp249.000 · er***@x.id");
    expect(lastPaymentsText("P", [])).toContain("Belum ada pembayaran.");
    expect(helpText("P")).toContain("/funnel: ");
  });
});

describe("sameSecret", () => {
  it("matches only the exact secret", () => {
    expect(sameSecret("s3cret", "s3cret")).toBe(true);
    expect(sameSecret("s3creT", "s3cret")).toBe(false);
    expect(sameSecret("s3cre", "s3cret")).toBe(false);
    expect(sameSecret(null, "s3cret")).toBe(false);
  });
});
