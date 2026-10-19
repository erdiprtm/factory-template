import type { ProductConfig } from "@factory/config";

// The privacy policy's AI processor line (D-083, D-084), from product.config.ts `ai`, so the
// policy names whoever actually receives users' text and photos. Empty when the product has no AI.
// Reviewed by a lawyer with the rest of the template before launch.
export function aiProcessorLine(ai: ProductConfig["ai"]): string {
  if (!ai) return "";
  // With a fallback provider (D-091), both receive data, so both are named.
  if (ai.fallback) {
    const backup = processorLine(ai.fallback).replace(
      /^- \*\*(.+?):\*\*/,
      "- **$1 (cadangan, hanya saat penyedia utama tidak bisa dihubungi):**",
    );
    return `${processorLine(ai)}\n${backup}`;
  }
  return processorLine(ai);
}

type Processor = {
  provider: "openai" | "openrouter" | "gemini";
  routing?: { dataCollection: "deny" | "allow"; zdr?: boolean };
};

function processorLine(ai: Processor): string {
  const what = "memproses teks atau foto yang kamu kirim ke fitur AI, untuk menghasilkan jawaban";
  if (ai.provider === "gemini")
    return `- **Google (Gemini API, layanan berbayar):** ${what}. Pada layanan berbayar, Google tidak memakai data ini untuk meningkatkan produknya dan hanya menyimpan log terbatas untuk mendeteksi penyalahgunaan. Kami tidak menyimpan percakapan di Google.`;
  if (ai.provider === "openrouter") {
    const rules = [
      ai.routing?.dataCollection === "deny" ? "tidak menyimpan atau memakai data untuk melatih model" : null,
      ai.routing?.zdr ? "menerapkan tanpa penyimpanan data (zero data retention)" : null,
    ].filter(Boolean);
    const only = rules.length ? ` Kami hanya mengizinkan penyedia yang ${rules.join(" dan ")}.` : "";
    return `- **OpenRouter (perute model) dan penyedia yang menjalankan modelnya:** ${what}. OpenRouter meneruskan permintaan ke penyedia model dan tidak menyimpan isinya.${only}`;
  }
  return `- **OpenAI:** ${what}. OpenAI tidak memakai data API untuk melatih modelnya dan hanya menyimpannya untuk waktu terbatas guna mendeteksi penyalahgunaan.`;
}

/**
 * Fills {{placeholders}} from `values`; unknown ones stay as they are. A placeholder alone on its
 * line that fills in empty (e.g. no AI) removes the whole line, so a list keeps no blank bullet.
 */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text
    .replace(/^\{\{(\w+)\}\}\r?\n/gm, (match, key: string) => (values[key] === "" ? "" : match))
    .replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
