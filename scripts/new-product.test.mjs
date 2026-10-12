import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyProductConfig, parseSpec, registerProduct, renameWorkers, setD1Ids } from "./new-product.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const root = fileURLToPath(new URL("..", import.meta.url));
// The repo's Biome with the repo's biome.json, as the product's `biome ci` runs it.
const biomeFormat = (text, path) =>
  execFileSync("node_modules/.bin/biome", ["format", `--stdin-file-path=${path}`], {
    cwd: root,
    input: text,
    encoding: "utf8",
  });

// These transforms rewrite the TEMPLATE's files, and the generator only runs from the template
// repo. In a product repo (already renamed) there is nothing to rewrite, so skip.
const isTemplate = read("product.config.ts").includes('slug: "factory-template"');

describe.skipIf(!isTemplate)("new-product transforms", () => {
  const spec = parseSpec(read("specs/catatan-harian.md"));

  it("parses name, tagline and plans from the spec", () => {
    expect(spec.name).toBe("Catatan Harian");
    expect(spec.tagline).toMatch(/^Aplikasi catatan harian/);
    expect(spec.plans).toEqual([
      { months: 6, priceIdr: 49000 },
      { months: 12, priceIdr: 79000 },
    ]);
  });

  it("rewrites product.config.ts identity and plans, keeping the rest", () => {
    const out = applyProductConfig(read("product.config.ts"), { slug: "catatan-harian", ...spec });
    expect(out).toContain('slug: "catatan-harian"');
    expect(out).toContain('name: "Catatan Harian"');
    expect(out).toContain('{ id: "6m", label: "6 bulan", months: 6, priceIdr: 49000 },');
    expect(out).toContain('{ id: "12m", label: "12 bulan", months: 12, priceIdr: 79000, highlight: true },');
    expect(out).toContain("primaryForeground"); // brand tokens untouched
    expect(out).not.toContain("factory-template");
    // The template's OpenPanel client must not carry over into a product.
    expect(read("product.config.ts")).toMatch(/openpanelClientId: "[0-9a-f-]{36}"/);
    expect(out).toContain("openpanelClientId: null");
    expect(out).toContain("sentryDsn: null");
  });

  it("writes product.config.ts as Biome formats it, for every spec and a long tagline", () => {
    const specs = readdirSync(new URL("../specs", import.meta.url))
      .filter((f) => f.endsWith(".md"))
      .map((f) => parseSpec(read(`specs/${f}`)))
      .filter((s) => s.name);
    const long = {
      name: "Nama Produk yang Cukup Panjang",
      tagline: `Untuk yang ingin ${"lebih teratur ".repeat(9)}`,
      plans: [],
    };
    for (const s of [...specs, long]) {
      const out = applyProductConfig(read("product.config.ts"), { slug: "produk-baru", ...s });
      expect(out).toContain(JSON.stringify(s.tagline));
      expect(biomeFormat(out, "product.config.ts")).toBe(out);
    }
  });

  it("renames Workers, databases and hosts in wrangler configs", () => {
    const api = renameWorkers(read("apps/api/wrangler.jsonc"), { slug: "catatan-harian", subdomain: "acme" });
    expect(api).toContain('"name": "catatan-harian"');
    expect(api).toContain('"database_name": "catatan-harian-prod"');
    expect(api).toContain('"database_name": "catatan-harian-preview"');
    expect(api).toContain('"bucket_name": "catatan-harian-files"');
    expect(api).toContain('"bucket_name": "catatan-harian-files-preview"');
    expect(api).toContain('"AUTH_HOSTS": "catatan-harian.acme.workers.dev"');
    expect(api).toContain("*-catatan-harian-preview.acme.workers.dev");
    expect(api).not.toContain("factory-template");
    const site = renameWorkers(read("apps/site/wrangler.jsonc"), { slug: "catatan-harian", subdomain: "acme" });
    expect(site).toContain('"name": "catatan-harian-site"');
  });

  it("writes new D1 ids in order (prod, preview)", () => {
    const prodId = "11111111-1111-1111-1111-111111111111";
    const previewId = "22222222-2222-2222-2222-222222222222";
    const out = setD1Ids(read("apps/api/wrangler.jsonc"), { prodId, previewId });
    expect(out.indexOf(prodId)).toBeGreaterThan(0);
    expect(out.indexOf(previewId)).toBeGreaterThan(out.indexOf(prodId));
  });

  it("registers the product in factory.json, replacing the example entry", () => {
    // Fixture, not the real registry: factory.json gains an entry per product.
    const registry = JSON.stringify({ products: [{ slug: "example" }, { slug: "older-product" }] });
    const out = JSON.parse(registerProduct(registry, { slug: "catatan-harian", status: "building" }));
    expect(out.products.map((p) => p.slug)).toEqual(["older-product", "catatan-harian"]);
    // Re-registering replaces the entry instead of duplicating it.
    const again = JSON.parse(registerProduct(JSON.stringify(out), { slug: "catatan-harian", status: "live" }));
    expect(again.products.map((p) => [p.slug, p.status ?? null])).toEqual([
      ["older-product", null],
      ["catatan-harian", "live"],
    ]);
  });
});
