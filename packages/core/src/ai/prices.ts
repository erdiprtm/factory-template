// List prices per model (D-045, D-084). Pure; no imports from ./index at runtime.
import type { AiTier, AiUsage } from "./index";
import { type AiPrice, priceMicroUsd } from "./wire";

// ---- Prices ---------------------------------------------------------------------------------
// USD per 1M tokens, standard tier, short context. Source: OpenAI pricing page, read 2026-10-12.
// Fast mode costs exactly twice these. Re-check before changing a product's model.
export const OPENAI_PRICES: Readonly<Record<string, AiPrice>> = {
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
};

// Gemini API, Paid tier, standard (not Batch/Flex), USD per 1M tokens; output includes thinking
// tokens. Source: ai.google.dev/gemini-api/docs/pricing, read 2026-10-15. Some prices change on a
// date, so each model lists periods (`since`: first day, UTC). gemini-3.1-pro-preview: the
// ≤200k-token prompt price (our calls are far below). Re-check before changing a product's model.
export const GEMINI_PRICES: Readonly<Record<string, readonly (AiPrice & { since?: string })[]>> = {
  "gemini-3.8-flash": [
    { input: 0.75, cachedInput: 0.075, output: 3.75 },
    { since: "2027-01-01", input: 1.5, cachedInput: 0.15, output: 7.5 },
  ],
  "gemini-3.6-flash": [
    { input: 0.75, cachedInput: 0.075, output: 3.75 },
    { since: "2027-01-01", input: 1.5, cachedInput: 0.15, output: 7.5 },
  ],
  "gemini-3.5-flash-lite": [{ input: 0.3, cachedInput: 0.03, output: 2.5 }],
  "gemini-4-argon": [
    { input: 2, cachedInput: 0.1, output: 10 },
    { since: "2026-12-01", input: 4, cachedInput: 0.2, output: 20 },
  ],
  "gemini-3.1-pro-preview": [{ input: 2, cachedInput: 0.2, output: 12 }],
};

/** A Gemini model's price on a day, or undefined for an unknown model. */
export function geminiPrice(model: string, at: Date): AiPrice | undefined {
  const day = at.toISOString().slice(0, 10);
  return GEMINI_PRICES[model]?.filter((p) => !p.since || p.since <= day).at(-1);
}

/**
 * A model's list price on a day: an OpenAI or Gemini id, or an OpenRouter slug of one of them
 * ("openai/gpt-6-luna", "google/gemini-3.8-flash"; OpenRouter passes provider prices through without
 * a markup, per its FAQ). Undefined for an unknown model.
 */
export function listPrice(model: string, at = new Date()): AiPrice | undefined {
  const own = OPENAI_PRICES[model] ?? geminiPrice(model, at);
  if (own) return own;
  const [vendor, id] = model.split("/");
  if (vendor === "openai" && id) return OPENAI_PRICES[id];
  if (vendor === "google" && id) return geminiPrice(id, at);
  return undefined;
}

/** Cost of one call in micro-USD (1e-6 USD), or null for a model without a known price. */
export function costMicroUsd(model: string, tier: AiTier, usage: AiUsage, at = new Date()): number | null {
  const p = listPrice(model, at);
  if (!p) return null;
  return priceMicroUsd(p, usage, tier === "fast" ? 2 : 1);
}
