import { describe, expect, it } from "vitest";
import {
  estimateMicroUsd,
  formatRp,
  macrosInRange,
  matchesItem,
  normalizeName,
  percentile,
  renderReport,
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

  it("uses the config's own prices for the estimate (D-091)", () => {
    const own = {
      label: "new",
      model: "gemini-9-new",
      tier: "default" as const,
      mock: false,
      prices: { "gemini-9-new": { input: 1, cachedInput: 0, output: 1 } },
    };
    expect(estimateMicroUsd([own], 10, { inputTokens: 1000, outputTokens: 1000 })[0]?.microUsd).toBe(20000);
  });

  it("the report names why a model failed, once (D-091)", () => {
    const expected = { file: "x.jpg", items: [{ name: "Siomay" }] };
    const bad = {
      ok: false as const,
      error: "bad_request" as const,
      model: "gemini-3.8-flash",
      tier: "default" as const,
      usage: null,
      latencyMs: 5,
      detail: "INVALID_ARGUMENT: thinking_level 'minimal' is not supported",
    };
    const calls = [scoreCall(expected, bad, { score }, false), scoreCall(expected, bad, { score }, false)];
    const md = renderReport(
      [{ config: { label: "gemini-3.8-flash", model: "gemini-3.8-flash", tier: "default", mock: false }, calls }],
      {
        usdIdr: 16500,
        date: "2026-10-19",
      },
    );
    expect(md).toContain("## Errors (first reason per model)");
    expect(md).toContain(
      "- gemini-3.8-flash: 2× bad_request: INVALID_ARGUMENT: thinking_level 'minimal' is not supported",
    );
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
