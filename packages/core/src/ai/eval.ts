// AI eval (D-085): runs a product's own test photos through one or more provider/model configs,
// via the same adapter and the product's own prompt and schema, and scores the answers against
// the product's expected labels. Pure apart from the providers it is given; `pnpm ai:eval`
// (scripts/ai-eval.mjs) reads the files, builds the providers and writes the table.

import { type AiImage, type AiJsonRequest, type AiProvider, type AiResult, type AiTier, costMicroUsd } from "./index";

/** One photo of the eval set (`expected.json`). macros: optional [min, max] ranges. */
export type EvalExpected = {
  file: string;
  items: { name: string; aliases?: string[] }[];
  macros?: Record<string, [number, number]>;
};

/** What the product's scorer reads from one answer: ranked item names, optional macro numbers. */
export type EvalPrediction = { items: string[]; macros?: Record<string, number> };

/** The PRODUCT-OWNED half (apps/api/src/features/ai-eval.ts). */
export type EvalProduct = {
  /** The same AiJsonRequest the product's route sends for this photo. */
  request(image: AiImage): AiJsonRequest;
  /** Model output → ranked names (+ macros). null = the output can't be used (counts as a schema failure). */
  score(output: unknown): EvalPrediction | null;
  /** The mock's answer for `{ "provider": "mock" }` (a free dry run of the whole pipeline). */
  mock(req: AiJsonRequest): unknown;
  /** Typical tokens of one call, for the cost estimate shown before anything runs. */
  expectedUsage: { inputTokens: number; outputTokens: number };
};

export type EvalConfig = { label: string; model: string; tier: AiTier; mock: boolean };

export type EvalCall = {
  file: string;
  result: AiResult;
  prediction: EvalPrediction | null;
  top1: boolean;
  top3: boolean;
  /** One entry per expected macro range: in range or not (a failed call is never in range). */
  macros: boolean[];
  costMicroUsd: number | null;
};

export type EvalRow = { config: EvalConfig; calls: EvalCall[] };

// ---- Scoring --------------------------------------------------------------------------------

/** Lowercase, no accents, punctuation as spaces: "Sómay  (ikan)" → "somay ikan". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Whether a predicted name is one of the expected items (its name or an alias, exact after normalizing). */
export function matchesItem(predicted: string, expected: EvalExpected["items"]): boolean {
  const p = normalizeName(predicted);
  return p !== "" && expected.some((e) => [e.name, ...(e.aliases ?? [])].some((n) => normalizeName(n) === p));
}

/** Per expected range: whether the predicted number is inside it (inclusive). Missing = out. */
export function macrosInRange(expected: EvalExpected["macros"], predicted: EvalPrediction["macros"]): boolean[] {
  return Object.entries(expected ?? {}).map(([key, [min, max]]) => {
    const v = predicted?.[key];
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  });
}

export function scoreCall(
  expected: EvalExpected,
  result: AiResult,
  product: Pick<EvalProduct, "score">,
  mock: boolean,
): EvalCall {
  let prediction: EvalPrediction | null = null;
  if (result.ok) {
    try {
      prediction = product.score(result.output);
    } catch {
      prediction = null;
    }
  }
  const names = prediction?.items ?? [];
  const cost = mock ? 0 : result.usage ? costMicroUsd(result.model, result.tier, result.usage) : 0;
  return {
    file: expected.file,
    result,
    prediction,
    top1: names.slice(0, 1).some((n) => matchesItem(n, expected.items)),
    top3: names.slice(0, 3).some((n) => matchesItem(n, expected.items)),
    macros: expected.macros ? macrosInRange(expected.macros, prediction?.macros) : [],
    costMicroUsd: cost,
  };
}

// ---- Running --------------------------------------------------------------------------------

/** Runs every photo through every config, one call at a time (gentle on rate limits). */
export async function runEval(opts: {
  configs: { config: EvalConfig; provider: AiProvider }[];
  photos: { expected: EvalExpected; image: AiImage }[];
  product: EvalProduct;
  onCall?: (config: EvalConfig, call: EvalCall) => void;
}): Promise<EvalRow[]> {
  const rows: EvalRow[] = [];
  for (const { config, provider } of opts.configs) {
    const calls: EvalCall[] = [];
    for (const photo of opts.photos) {
      const result = await provider.json(opts.product.request(photo.image));
      const call = scoreCall(photo.expected, result, opts.product, config.mock);
      calls.push(call);
      opts.onCall?.(config, call);
    }
    rows.push({ config, calls });
  }
  return rows;
}

// ---- Cost -----------------------------------------------------------------------------------

