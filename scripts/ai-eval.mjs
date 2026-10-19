#!/usr/bin/env node
// `pnpm ai:eval` (D-085, docs/AI_EVAL.md): runs the product's own eval photos through one or more
// provider/model configs, via the same adapter (aiProvider, apps/api/src/core/ai.ts) and the
// product's own request and scorer (apps/api/src/features/ai-eval.ts), and writes a Markdown table.
//
// LOCAL ONLY: keys come from this shell's environment (OPENAI_API_KEY, OPENROUTER_API_KEY or GEMINI_API_KEY), never from .dev.vars.
// It refuses to run in CI unless --allow-ci, shows the estimated cost first, and needs --yes above
// --max-rp (default Rp 20.000) or when a model's price is unknown.
//
//   pnpm ai:eval                                  # evals/expected.json × evals/models.json
//   pnpm ai:eval -- --model openai:gpt-6-luna --model openai:gpt-6-sol:fast --yes
//   pnpm ai:eval -- --model mock                  # free dry run of the whole pipeline

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Rupiah per US dollar. An ASSUMPTION for estimates (re-check the rate); override with --usd-idr. */
export const DEFAULT_USD_IDR = 16_500;
/** Above this estimated total (Rp), the run needs --yes. */
export const DEFAULT_MAX_RP = 20_000;
export const DEFAULT_PRODUCT = "apps/api/src/features/ai-eval.ts";

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const USAGE = `Usage: pnpm ai:eval -- [options]
  --dir <path>        eval set folder with expected.json and the photos (default: evals)
  --models <file>     JSON list of configs (default: <dir>/models.json)
  --model <p:m[:fast]> a config instead of the list, repeatable: openai:gpt-6-luna, mock
  --usd-idr <n>       rupiah per USD for costs (default: ${DEFAULT_USD_IDR}, an assumption)
  --max-rp <n>        estimated total above which --yes is needed (default: ${DEFAULT_MAX_RP})
  --yes               run even above --max-rp or with an unknown price
  --out <file>        report file (default: <dir>/results/<date>.md)
  --product <file>    product module (default: ${DEFAULT_PRODUCT})
  --allow-ci          run although CI is set (it never runs in CI by default)`;

/** Loads the repo's TypeScript (extensionless imports, workspace packages) through Vite. */
async function viteLoader(root) {
  const { createViteServer } = await import("vitest/node");
  const server = await createViteServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return { load: (rel) => server.ssrLoadModule(path.resolve(root, rel)), close: () => server.close() };
}

/** "openai:gpt-6-luna", "openrouter:google/gemini-3.8-flash:fast", "mock" → a models.json entry. */
export function parseModelFlag(flag) {
  if (flag === "mock") return { provider: "mock" };
  const i = flag.indexOf(":");
  if (i < 1) throw new Error(`--model ${flag}: use provider:model, e.g. openai:gpt-6-luna`);
  let model = flag.slice(i + 1);
  let tier;
  for (const t of ["fast", "default"])
    if (model.endsWith(`:${t}`)) {
      tier = t;
      model = model.slice(0, -t.length - 1);
    }
  return { provider: flag.slice(0, i), model, ...(tier ? { tier } : {}) };
}

/**
 * Each entry validated with the real product.config.ts `ai` schema (strict: a typo fails), so a
 * config that runs here also runs in production. `label` is the eval's own key; "mock" is free.
 */
