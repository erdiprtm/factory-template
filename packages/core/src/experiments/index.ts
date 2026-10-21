// A/B experiments (D-094). One experiment at a time per product (product.config.ts `experiments`).
//
// A device's arm is a pure function of its anonId: hash("<experiment>:<anonId>") mod 100, matched
// against the arms' weights in order. The site, the app and the API compute the same arm without
// storing or sending it, so it's sticky per device (the anonId is), follows the device from the site
// into the app (the anonId is handed over, D-033) and reaches the account through attribution's
// anonId. A client can't claim an arm: the API derives it itself. Browser-safe (no database imports).

/** product.config.ts `experiments.<name>`: arm → weight in percent (they sum to 100). */
export type ExperimentConfig = { variants: Record<string, number> };
export type Experiment = { name: string; variants: Record<string, number> };
/** What every funnel event of an assigned device carries. */
export type ExperimentTag = { experiment: string; variant: string };

/** The product's experiment, if any (the config allows at most one). */
export function activeExperiment(experiments: Record<string, ExperimentConfig> | undefined): Experiment | null {
  const [entry] = Object.entries(experiments ?? {});
  return entry ? { name: entry[0], variants: entry[1].variants } : null;
}

/** 32-bit FNV-1a: small, fast, stable across runtimes (no crypto needed for a bucket). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The device's bucket in 0–99 for an experiment. */
export const bucketOf = (experiment: string, anonId: string) => fnv1a(`${experiment}:${anonId}`) % 100;

/** The arm a device is in. Weights are walked in config order, so keep that order during a test. */
export function variantFor(experiment: Experiment, anonId: string): string {
  const bucket = bucketOf(experiment.name, anonId);
  let edge = 0;
  const arms = Object.entries(experiment.variants);
  for (const [variant, weight] of arms) {
    edge += weight;
    if (bucket < edge) return variant;
  }
  return (arms.at(-1) as [string, number])[0];
}

/** The tag for a device, or null without an experiment or an anonId (e.g. native, Phase 10). */
export function experimentTag(experiment: Experiment | null, anonId: string | null | undefined): ExperimentTag | null {
  if (!experiment || !anonId) return null;
  return { experiment: experiment.name, variant: variantFor(experiment, anonId) };
}

/**
 * An anonId in the given arm (development and E2E, D-094): opening the app with `?aid=<id>` on a
 * fresh device puts it in that arm through the real assignment path, so no "force" switch exists
 * that production could be tricked with. Deterministic for a given seed.
 */
export function anonIdIn(experiment: Experiment, variant: string, seed = "e2e"): string {
  if (!(variant in experiment.variants)) throw new Error(`unknown variant "${variant}" for ${experiment.name}`);
  for (let i = 0; i < 100_000; i++) {
    const id = `${seed}-${i}-`.padEnd(16, "x");
    if (variantFor(experiment, id) === variant) return id;
  }
  throw new Error(`no anonId found for ${experiment.name}=${variant}`);
}
