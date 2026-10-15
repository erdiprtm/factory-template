// Test fixture for scripts/ai-eval.test.mjs (D-085): a product module shaped like
// apps/api/src/features/ai-eval.ts but independent of the product's own one (D-078), whose answers
// also carry macros, so the macro column is checked.
export const aiEval = {
  request: (image) => ({ system: "fixture", text: "fixture", image, schema: { name: "fixture", schema: {} } }),
  score(output) {
    const items = output?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const [first, ...rest] = items;
    return { items: [first.name, ...(first.alternatives ?? []), ...rest.map((i) => i.name)], macros: output.macros };
  },
  mock: () => ({ items: [{ name: "Siomay", alternatives: [] }] }),
  expectedUsage: { inputTokens: 1000, outputTokens: 1000 },
};
