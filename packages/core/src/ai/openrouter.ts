// OpenRouter (D-083): one key, many models, for comparing them and for fallbacks. OpenAI-style chat
// completions (openrouter.ai/docs, read 2026-10-15):
// - POST https://openrouter.ai/api/v1/chat/completions, `Authorization: Bearer <key>`;
// - the image as an `image_url` content part holding a data URL;
// - `response_format: json_schema` with strict, and provider routing `require_parameters` so only
//   endpoints that support it are used. Some providers still treat the schema as a hint, so the
//   answer is re-validated (schemaError) before anyone sees it;
// - `models`: fallbacks tried in order on any error; the response's `model` is the one that served
//   (and is billed), so that's what the log records;
// - `usage.cost` (USD credits) comes back on every response: that's the recorded cost.
import type { AiFailure, AiJsonRequest, AiProvider, AiResult, AiUsage } from "./index";
import { listPrice } from "./prices";
import { schemaError } from "./schema";
import { type AiPrice, base64, callSignal, failed, priceMicroUsd } from "./wire";

const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";

/** Provider routing preferences, as in product.config.ts ai.routing (zdr resolved). */
export type OpenRouterRouting = {
  requireParameters: boolean;
  dataCollection: "deny" | "allow";
  zdr: boolean;
  only?: string[];
  order?: string[];
  allowFallbacks?: boolean;
};

/** The chat completions body (exported for tests). */
export function openRouterBody(
  model: string,
  fallbackModels: readonly string[],
  routing: OpenRouterRouting,
  req: AiJsonRequest,
) {
  const content: Record<string, unknown>[] = [{ type: "text", text: req.text }];
  if (req.image)
    content.push({
      type: "image_url",
      image_url: { url: `data:${req.image.type};base64,${base64(req.image.bytes)}`, detail: req.detail ?? "auto" },
    });
  return {
    model,
    ...(fallbackModels.length ? { models: [model, ...fallbackModels] } : {}),
    // The instructions are the system message; the user's text only ever goes in the user message.
    messages: [
      { role: "system", content: req.system },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema },
    },
    provider: {
      require_parameters: routing.requireParameters,
      data_collection: routing.dataCollection,
      zdr: routing.zdr,
      ...(routing.only ? { only: routing.only } : {}),
      ...(routing.order ? { order: routing.order } : {}),
      ...(routing.allowFallbacks !== undefined ? { allow_fallbacks: routing.allowFallbacks } : {}),
    },
    stream: false,
    ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
  };
}

type OpenRouterError = { code?: number | string; message?: string; metadata?: { error_type?: string } };

type OpenRouterResponse = {
  model?: string;
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
    error?: OpenRouterError;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: OpenRouterError;
};

/** Maps an OpenRouter HTTP failure to an AiFailure (exported for tests). */
export function openRouterFailureOf(status: number, errorType?: string): AiFailure {
  if (status === 402) return "quota"; // out of credits: a human tops up
  if (status === 429) return "rate_limited";
  // Moderation flags and content-policy declines are 403 with an error_type.
  if (status === 403)
    return errorType === "content_policy_violation" || errorType === "refusal" ? "refused" : "bad_request";
  if (status === 408 || status >= 500) return "unavailable"; // incl. 502 model down, 503 no provider, 524, 529
  return "bad_request";
}

export function openRouterProvider(opts: {
  apiKey: string;
  model: string;
  fallbackModels?: readonly string[];
  routing: OpenRouterRouting;
  /** USD per 1M tokens per slug: used only when a response reports no cost (then list prices). */
  prices?: Readonly<Record<string, AiPrice>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  const tier = "default" as const;
  return {
    name: "openrouter",
    async json(req): Promise<AiResult> {
      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(OPENROUTER_CHAT, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(openRouterBody(opts.model, opts.fallbackModels ?? [], opts.routing, req)),
          signal: callSignal(req.signal, opts.timeoutMs ?? 45_000),
        });
      } catch {
        return failed(opts.model, tier, started, "unavailable");
      }
      const body = (await res.json().catch(() => ({}))) as OpenRouterResponse;
      const model = body.model || opts.model;
      const usage: AiUsage | null = body.usage
        ? {
            inputTokens: body.usage.prompt_tokens ?? 0,
            cachedInputTokens: body.usage.prompt_tokens_details?.cached_tokens ?? 0,
            outputTokens: body.usage.completion_tokens ?? 0,
          }
        : null;
      const price = opts.prices?.[model] ?? listPrice(model);
      const cost =
        typeof body.usage?.cost === "number"
          ? Math.round(body.usage.cost * 1e6)
          : usage && price
            ? priceMicroUsd(price, usage)
            : null;
      const fail = (error: AiFailure, detail?: string) => failed(model, tier, started, error, usage, detail, cost);
      if (!res.ok) {
        const type = body.error?.metadata?.error_type;
        // The provider's own message too (D-091), so a rejected setting says why.
        const message = typeof body.error?.message === "string" ? body.error.message.slice(0, 200) : undefined;
        return fail(
          openRouterFailureOf(res.status, type),
          [type ?? String(body.error?.code ?? res.status), message].filter(Boolean).join(": "),
        );
      }
      // Errors can arrive in a 200: a body with only `error`, or a choice that finished with "error".
      const choice = body.choices?.[0];
      if (!choice) {
        const code = Number(body.error?.code);
        return fail(Number.isFinite(code) && code >= 400 ? openRouterFailureOf(code) : "unavailable", "no_choices");
      }
      if (choice.finish_reason === "error")
        return fail("unavailable", choice.error?.message ? "choice_error" : undefined);
      if (choice.message?.refusal || choice.finish_reason === "content_filter") return fail("refused");
      const text = choice.message?.content;
      if (!text || choice.finish_reason === "length") return fail("bad_output", choice.finish_reason ?? "empty");
      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch {
        return fail("bad_output", "json");
      }
      const off = schemaError(req.schema.schema, output);
      if (off) return fail("bad_output", `schema ${off}`);
      return {
        ok: true,
        output,
        model,
        tier,
        usage: usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        latencyMs: Date.now() - started,
        costMicroUsd: cost,
      };
    },
  };
}