export function parseConfigs(entries, aiSchema) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("no models to compare");
  // strictAiSchema from @factory/config (a union of strict objects, D-083/D-084); a plain object
  // schema is made strict here.
  const strict = typeof aiSchema.strict === "function" ? aiSchema.strict() : aiSchema;
  return entries.map((entry, i) => {
    const { label, ...rest } = entry ?? {};
    if (rest.provider === "mock")
      return { config: { label: label ?? "mock", model: "mock", tier: "default", mock: true }, ai: null };
    const parsed = strict.safeParse(rest);
    if (!parsed.success)
      throw new Error(`models[${i}] ${JSON.stringify(entry)}: ${parsed.error.issues.map((x) => x.message).join("; ")}`);
    const ai = parsed.data;
    const name = `${ai.provider}:${ai.model}${ai.tier === "fast" ? " (fast)" : ""}`;
    return {
      config: { label: label ?? name, model: ai.model, tier: ai.tier, mock: false, prices: ai.prices },
      ai,
    };
  });
}

/** expected.json, checked, with each photo's bytes. */
export function readEvalSet(dir) {
  const file = path.join(dir, "expected.json");
  if (!existsSync(file)) throw new Error(`${file} not found. Build an eval set first: docs/AI_EVAL.md`);
  const expected = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(expected) || expected.length === 0) throw new Error(`${file}: expected a non-empty list`);
  return expected.map((e, i) => {
    const where = `${file} [${i}]`;
    if (typeof e?.file !== "string") throw new Error(`${where}: "file" missing`);
    if (!Array.isArray(e.items) || e.items.length === 0 || e.items.some((x) => typeof x?.name !== "string"))
      throw new Error(`${where}: "items" needs at least one { "name": … }`);
    for (const [k, r] of Object.entries(e.macros ?? {}))
      if (!Array.isArray(r) || r.length !== 2 || !(r[0] <= r[1]))
        throw new Error(`${where}: macros.${k} needs [min, max]`);
    const type = TYPES[path.extname(e.file).toLowerCase()];
    if (!type) throw new Error(`${where}: ${e.file} is not a .jpg, .png or .webp`);
    const photo = path.join(dir, e.file);
    if (!existsSync(photo)) throw new Error(`${where}: ${photo} not found`);
    return { expected: e, image: { bytes: new Uint8Array(readFileSync(photo)), type } };
  });
}

