import { describe, expect, it } from "vitest";
import { type AiJsonRequest, costMicroUsd, failureOf, mockProvider, openAiBody, openAiProvider } from "./index";

// AI adapter (D-045). No network: OpenAI is a fake fetch answering like the Responses API.
const req: AiJsonRequest = {
  system: "Recognise foods.",
  text: "Estimate this meal.",
  image: { bytes: new Uint8Array([0xff, 0xd8, 0xff]), type: "image/jpeg" },
  schema: { name: "meal", schema: { type: "object", properties: {}, required: [], additionalProperties: false } },
  maxOutputTokens: 1500,
};

const answer =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const completed = (text: string, extra: Record<string, unknown> = {}) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 1680, output_tokens: 885, input_tokens_details: { cached_tokens: 0 } },
  ...extra,
});

const provider = (fetch: typeof globalThis.fetch, tier: "default" | "fast" = "default") =>
  openAiProvider({ apiKey: "sk-test", model: "gpt-6-luna", tier, fetch });

describe("OpenAI Responses request", () => {
  it("sends strict JSON output, the image as a data URL, and is never stored at OpenAI", () => {
    const body = openAiBody("gpt-6-luna", "fast", req);
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      instructions: "Recognise foods.",
      store: false,
      service_tier: "fast",
      max_output_tokens: 1500,
      text: { format: { type: "json_schema", name: "meal", strict: true } },
    });
    expect(body.input[0]?.content[1]).toEqual({
      type: "input_image",
      image_url: "data:image/jpeg;base64,/9j/",
      detail: "auto",
    });
    expect(openAiBody("gpt-6-luna", "default", { ...req, image: undefined })).not.toHaveProperty("service_tier");
  });
});

describe("cost", () => {
  it("prices a measured meal scan (1,680 in / 885 out) from the list prices, Fast at twice", () => {
    const usage = { inputTokens: 1680, cachedInputTokens: 0, outputTokens: 885 };
    expect(costMicroUsd("gpt-6-luna", "default", usage)).toBe(611);
    expect(costMicroUsd("gpt-6-luna", "fast", usage)).toBe(1221);
    expect(costMicroUsd("gpt-6-luna", "default", { ...usage, cachedInputTokens: 1000 })).toBe(521);
    expect(costMicroUsd("unknown-model", "default", usage)).toBeNull();
  });
});

describe("OpenAI provider", () => {
  it("returns the parsed answer, usage and the tier that actually served it", async () => {
    const r = await provider(answer(completed('{"items":[]}', { service_tier: "priority" })), "fast").json(req);
    expect(r).toMatchObject({ ok: true, output: { items: [] }, model: "gpt-6-luna", tier: "fast" });
    expect(r.usage).toEqual({ inputTokens: 1680, cachedInputTokens: 0, outputTokens: 885 });
    const standard = await provider(answer(completed("{}", { service_tier: "default" })), "fast").json(req);
    expect(standard.tier).toBe("default");
  });

  it("maps failures without throwing", async () => {
    const err = (status: number, code?: string) => answer({ error: { code, message: "x" } }, status);
    expect((await provider(err(429, "insufficient_quota")).json(req)).ok).toBe(false);
    expect(await provider(err(429, "insufficient_quota")).json(req)).toMatchObject({ error: "quota" });
    expect(await provider(err(429, "rate_limit_exceeded")).json(req)).toMatchObject({ error: "rate_limited" });
    expect(await provider(err(503)).json(req)).toMatchObject({ error: "unavailable" });
    expect(await provider(err(400, "invalid_image")).json(req)).toMatchObject({ error: "bad_request" });
    const offline = async () => {
      throw new TypeError("network");
    };
    expect(await provider(offline).json(req)).toMatchObject({ error: "unavailable" });
    expect(failureOf(404, undefined)).toBe("bad_request");
  });

  it("treats refusals, cut-off answers and broken JSON as no answer, keeping the usage", async () => {
    const refusal = {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
      usage: { input_tokens: 10, output_tokens: 2 },
    };
    expect(await provider(answer(refusal)).json(req)).toMatchObject({ ok: false, error: "refused" });
    const cut = await provider(answer(completed('{"a":', { status: "incomplete" }))).json(req);
    expect(cut).toMatchObject({ ok: false, error: "bad_output" });
    expect(cut.usage?.outputTokens).toBe(885);
    expect(await provider(answer(completed("not json"))).json(req)).toMatchObject({ ok: false, error: "bad_output" });
  });
});

describe("mock provider", () => {
  it("answers from the product's function at no cost", async () => {
    const r = await mockProvider(() => ({ items: ["nasi"] })).json(req);
    expect(r).toMatchObject({ ok: true, output: { items: ["nasi"] }, model: "mock" });
    expect(r.ok && costMicroUsd(r.model, r.tier, r.usage)).toBeNull();
  });
});
