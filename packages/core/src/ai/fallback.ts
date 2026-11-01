import type { AiFailure, AiProvider, AiResult } from "./index";

/**
 * Failures a fallback provider may answer (D-091): the primary couldn't answer at all (outage,
 * 5xx, timeout, out of credit, rate limited), or rejected the request itself (bad_request, D-118:
 * e.g. Gemini refusing a photo another provider reads fine). Never bad output or a refusal: those
 * are about the content, and another model mustn't silently retry them.
 */
export const FALLBACK_ON: readonly AiFailure[] = ["unavailable", "quota", "rate_limited", "bad_request"];

/**
 * The primary, then `fallback` when the primary failed with one of FALLBACK_ON. The result is the
 * fallback's (its model, usage and cost go to ai_usage), with `fallbackFrom` naming the primary's
 * model, failure and the provider's reason, so the log shows who actually answered and why.
 */
export function withFallback(primary: AiProvider, fallback: AiProvider): AiProvider {
  return {
    name: primary.name,
    async json(req): Promise<AiResult> {
      const first = await primary.json(req);
      if (first.ok || !FALLBACK_ON.includes(first.error)) return first;
      const second = await fallback.json(req);
      return { ...second, fallbackFrom: { model: first.model, error: first.error, detail: first.detail } };
    },
  };
}
