import { describe, expect, it } from "vitest";
import {
  estimateMicroUsd,
  formatRp,
  macrosInRange,
  matchesItem,
  normalizeName,
  percentile,
  scoreCall,
  summarize,
} from "./eval";
import type { AiResult } from "./index";

// AI eval scoring (D-085). The whole CLI on a fixture set is tested in scripts/ai-eval.test.mjs.
const ok = (output: unknown): AiResult => ({
  ok: true,
  output,
  model: "gpt-6-luna",
  tier: "default",
  usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 },
  latencyMs: 10,
});
const score = (o: unknown) => o as { items: string[]; macros?: Record<string, number> } | null;

describe("item matching", () => {
  it("matches the name or an alias, ignoring case, accents and punctuation", () => {
    const siomay = [{ name: "Siomay", aliases: ["somay", "Siomay Bandung"] }];
    expect(normalizeName("  Sómay (Ikan)! ")).toBe("somay ikan");
    expect(matchesItem("SIOMAY", siomay)).toBe(true);
    expect(matchesItem("Sómay", siomay)).toBe(true);
    expect(matchesItem("siomay-bandung", siomay)).toBe(true);
    expect(matchesItem("Batagor", siomay)).toBe(false);
    expect(matchesItem("Siomay ikan", siomay)).toBe(false); // exact after normalizing: add an alias
    expect(matchesItem("", [{ name: "" }])).toBe(false);
  });

  it("top-1 is the first name, top-3 the first three, against any expected item", () => {
    const expected = { file: "x.jpg", items: [{ name: "Nasi goreng" }, { name: "Telur ceplok" }] };
    const second = scoreCall(expected, ok({ items: ["Nasi uduk", "Telur ceplok"] }), { score }, false);
    expect([second.top1, second.top3]).toEqual([false, true]);
    const fourth = scoreCall(expected, ok({ items: ["A", "B", "C", "Nasi goreng"] }), { score }, false);
    expect([fourth.top1, fourth.top3]).toEqual([false, false]);
    expect(scoreCall(expected, ok({ items: ["nasi goreng"] }), { score }, false).top1).toBe(true);
  });
});

describe("macro ranges", () => {
  it("counts each range: inclusive bounds, missing or non-numbers are out", () => {
    const ranges = { protein: [10, 25] as [number, number], carbs: [40, 80] as [number, number] };
    expect(macrosInRange(ranges, { protein: 10, carbs: 80 })).toEqual([true, true]);
    expect(macrosInRange(ranges, { protein: 9.9, carbs: 81 })).toEqual([false, false]);
    expect(macrosInRange(ranges, { protein: 12 })).toEqual([true, false]);
    expect(macrosInRange(ranges, undefined)).toEqual([false, false]);
    expect(macrosInRange(undefined, { protein: 12 })).toEqual([]);
  });

  it("a failed or unscorable call scores every range as out", () => {
    const expected = { file: "x.jpg", items: [{ name: "Siomay" }], macros: { protein: [10, 25] as [number, number] } };
    const refused: AiResult = { ok: false, error: "refused", model: "m", tier: "default", usage: null, latencyMs: 5 };
    expect(scoreCall(expected, refused, { score }, false).macros).toEqual([false]);
    const thrown = scoreCall(
      expected,
      ok({}),
      {
        score: () => {
          throw new Error("bad");
        },
      },
      false,
    );
    expect(thrown.prediction).toBeNull();
  });
});

describe("numbers", () => {
  it("nearest-rank percentiles", () => {
    expect(percentile([400, 100, 300, 200], 50)).toBe(200);
    expect(percentile([400, 100, 300, 200], 90)).toBe(400);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });

  it("estimates from list prices; mock is free, unknown is null", () => {
    const cfg = (model: string, mock = false) => ({ label: model, model, tier: "default" as const, mock });
    const e = estimateMicroUsd([cfg("gpt-6-luna"), cfg("mock", true), cfg("gpt-unpriced-1")], 10, {
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(e.map((x) => x.microUsd)).toEqual([6000, 0, null]);
    expect(formatRp(29.7)).toBe("Rp 29,7");
    expect(formatRp(20000)).toBe("Rp 20.000");
  });

  it("an unknown price shows n/a instead of a made-up cost", () => {
    const expected = { file: "x.jpg", items: [{ name: "Siomay" }] };
    const call = scoreCall(expected, { ...ok({ items: ["Siomay"] }), model: "gpt-unpriced-1" }, { score }, false);
    const s = summarize(
      { config: { label: "x", model: "gpt-unpriced-1", tier: "default", mock: false }, calls: [call] },
      16500,
    );
    expect([s.top1, s.perScan, s.total]).toEqual(["100% (1/1)", "n/a", "n/a"]);
  });
});
