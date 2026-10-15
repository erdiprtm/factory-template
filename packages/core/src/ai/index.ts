// AI provider adapter (D-045): one JSON answer from text + an optional image, behind an interface,
// so products never call a model API directly. OpenAI's Responses API, OpenRouter (D-083) and the
// Gemini API (D-084); a mock for local dev, tests and E2E. Pure apart from the injected fetch.
//
// Products ask the model to recognise or extract, never to supply facts or numbers shown to users
// (CLAUDE.md product guardrails): those come from curated data in the product. No provider is ever
// given tools or search grounding, and the user's text never goes inside the instructions.

import { type AiPrice, base64, priceMicroUsd } from "./wire";

export {
  type GeminiResolution,
  type GeminiThinking,
  geminiBody,
  geminiFailureOf,
  geminiProvider,
} from "./gemini";
export { type OpenRouterRouting, openRouterBody, openRouterFailureOf, openRouterProvider } from "./openrouter";
export { geminiSchema, schemaError } from "./schema";
export type { AiPrice } from "./wire";

export type AiTier = "default" | "fast";

export type AiImage = { bytes: Uint8Array; type: "image/jpeg" | "image/png" | "image/webp" };

/** A JSON Schema object for strict structured output: every property required, no extras. */
export type JsonSchema = Record<string, unknown>;

export type AiJsonRequest = {
  /** Instructions (the system prompt). */
  system: string;
  /** The user's text. */
  text: string;
  image?: AiImage;
  /** How finely the model looks at the image. Default "auto". */
  detail?: "low" | "high" | "auto";
  schema: { name: string; schema: JsonSchema };
  /** Upper bound on output (reasoning included), so one call's cost is bounded. */
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AiUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

/** Why a call gave no answer. quota = the provider account is out of credit (a human tops it up). */
export type AiFailure = "quota" | "rate_limited" | "unavailable" | "bad_request" | "bad_output" | "refused";

/**
 * costMicroUsd: the call's cost as the provider reported it (OpenRouter, D-083), in micro-USD, or
 * null when it reported none and no price is known. Absent = priced from the tables below.
 */
export type AiResult =
  | {
      ok: true;
      output: unknown;
      model: string;
      tier: AiTier;
      usage: AiUsage;
      latencyMs: number;
      costMicroUsd?: number | null;
    }
  | {
      ok: false;
      error: AiFailure;
      model: string;
      tier: AiTier;
      usage: AiUsage | null;
      latencyMs: number;
      detail?: string;
      costMicroUsd?: number | null;
    };

export type AiProviderName = "openai" | "openrouter" | "gemini" | "mock";

export interface AiProvider {
  readonly name: AiProviderName;
  json(req: AiJsonRequest): Promise<AiResult>;
}

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

/** Cost of one call in micro-USD (1e-6 USD), or null for a model without a known price. */
export function costMicroUsd(model: string, tier: AiTier, usage: AiUsage, at = new Date()): number | null {
  const p = OPENAI_PRICES[model] ?? geminiPrice(model, at);
  if (!p) return null;
  return priceMicroUsd(p, usage, tier === "fast" ? 2 : 1);
}

// ---- OpenAI ---------------------------------------------------------------------------------

const OPENAI_RESPONSES = "https://api.openai.com/v1/responses";

/** The Responses API request body (exported for tests). Not stored at OpenAI (`store: false`). */
export function openAiBody(model: string, tier: AiTier, req: AiJsonRequest) {
  const content: Record<string, unknown>[] = [{ type: "input_text", text: req.text }];
  if (req.image)
    content.push({
      type: "input_image",
      image_url: `data:${req.image.type};base64,${base64(req.image.bytes)}`,
      detail: req.detail ?? "auto",
    });
  return {
    model,
    instructions: req.system,
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: req.schema.name, strict: true, schema: req.schema.schema } },
    store: false,
    ...(tier === "fast" ? { service_tier: "fast" } : {}),
    ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
  };
}

type OpenAiResponse = {
  status?: string;
  service_tier?: string;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  error?: { code?: string; message?: string } | null;
};

function usageOf(body: OpenAiResponse): AiUsage | null {
  if (!body.usage) return null;
  return {
    inputTokens: body.usage.input_tokens ?? 0,
    cachedInputTokens: body.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: body.usage.output_tokens ?? 0,
  };
}

/** Maps an HTTP failure to an AiFailure (exported for tests). */
export function failureOf(status: number, code: string | undefined): AiFailure {
  if (status === 429) return code === "insufficient_quota" ? "quota" : "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_request";
}

export function openAiProvider(opts: {
  apiKey: string;
  model: string;
  tier?: AiTier;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  const tier = opts.tier ?? "default";
  return {
    name: "openai",
    async json(req) {
      const started = Date.now();
      const fail = (error: AiFailure, usage: AiUsage | null = null, detail?: string): AiResult => ({
        ok: false,
        error,
        model: opts.model,
        tier,
        usage,
        latencyMs: Date.now() - started,
        ...(detail ? { detail } : {}),
      });
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 45_000);
      let res: Response;
      try {
        res = await doFetch(OPENAI_RESPONSES, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(openAiBody(opts.model, tier, req)),
          signal: req.signal ? AbortSignal.any([req.signal, timeout]) : timeout,
        });
      } catch {
        return fail("unavailable");
      }
      const body = (await res.json().catch(() => ({}))) as OpenAiResponse;
      if (!res.ok) return fail(failureOf(res.status, body.error?.code ?? undefined), null, body.error?.code);
      const usage = usageOf(body);
      const parts = (body.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []) : []));
      if (parts.some((p) => p.type === "refusal")) return fail("refused", usage);
      const text = parts.find((p) => p.type === "output_text")?.text;
      if (body.status !== "completed" || !text) return fail("bad_output", usage, body.status);
      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch {
        return fail("bad_output", usage, "json");
      }
      // "fast" is reported back as "priority" (OpenAI docs); anything else is the standard tier.
      const served: AiTier = body.service_tier === "priority" || body.service_tier === "fast" ? "fast" : "default";
      return {
        ok: true,
        output,
        model: opts.model,
        tier: served,
        usage: usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        latencyMs: Date.now() - started,
      };
    },
  };
}

// ---- Mock -----------------------------------------------------------------------------------

/**
 * A provider that answers from a product-supplied function: local dev without a key, tests, E2E
 * and previews. It costs nothing and logs as model "mock".
 */
export function mockProvider(answer: (req: AiJsonRequest) => unknown): AiProvider {
  return {
    name: "mock",
    async json(req) {
      return {
        ok: true,
        output: answer(req),
        model: "mock",
        tier: "default",
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
      };
    },
  };
}
