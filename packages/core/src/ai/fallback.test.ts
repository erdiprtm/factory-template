import { describe, expect, it, vi } from "vitest";
import { type AiProvider, type AiResult, costMicroUsd, geminiProvider, listPrice, withFallback } from "./index";

// D-091: a cross-provider fallback, and prices for gemini-3.1-flash-lite and from config.
const req = { system: "s", text: "t", schema: { name: "x", schema: { type: "object" } } };
const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 };
const ok = (model: string): AiResult => ({ ok: true, output: {}, model, tier: "default", usage, latencyMs: 1 });
const fail = (model: string, error: "unavailable" | "quota" | "rate_limited" | "bad_output" | "refused"): AiResult => ({
  ok: false,
  error,
  model,
  tier: "default",
  usage: null,
  latencyMs: 1,
});
const provider = (answer: AiResult): AiProvider & { calls: number } => {
  const p = { name: "gemini" as const, calls: 0, json: async () => (p.calls++, answer) };
  return p;
};

describe("withFallback", () => {
  it("primary ok: the fallback is never called", async () => {
    const primary = provider(ok("gemini-3.1-flash-lite"));
    const backup = provider(ok("bytedance-seed/seed-2.0-lite"));
    expect((await withFallback(primary, backup).json(req)).model).toBe("gemini-3.1-flash-lite");
    expect(backup.calls).toBe(0);
  });

  it("primary unavailable, out of credit or rate limited: the fallback answers, marked as such", async () => {
    for (const error of ["unavailable", "quota", "rate_limited"] as const) {
      const r = await withFallback(
        provider(fail("gemini-3.1-flash-lite", error)),
        provider(ok("bytedance-seed/seed-2.0-lite")),
      ).json(req);
      expect(r).toMatchObject({
        ok: true,
        model: "bytedance-seed/seed-2.0-lite",
        fallbackFrom: { model: "gemini-3.1-flash-lite", error },
      });
    }
  });

  it("bad output or a refusal is never retried elsewhere", async () => {
    for (const error of ["bad_output", "refused"] as const) {
      const backup = provider(ok("bytedance-seed/seed-2.0-lite"));
      const r = await withFallback(provider(fail("gemini-3.1-flash-lite", error)), backup).json(req);
      expect(r).toMatchObject({ ok: false, error, model: "gemini-3.1-flash-lite" });
      expect(backup.calls).toBe(0);
    }
  });
});

describe("prices (D-091)", () => {
  it("gemini-3.1-flash-lite has Google's paid price, read 2026-10-19", () => {
    expect(listPrice("gemini-3.1-flash-lite")).toEqual({ input: 0.25, cachedInput: 0.025, output: 1.5 });
    expect(listPrice("google/gemini-3.1-flash-lite")).toEqual({ input: 0.25, cachedInput: 0.025, output: 1.5 });
    // 1,000 input + 100 output tokens = 250 + 150 micro-USD.
    expect(costMicroUsd("gemini-3.1-flash-lite", "default", usage)).toBe(400);
  });

  it("a product's own price extends or overrides the list", () => {
    const prices = {
      "gemini-9-new": { input: 1, cachedInput: 0.1, output: 2 },
      "gemini-3.1-flash-lite": { input: 0.5, cachedInput: 0, output: 1 },
    };
    expect(costMicroUsd("gemini-9-new", "default", usage)).toBeNull();
    expect(costMicroUsd("gemini-9-new", "default", usage, new Date(), prices)).toBe(1200);
    expect(costMicroUsd("gemini-3.1-flash-lite", "default", usage, new Date(), prices)).toBe(600);
  });

  it("the Gemini provider reports the product's own price on the result", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        id: "i-1",
        object: "interaction",
        status: "completed",
        model: "gemini-9-new",
        steps: [{ type: "model_output", content: [{ type: "text", text: "{}" }] }],
        usage: { total_input_tokens: 1000, total_cached_tokens: 0, total_output_tokens: 100, total_thought_tokens: 0 },
      }),
    );
    const prices = { "gemini-9-new": { input: 1, cachedInput: 0.1, output: 2 } };
    const r = await geminiProvider({ apiKey: "k", model: "gemini-9-new", prices, fetch }).json(req);
    expect(r).toMatchObject({ ok: true, costMicroUsd: 1200 });
  });
});