function num(value, flag) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a positive number`);
  return n;
}

/**
 * Returns the exit code: 0 done, 1 error, 2 stopped at the cost gate.
 * deps (tests): env, out/err writers, load (module loader), makeProvider(config, ai) to skip real calls, date.
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((s) => process.stdout.write(s));
  const err = deps.err ?? ((s) => process.stderr.write(s));
  const root = deps.root ?? ROOT;
  let loader = null;
  try {
    const { values } = parseArgs({
      // `pnpm ai:eval -- --yes` may pass the "--" through.
      args: argv[0] === "--" ? argv.slice(1) : argv,
      options: {
        dir: { type: "string", default: "evals" },
        models: { type: "string" },
        model: { type: "string", multiple: true },
        "usd-idr": { type: "string" },
        "max-rp": { type: "string" },
        yes: { type: "boolean", default: false },
        out: { type: "string" },
        product: { type: "string", default: DEFAULT_PRODUCT },
        "allow-ci": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
    if (values.help) {
      out(`${USAGE}\n`);
      return 0;
    }
    if (env.CI && !values["allow-ci"]) {
      err("ai:eval spends real money on real keys, so it doesn't run in CI. Run it on your machine.\n");
      return 1;
    }
    const usdIdr = values["usd-idr"] ? num(values["usd-idr"], "--usd-idr") : DEFAULT_USD_IDR;
    const maxRp = values["max-rp"] ? num(values["max-rp"], "--max-rp") : DEFAULT_MAX_RP;
    const dir = path.resolve(root, values.dir);
    const photos = readEvalSet(dir);

    loader = deps.load ? { load: deps.load, close: async () => {} } : await viteLoader(root);
    const [configLib, { aiProvider }, ai, evalLib, productModule] = await Promise.all([
      loader.load("packages/config/src/index.ts"),
      loader.load("apps/api/src/core/ai.ts"),
      loader.load("packages/core/src/ai/index.ts"),
      loader.load("packages/core/src/ai/eval.ts"),
      loader.load(values.product),
    ]);
    const product = productModule.aiEval;
    if (!product) throw new Error(`${values.product} must export aiEval (see ${DEFAULT_PRODUCT})`);

    let entries;
    if (values.model?.length) entries = values.model.map(parseModelFlag);
    else {
      const file = values.models ? path.resolve(root, values.models) : path.join(dir, "models.json");
      if (!existsSync(file)) throw new Error(`${file} not found: add a models.json or pass --model provider:model`);
      entries = JSON.parse(readFileSync(file, "utf8"));
    }
    const configs = parseConfigs(
      entries,
      configLib.strictAiSchema ?? configLib.productSchema.shape.ai.unwrap().unwrap(),
    );

    // Cost before anything runs.
    const estimate = evalLib.estimateMicroUsd(
      configs.map((c) => c.config),
      photos.length,
      product.expectedUsage,
    );
    const unknown = estimate.some((e) => e.microUsd === null);
    const totalRp = evalLib.rupiah(
      estimate.reduce((s, e) => s + (e.microUsd ?? 0), 0),
      usdIdr,
    );
    out(
      `Estimated cost: ${photos.length} photos × ${configs.length} configs (USD 1 = Rp ${usdIdr.toLocaleString("id-ID")}, assumption)\n`,
    );
    for (const e of estimate)
      out(
        `  ${e.config.label}: ${e.microUsd === null ? "unknown price" : evalLib.formatRp(evalLib.rupiah(e.microUsd, usdIdr))}\n`,
      );
    out(`  total: ${unknown ? "unknown (a model has no price in the adapter)" : evalLib.formatRp(totalRp)}\n`);
    if ((unknown || totalRp > maxRp) && !values.yes) {
      err(
        `Not run: ${unknown ? "a price is unknown" : `above ${evalLib.formatRp(maxRp)}`}. Add --yes to run it anyway.\n`,
      );
      return 2;
    }

    // The same factory production uses, with this shell's keys. AI_MODEL is ignored here: each
    // config names its model. Without a key the factory gives the mock, which would be a fake score.
    const runEnv = { ...env, APP_ENV: "development", AI_MODEL: undefined };
    const providers = configs.map(({ config, ai: cfg }) => {
      if (config.mock) return { config, provider: ai.mockProvider(product.mock) };
      if (deps.makeProvider) return { config, provider: deps.makeProvider(config, cfg) };
      const provider = aiProvider(runEnv, product.mock, cfg);
      if (!provider || provider.name === "mock")
        throw new Error(
          `No API key for provider "${cfg.provider}" in this shell (OPENAI_API_KEY, OPENROUTER_API_KEY or GEMINI_API_KEY). Export it here; the eval never reads .dev.vars.`,
        );
      return { config, provider };
    });

    const rows = await evalLib.runEval({
      configs: providers,
      photos,
      product,
      onCall: (config, call) =>
        err(
          `  ${config.label}  ${call.file}  ${call.result.ok ? (call.top1 ? "✓" : "✗") : `${call.result.error}${call.result.detail ? ` (${call.result.detail})` : ""}`}  ${call.result.latencyMs} ms\n`,
        ),
    });
    const date = (deps.date ?? new Date()).toISOString().slice(0, 16).replace("T", " ");
    const report = evalLib.renderReport(rows, { usdIdr, date });
    const file = values.out
      ? path.resolve(root, values.out)
      : path.join(dir, "results", `${date.replace(" ", "-").replace(":", "")}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, report);
    const shown = file.startsWith(root + path.sep) ? path.relative(root, file) : file;
    out(`\n${report}\nWritten to ${shown}\n`);
    return 0;
  } catch (e) {
    err(
      `ai:eval: ${e instanceof Error ? e.message : String(e)}\n${e?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? `${USAGE}\n` : ""}`,
    );
    return 1;
  } finally {
    await loader?.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