/** Estimated micro-USD for the whole run, per config; null for a model without a known price. */
export function estimateMicroUsd(
  configs: EvalConfig[],
  photos: number,
  usage: EvalProduct["expectedUsage"],
): { config: EvalConfig; microUsd: number | null }[] {
  return configs.map((config) => {
    if (config.mock) return { config, microUsd: 0 };
    const one = costMicroUsd(config.model, config.tier, { ...usage, cachedInputTokens: 0 });
    return { config, microUsd: one === null ? null : one * photos };
  });
}

/** Micro-USD → rupiah at the given rate. */
export const rupiah = (microUsd: number, usdIdr: number) => (microUsd / 1e6) * usdIdr;

/** "Rp 1.234" (whole rupiah) or "Rp 10,1" below Rp 100. */
export function formatRp(rp: number): string {
  const digits = rp < 100 ? 1 : 0;
  return `Rp ${rp.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
}

// ---- Table ----------------------------------------------------------------------------------

/** Nearest-rank percentile (p in 0..100) of the values; null when empty. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((n / d) * 100)}% (${n}/${d})`);
const ms = (v: number | null) => (v === null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);

/** A schema failure or refusal: no usable answer although the call went through. */
const unusable = (c: EvalCall) =>
  c.result.ok ? c.prediction === null : c.result.error === "bad_output" || c.result.error === "refused";

export type EvalSummary = {
  label: string;
  top1: string;
  top3: string;
  macros: string;
  unusable: string;
  errors: string;
  p50: string;
  p90: string;
  perScan: string;
  total: string;
};

export function summarize(row: EvalRow, usdIdr: number): EvalSummary {
  const n = row.calls.length;
  const latencies = row.calls.map((c) => c.result.latencyMs);
  const macroChecks = row.calls.flatMap((c) => c.macros);
  const ranked = row.calls.some((c) => (c.prediction?.items.length ?? 0) > 1);
  const costs = row.calls.map((c) => c.costMicroUsd);
  const known = costs.every((c) => c !== null);
  const totalMicro = costs.reduce<number>((s, c) => s + (c ?? 0), 0);
  const unusableN = row.calls.filter(unusable).length;
  const errorsN = row.calls.filter((c) => !c.result.ok && !unusable(c)).length;
  return {
    label: row.config.label,
    top1: pct(row.calls.filter((c) => c.top1).length, n),
    top3: ranked ? pct(row.calls.filter((c) => c.top3).length, n) : "–",
    macros: pct(macroChecks.filter(Boolean).length, macroChecks.length),
    unusable: pct(unusableN, n),
    errors: pct(errorsN, n),
    p50: ms(percentile(latencies, 50)),
    p90: ms(percentile(latencies, 90)),
    perScan: known && n > 0 ? formatRp(rupiah(totalMicro / n, usdIdr)) : "n/a",
    total: known ? formatRp(rupiah(totalMicro, usdIdr)) : "n/a",
  };
}

const cell = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const line = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;

/** The Markdown report: one summary row per config, then each photo's first answer per config. */
export function renderReport(rows: EvalRow[], opts: { usdIdr: number; date: string }): string {
  const head = [
    "Model",
    "Top-1",
    "Top-3",
    "Macros in range",
    "Schema fail / refused",
    "Other errors",
    "Median latency",
    "p90 latency",
    "Rp / scan",
    "Total",
  ];
  const out = [
    `# AI eval, ${opts.date}`,
    "",
    `${rows[0]?.calls.length ?? 0} photos. Cost at USD 1 = Rp ${opts.usdIdr.toLocaleString("id-ID")} (assumption), list prices, before PPN.`,
    "",
    line(head),
    line(head.map(() => "---")),
    ...rows.map((r) => {
      const s = summarize(r, opts.usdIdr);
      return line([s.label, s.top1, s.top3, s.macros, s.unusable, s.errors, s.p50, s.p90, s.perScan, s.total]);
    }),
    "",
    "## Per photo (first answer; ✓ = top-1 hit)",
    "",
    line(["Photo", ...rows.map((r) => r.config.label)]),
    line(["---", ...rows.map(() => "---")]),
  ];
  const files = rows[0]?.calls.map((c) => c.file) ?? [];
  files.forEach((file, i) => {
    out.push(
      line([
        file,
        ...rows.map((r) => {
          const c = r.calls[i];
          if (!c) return "–";
          if (!c.result.ok) return `✗ ${c.result.error}`;
          if (!c.prediction) return "✗ schema";
          return `${c.top1 ? "✓" : "✗"} ${c.prediction.items[0] ?? "(none)"}`;
        }),
      ]),
    );
  });
  return `${out.join("\n")}\n`;
}
