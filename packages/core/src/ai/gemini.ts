// Gemini API, called directly (D-084): one processor fewer for health data and no router fee.
// The Interactions API, which Google recommends for new projects and which is GA since June 2026
// (ai.google.dev/gemini-api/docs/interactions, read 2026-10-15):
// - POST https://generativelanguage.googleapis.com/v1beta/interactions, header `x-goog-api-key`;
// - `store: false`: interactions are otherwise kept 55 days (paid tier) for previous_interaction_id;
// - `system_instruction` for the instructions; `input` = the user's text, then the image as a
//   base64 `image` part (text first, as the image guide recommends), optional per-image `resolution`;
// - `response_format: { type: "text", mime_type: "application/json", schema }` in Gemini's JSON
//   Schema subset (geminiSchema), re-validated against the full schema here;
// - `generation_config.thinking_level` and `max_output_tokens`; no `tools`, so no search grounding.
// Usage: total_input_tokens, total_cached_tokens, total_output_tokens + total_thought_tokens (both
// billed as output). Cost from GEMINI_PRICES (costMicroUsd).
import type { AiFailure, AiJsonRequest, AiProvider, AiResult, AiUsage } from "./index";
import { geminiSchema, schemaError } from "./schema";
import { base64, callSignal, failed } from "./wire";

const GEMINI_INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions";

export type GeminiThinking = "minimal" | "low" | "medium" | "high";
export type GeminiResolution = "low" | "medium" | "high" | "ultra_high";

/** The interactions.create body (exported for tests). */
export function geminiBody(
  model: string,
  req: AiJsonRequest,
  o: { thinking?: GeminiThinking; mediaResolution?: GeminiResolution } = {},
) {
  const input: Record<string, unknown>[] = [{ type: "text", text: req.text }];
  if (req.image) {
    // A feature's explicit detail wins; "auto" uses the product's setting, else Google's default.
    const resolution = req.detail === "low" || req.detail === "high" ? req.detail : o.mediaResolution;
    input.push({
      type: "image",
      data: base64(req.image.bytes),
      mime_type: req.image.type,
      ...(resolution ? { resolution } : {}),
    });
  }
  const generation = {
    ...(o.thinking ? { thinking_level: o.thinking } : {}),
    ...(req.maxOutputTokens ? { max_output_tokens: req.maxOutputTokens } : {}),
  };
  return {
    model,
    system_instruction: req.system,
    input,
    response_format: { type: "text", mime_type: "application/json", schema: geminiSchema(req.schema.schema) },
    ...(Object.keys(generation).length ? { generation_config: generation } : {}),
    store: false,
  };
}

// "Generation blocked" codes (ai.google.dev/gemini-api/docs/api-errors): policy or safety stopped
// the answer. They map to "refused", which products treat like an unclear photo ("coba foto lain").
const BLOCKED = new Set([
  "safety",
  "recitation",
  "language",
  "prohibited_content",
  "spii",
  "blocklist",
  "image_safety",
  "image_prohibited_content",
  "image_recitation",
  "image_other",
  "content_blocked",
]);

/** The error code's last segment ("…/safety" → "safety"): Interaction errors carry a URI. */
const codeName = (code: unknown) => (typeof code === "string" ? (code.split(/[/#:]/).at(-1) ?? "").toLowerCase() : "");

/** Maps a Gemini API failure to an AiFailure (exported for tests). */
export function geminiFailureOf(status: number, code: string): AiFailure {
  if (BLOCKED.has(code)) return "refused";
  if (status === 402 || code === "payment_required") return "quota"; // prepay credit depleted
  if (code === "quota_exceeded") return "quota"; // daily quota: a human raises the tier
  if (code === "failed_precondition") return "quota"; // e.g. billing disabled on the project
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 499 || status >= 500) return "unavailable";
  return "bad_request";
}

type GeminiInteraction = {
  model?: string;
  status?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: {
    total_input_tokens?: number;
    total_cached_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
  };
  errors?: { code?: string; message?: string }[];
  error?: { code?: string; message?: string };
};

export function geminiProvider(opts: {
  apiKey: string;
  model: string;
  thinking?: GeminiThinking;
  mediaResolution?: GeminiResolution;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): AiProvider {
  const doFetch = opts.fetch ?? fetch;
  const tier = "default" as const;
  return {
    name: "gemini",
    async json(req): Promise<AiResult> {
      const started = Date.now();
      let res: Response;
      try {
        res = await doFetch(GEMINI_INTERACTIONS, {
          method: "POST",
          headers: { "x-goog-api-key": opts.apiKey, "content-type": "application/json" },
          body: JSON.stringify(geminiBody(opts.model, req, opts)),
          signal: callSignal(req.signal, opts.timeoutMs ?? 45_000),
        });
      } catch {
        return failed(opts.model, tier, started, "unavailable");
      }
      const body = (await res.json().catch(() => ({}))) as GeminiInteraction;
      const u = body.usage;
      const usage: AiUsage | null = u
        ? {
            inputTokens: u.total_input_tokens ?? 0,
            cachedInputTokens: u.total_cached_tokens ?? 0,
            outputTokens: (u.total_output_tokens ?? 0) + (u.total_thought_tokens ?? 0),
          }
        : null;
      const fail = (error: AiFailure, detail?: string) => failed(opts.model, tier, started, error, usage, detail);
      if (!res.ok) {
        const code = codeName(body.error?.code);
        return fail(geminiFailureOf(res.status, code), code || String(res.status));
      }
      const blocked = (body.errors ?? []).map((e) => codeName(e.code)).find((c) => BLOCKED.has(c));
      if (blocked) return fail("refused", blocked);
      if (body.status === "failed") return fail("unavailable", codeName(body.errors?.[0]?.code) || "failed");
      const text = (body.steps ?? [])
        .filter((s) => s.type === "model_output")
        .flatMap((s) => s.content ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      // "incomplete" = cut off (max_output_tokens). Empty = nothing usable. Both: no answer.
      if (body.status !== "completed" || !text.trim()) return fail("bad_output", body.status ?? "empty");
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
        model: opts.model,
        tier,
        usage: usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        latencyMs: Date.now() - started,
      };
    },
  };
}
