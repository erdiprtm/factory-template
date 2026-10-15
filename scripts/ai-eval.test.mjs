import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, parseConfigs, parseModelFlag } from "./ai-eval.mjs";

// `pnpm ai:eval` (D-085) on the committed fixture set, with a fake provider in place of the real
// one and a fixture product module (not the product's own, D-078). No network, no keys.
const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = "scripts/fixtures/ai-eval";
const PRODUCT = `${FIXTURE}/product.mjs`;
const load = (rel) => import(path.resolve(ROOT, rel));
const { strictAiSchema: aiSchema } = await import("../packages/config/src/index.ts");

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 1000 };
// The fixture PNGs are 1×1 … 4×4; the low byte of the IHDR width picks the answer.
const answers = {
  1: { ok: true, output: { items: [{ name: "Somay", alternatives: [] }], macros: { protein: 18 } } },
  2: { ok: true, output: { items: [{ name: "Nasi uduk", alternatives: ["Nasi Goreng"] }], macros: { protein: 40 } } },
  3: { ok: true, output: { items: [] } },
  4: { ok: false, error: "unavailable", usage: null },
};
const fakeProvider = (config) => ({
  name: "openai",
  async json(req) {
    const w = req.image.bytes[19];
    return { model: config.model, tier: config.tier, usage, ...answers[w], latencyMs: w * 100 };
  },
});

function run(args, opts = {}) {
  const out = [];
  const err = [];
  let made = 0;
  const outFile = path.join(mkdtempSync(path.join(tmpdir(), "ai-eval-")), "report.md");
  const code = main(["--dir", FIXTURE, "--product", PRODUCT, "--out", outFile, ...args], {
    env: opts.env ?? {},
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    load,
    date: new Date("2026-10-15T09:30:00Z"),
    makeProvider: (config) => {
      made++;
      return fakeProvider(config);
    },
  });
  return code.then((c) => ({ code: c, out: out.join(""), err: err.join(""), made, outFile }));
}

const TABLE = `# AI eval, 2026-10-15 09:30

4 photos. Cost at USD 1 = Rp 16.500 (assumption), list prices, before PPN.

| Model | Top-1 | Top-3 | Macros in range | Schema fail / refused | Other errors | Median latency | p90 latency | Rp / scan | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| openai:gpt-6-luna | 25% (1/4) | 50% (2/4) | 33% (1/3) | 25% (1/4) | 25% (1/4) | 200 ms | 400 ms | Rp 7,4 | Rp 29,7 |
| mock | 25% (1/4) | – | 0% (0/3) | 0% (0/4) | 0% (0/4) | 0 ms | 0 ms | Rp 0 | Rp 0 |

## Per photo (first answer; ✓ = top-1 hit)

| Photo | openai:gpt-6-luna | mock |
| --- | --- | --- |
| siomay-1.png | ✓ Somay | ✓ Siomay |
| nasi-goreng.png | ✗ Nasi uduk | ✗ Siomay |
| gado-gado.png | ✗ schema | ✗ Siomay |
| teh-botol.png | ✗ unavailable | ✗ Siomay |
`;

