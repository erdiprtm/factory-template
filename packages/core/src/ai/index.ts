// AI provider adapter (D-045): one JSON answer from text + an optional image, behind an interface,
// so products never call a model API directly. OpenAI's Responses API, OpenRouter (D-083) and the
// Gemini API (D-084); a mock for local dev, tests and E2E. Pure apart from the injected fetch.
//
// Products ask the model to recognise or extract, never to supply facts or numbers shown to users
// (CLAUDE.md product guardrails): those come from curated data in the product. No provider is ever
// given tools or search grounding, and the user's text never goes inside the instructions.

import { base64 } from "./wire";

export { FALLBACK_ON, withFallback } from "./fallback";
export {
  type GeminiResolution,
  type GeminiThinking,
  geminiBody,
  geminiFailureOf,
  geminiProvider,
} from "./gemini";
export { type OpenRouterRouting, openRouterBody, openRouterFailureOf, openRouterProvider } from "./openrouter";
export { costMicroUsd, GEMINI_PRICES, geminiPrice, listPrice, OPENAI_PRICES } from "./prices";
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
      /** Set when a fallback provider answered (D-091): the primary's model and why it didn't. */
      fallbackFrom?: { model: string; error: AiFailure };
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
      fallbackFrom?: { model: string; error: AiFailure };
    };

export type AiProviderName = "openai" | "openrouter" | "gemini" | "mock";

export interface AiProvider {
  readonly name: AiProviderName;
  json(req: AiJsonRequest): Promise<AiResult>;
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
