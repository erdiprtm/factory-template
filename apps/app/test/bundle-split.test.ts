import { describe, expect, it } from "vitest";

// D-059 (pattern from Myna Fit's P-022): the first web bundle must not pull in the signed-in core
// screens or better-auth's client. They load through one import() of core/signed-in; a static
// import from any route module (all routes are in the entry bundle, async routes are off) would
// put them back. This walks the static, relative import graph of src/ (Vite's import.meta.glob:
// the app has no Node types).

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: "?raw"; import: "default"; eager: true }): Record<string, string>;
  }
}

const sources = import.meta.glob("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const EXTS = ["", ".web.tsx", ".web.ts", ".tsx", ".ts", "/index.tsx", "/index.ts"];

/** Posix join of a file's directory and a relative specifier, e.g. ("../src/a/b.ts", "../c") → "../src/c". */
function join(fromFile: string, spec: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Static imports only: `import … from "./x"` and `export … from "./x"`, not `import("./x")` or `import type`. */
function staticImports(file: string): string[] {
  const code = sources[file] ?? "";
  const specs = [...code.matchAll(/^(?:import|export)\s+(?!type\s)[^;]*?from\s+"(\.[^"]+)"/gms)].map(
    (m) => m[1] as string,
  );
  return specs.flatMap((spec) => {
    const base = join(file, spec);
    const hit = EXTS.map((ext) => base + ext).find((f) => f in sources);
    return hit ? [hit] : [];
  });
}

function reachable(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...staticImports(file));
  }
  return seen;
}

const lazyOnly = [
  "core/signed-in/index.ts",
  "core/signed-in/sign-in.tsx",
  "core/signed-in/account.tsx",
  "core/signed-in/admin.tsx",
  "core/signed-in/pricing.tsx",
  "core/signed-in/billing-return.tsx",
  "core/admin/economics.tsx",
  "core/auth/client.ts",
].map((f) => `../src/${f}`);

describe("web bundle split (D-059)", () => {
  const routes = Object.keys(sources).filter((f) => f.startsWith("../src/app/"));

  it("keeps the signed-in core screens and better-auth out of every route's static imports", () => {
    expect(routes).toContain("../src/app/quiz.tsx");
    const graph = reachable(routes);
    for (const file of lazyOnly) expect(graph.has(file), file).toBe(false);
  });

  it("their route files load them with one shared import()", () => {
    for (const route of ["sign-in", "(app)/account", "(app)/admin", "(app)/pricing", "(app)/billing/return"]) {
      expect(sources[`../src/app/${route}.tsx`], route).toMatch(/import\("(\.\.\/)+core\/signed-in"\)/);
    }
  });
});
