import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ciScope } from "./ci-scope.mjs";

// D-102, D-104: docs skip CI, site-only changes skip the app's E2E and deploy only the site,
// everything else runs as before.
describe("ciScope", () => {
  it("docs: docs, specs and Markdown outside apps/site", () => {
    expect(ciScope(["docs/STATUS.md", "docs/DECISIONS.md"])).toBe("docs");
    expect(ciScope(["specs/myna-fit.md", "CLAUDE.md", ".claude/skills/x/SKILL.md", "packages/db/README.md"])).toBe(
      "docs",
    );
  });

  it("site: only apps/site, with or without docs", () => {
    expect(ciScope(["apps/site/src/components/Pricing.astro"])).toBe("site");
    expect(ciScope(["apps/site/src/content/landers/a.md", "docs/STATUS.md"])).toBe("site");
    expect(ciScope(["apps/site/public/hero.webp", "apps/site/test/build.test.ts"])).toBe("site");
  });

  it("full: anything the site or the app builds from, config, workflows, and an empty list", () => {
    for (const f of [
      "apps/app/src/core/slots.ts",
      "apps/api/src/index.ts",
      "packages/core/src/pricing/index.ts",
      "product.config.ts",
      "factory.json",
      "package.json",
      "pnpm-lock.yaml",
      ".github/workflows/deploy.yml",
      "scripts/smoke-test.mjs",
    ])
      expect(ciScope(["apps/site/src/pages/index.astro", f]), f).toBe("full");
    expect(ciScope([])).toBe("full");
    expect(ciScope(["", "  "])).toBe("full");
  });

  it("the CLI reads git's list on stdin", () => {
    const run = (input) =>
      execFileSync(process.execPath, [new URL("./ci-scope.mjs", import.meta.url).pathname], {
        input,
        encoding: "utf8",
      }).trim();
    expect(run("docs/STATUS.md\nspecs/a.md\n")).toBe("docs");
    expect(run("apps/site/src/pages/harga.astro\ndocs/STATUS.md\n")).toBe("site");
    expect(run("docs/STATUS.md\napps/api/src/index.ts\n")).toBe("full");
  });
});