describe("ai:eval", () => {
  it("scores the fixture set into a known table, on stdout and in the file", async () => {
    const r = await run([]);
    expect(r.err).not.toContain("ai:eval:");
    expect(r.code).toBe(0);
    expect(readFileSync(r.outFile, "utf8")).toBe(TABLE);
    expect(r.out).toContain(TABLE);
    expect(r.out).toContain("openai:gpt-6-luna: Rp 39,6"); // estimate: 4 × (1000 in + 1000 out)
  });

  it("stops at the cost gate without --yes, before any provider exists", async () => {
    const gated = await run(["--max-rp", "30"]);
    expect(gated.code).toBe(2);
    expect(gated.made).toBe(0);
    expect(gated.err).toContain("--yes");
    const yes = await run(["--max-rp", "30", "--yes"]);
    expect(yes.code).toBe(0);
    expect(yes.made).toBe(1);
  });

  it("needs --yes for a model without a known price", async () => {
    const r = await run(["--model", "openai:gpt-unpriced-1"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("unknown price");
  });

  it("never runs in CI unless asked", async () => {
    const r = await run([], { env: { CI: "true" } });
    expect(r.code).toBe(1);
    expect(r.made).toBe(0);
    expect((await run(["--allow-ci"], { env: { CI: "true" } })).code).toBe(0);
  });

  it("without a key the real factory would give the mock, so the run refuses instead of faking a score", async () => {
    const out = [];
    const err = [];
    const code = await main(["--dir", FIXTURE, "--product", PRODUCT, "--model", "openai:gpt-6-luna"], {
      env: {},
      out: (s) => out.push(s),
      err: (s) => err.push(s),
      load,
    });
    expect(code).toBe(1);
    expect(err.join("")).toContain("No API key");
  });

  it("validates configs with the real ai config schema", () => {
    expect(parseModelFlag("openai:gpt-6-sol:fast")).toEqual({ provider: "openai", model: "gpt-6-sol", tier: "fast" });
    expect(parseModelFlag("openrouter:google/gemini-3.8-flash")).toEqual({
      provider: "openrouter",
      model: "google/gemini-3.8-flash",
    });
    const [a, b] = parseConfigs(
      [
        { provider: "openai", model: "gpt-6-sol", tier: "fast" },
        { provider: "mock", label: "dry run" },
      ],
      aiSchema,
    );
    expect(a.config).toEqual({ label: "openai:gpt-6-sol (fast)", model: "gpt-6-sol", tier: "fast", mock: false });
    expect(b.config).toMatchObject({ label: "dry run", mock: true });
    expect(() => parseConfigs([{ provider: "nope", model: "x1" }], aiSchema)).toThrow(/models\[0\]/);
    expect(() => parseConfigs([{ provider: "openai", model: "gpt-6-luna", temprature: 1 }], aiSchema)).toThrow(
      /models\[0\]/,
    );
    expect(() => parseConfigs([], aiSchema)).toThrow(/no models/);
  });

  it("OpenRouter and Gemini configs validate and build their provider through aiProvider (D-083, D-084)", async () => {
    const { aiProvider } = await load("apps/api/src/core/ai.ts");
    const [or, gem] = parseConfigs(
      [
        { provider: "openrouter", model: "google/gemini-3.8-flash" },
        { provider: "gemini", model: "gemini-3.8-flash", thinking: "low" },
      ],
      aiSchema,
    );
    expect(or.config).toEqual({
      label: "openrouter:google/gemini-3.8-flash",
      model: "google/gemini-3.8-flash",
      tier: "default",
      mock: false,
    });
    expect(gem.config.label).toBe("gemini:gemini-3.8-flash");
    expect(() => parseConfigs([{ provider: "gemini", model: "gemini-3.8-flash", thinkng: "low" }], aiSchema)).toThrow(
      /models\[0\]/,
    );
    const env = { APP_ENV: "development", OPENROUTER_API_KEY: "or-x", GEMINI_API_KEY: "g-x" };
    const bodies = [];
    const fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response("{}", { status: 503 });
    };
    const orProvider = aiProvider(env, () => ({}), or.ai, { fetch });
    const gemProvider = aiProvider(env, () => ({}), gem.ai, { fetch });
    expect([orProvider?.name, gemProvider?.name]).toEqual(["openrouter", "gemini"]);
    const req = { system: "s", text: "t", schema: { name: "t", schema: {} } };
    expect(await orProvider.json(req)).toMatchObject({ ok: false, error: "unavailable" });
    await gemProvider.json(req);
    // An eval config has no legal section: zdr falls back to the product's sensitiveDataConsent.
    expect(typeof bodies[0].provider.zdr).toBe("boolean");
    expect(bodies[1]).toMatchObject({ model: "gemini-3.8-flash", store: false, generation_config: { thinking_level: "low" } });
  });
});
