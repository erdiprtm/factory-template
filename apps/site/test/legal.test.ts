import { readFileSync } from "node:fs";
import { defineProduct, type ProductConfigInput } from "@factory/config";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { aiProcessorLine, fillTemplate, paymentProcessorLine, paymentProcessorName } from "../src/lib/legal";

// The privacy policy names the AI processor that product.config.ts `ai` actually uses (D-083, D-084).
// Holds in every product repo: configs are built from this repo's own, with `ai` swapped.
const base: ProductConfigInput = JSON.parse(JSON.stringify(product));
const withAi = (ai: unknown, sensitiveDataConsent = false) =>
  defineProduct({ ...base, legal: { ...base.legal, sensitiveDataConsent }, ai } as ProductConfigInput).ai;

describe("privacy policy AI processor", () => {
  it("names OpenRouter and the model's provider, with the routing rules in force", () => {
    const line = aiProcessorLine(withAi({ provider: "openrouter", model: "google/gemini-3.8-flash" }, true));
    expect(line).toMatch(/^- \*\*OpenRouter \(perute model\) dan penyedia yang menjalankan modelnya:\*\*/);
    expect(line).toContain("tidak menyimpan atau memakai data untuk melatih model");
    expect(line).toContain("zero data retention");
    const open = aiProcessorLine(
      withAi({ provider: "openrouter", model: "google/gemini-3.8-flash", routing: { dataCollection: "allow" } }),
    );
    expect(open).not.toContain("Kami hanya mengizinkan");
  });

  it("names Google's paid Gemini API, OpenAI, or nothing without AI", () => {
    expect(aiProcessorLine(withAi({ provider: "gemini", model: "gemini-3.8-flash" }))).toMatch(
      /^- \*\*Google \(Gemini API, layanan berbayar\):\*\*/,
    );
    expect(aiProcessorLine(withAi({ provider: "openai", model: "gpt-6-luna" }))).toMatch(/^- \*\*OpenAI:\*\*/);
    expect(aiProcessorLine(null)).toBe("");
  });

  it("with a fallback provider (D-091), names both: the primary, then the backup", () => {
    const line = aiProcessorLine(
      withAi(
        {
          provider: "gemini",
          model: "gemini-3.1-flash-lite",
          fallback: { provider: "openrouter", model: "bytedance-seed/seed-2.0-lite" },
        },
        true,
      ),
    );
    const [first, second] = line.split("\n");
    expect(first).toMatch(/^- \*\*Google \(Gemini API, layanan berbayar\):\*\*/);
    expect(second).toMatch(/^- \*\*OpenRouter \(perute model\) dan penyedia yang menjalankan modelnya \(cadangan/);
    // The fallback follows the product's sensitive-data rule too.
    expect(second).toContain("zero data retention");
  });

  it("the template has the placeholder, and an empty one leaves no blank bullet", () => {
    const md = readFileSync(new URL("../src/content/legal/privasi.md", import.meta.url), "utf8");
    expect(md).toMatch(/^\{\{aiProcessor\}\}$/m);
    const list = "- a\n{{aiProcessor}}\n- b {{name}}\n";
    expect(fillTemplate(list, { aiProcessor: "", name: "X" })).toBe("- a\n- b X\n");
    expect(fillTemplate(list, { aiProcessor: "- ai", name: "X" })).toBe("- a\n- ai\n- b X\n");
    expect(fillTemplate("{{unknown}}", {})).toBe("{{unknown}}");
  });
});

// The privacy policy and terms name the payment processor from payments.provider (D-092).
describe("legal payment processor", () => {
  const withProvider = (provider: string, methods: string[]) =>
    defineProduct({ ...base, payments: { provider, methods } } as ProductConfigInput).payments;

  it("names Pakasir, Duitku or DOKU from the config", () => {
    expect(paymentProcessorLine(withProvider("pakasir", ["qris", "bri_va"]))).toMatch(
      /^- \*\*Pakasir \(penyedia pembayaran\):\*\*/,
    );
    expect(paymentProcessorName(withProvider("duitku", ["QRIS"]))).toBe("Duitku");
    expect(paymentProcessorName(withProvider("doku", ["QRIS"]))).toBe("DOKU");
  });

  it("the templates have the placeholders, and no hard-coded provider name", () => {
    const privacy = readFileSync(new URL("../src/content/legal/privasi.md", import.meta.url), "utf8");
    const terms = readFileSync(new URL("../src/content/legal/syarat.md", import.meta.url), "utf8");
    expect(privacy).toMatch(/^\{\{paymentProcessor\}\}$/m);
    expect(terms).toContain("{{paymentProcessorName}}");
    for (const md of [privacy, terms]) expect(md).not.toMatch(/Duitku|DOKU|Pakasir/);
  });

  it("Pakasir needs its own method codes", () => {
    expect(() => withProvider("pakasir", ["QRIS"])).toThrow(/Pakasir method codes/);
  });
});
