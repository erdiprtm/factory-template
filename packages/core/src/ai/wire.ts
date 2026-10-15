// Small helpers the providers share (no imports from ./index at runtime, so no module cycle).
import type { AiFailure, AiResult, AiTier, AiUsage } from "./index";

/** USD per 1M tokens. */
export type AiPrice = { input: number; cachedInput: number; output: number };

export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Cost of one call at a price, in micro-USD (1e-6 USD). */
export function priceMicroUsd(p: AiPrice, usage: AiUsage, factor = 1): number {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usd = (uncached * p.input + usage.cachedInputTokens * p.cachedInput + usage.outputTokens * p.output) / 1e6;
  return Math.round(usd * factor * 1e6);
}

/** A failure result with the elapsed time since `started`. */
export function failed(
  model: string,
  tier: AiTier,
  started: number,
  error: AiFailure,
  usage: AiUsage | null = null,
  detail?: string,
  costMicroUsd?: number | null,
): AiResult {
  return {
    ok: false,
    error,
    model,
    tier,
    usage,
    latencyMs: Date.now() - started,
    ...(detail ? { detail } : {}),
    ...(costMicroUsd !== undefined ? { costMicroUsd } : {}),
  };
}

/** The caller's signal plus a timeout. */
export function callSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
