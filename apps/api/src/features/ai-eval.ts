import type { AiImage, AiJsonRequest } from "@factory/core/ai";
import type { EvalPrediction, EvalProduct } from "@factory/core/ai/eval";

// PRODUCT-OWNED: what `pnpm ai:eval` (D-085, docs/AI_EVAL.md) sends for one eval photo and how it
// reads the answer. Keep it on the product's REAL code path: in a product, import the request
// builder and schema the scan route uses (e.g. `import { scanRequest } from "./scan"`) instead of
// the example below, so the eval measures exactly what users get.
//
// The template's example: recognise the dishes in a meal photo, ranked, with alternatives. The
// model only names dishes; nutrition numbers shown to users come from the product's curated data
// (CLAUDE.md guardrails). A product whose scan returns macros can compute them in `score` the same
// way its route does (model's names and portions × curated data), so the macro column checks them.

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          alternatives: { type: "array", items: { type: "string" } },
        },
        required: ["name", "alternatives"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** The example meal-photo request (in a product: the scan route's own builder). */
export function mealPhotoRequest(image: AiImage): AiJsonRequest {
  return {
    system:
      "Kenali makanan di foto. Sebutkan setiap hidangan dengan nama Indonesia yang umum, yang paling besar dulu, " +
      "dengan sampai 2 nama lain yang mungkin. Jangan menebak angka gizi.",
    text: "Makanan apa saja di foto ini?",
    image,
    detail: "auto",
    schema: { name: "meal_photo", schema },
    maxOutputTokens: 1500,
  };
}

type Answer = { items?: { name?: unknown; alternatives?: unknown }[] };

export const aiEval: EvalProduct = {
  request: mealPhotoRequest,
  // Ranked names: the first dish, its alternatives, then the other dishes.
  score(output): EvalPrediction | null {
    const items = (output as Answer | null)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const [first, ...rest] = items;
    const alts = Array.isArray(first?.alternatives) ? first.alternatives : [];
    const names = [first?.name, ...alts, ...rest.map((i) => i?.name)];
    return { items: names.filter((n): n is string => typeof n === "string" && n.trim() !== "") };
  },
  mock: () => ({ items: [{ name: "Nasi putih", alternatives: ["Nasi uduk"] }] }),
  // A measured photo scan on gpt-6-luna was about 1,680 tokens in and 885 out (D-045).
  expectedUsage: { inputTokens: 1700, outputTokens: 900 },
};
