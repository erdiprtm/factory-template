import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { isDocsOnly } from "./docs-only.mjs";

// D-102: docs-only changes skip CI's verify, preview and deploy; anything built never does.
describe("isDocsOnly", () => {
  it("docs, specs and Markdown elsewhere are docs", () => {
    expect(isDocsOnly(["docs/STATUS.md", "docs/DECISIONS.md"])).toBe(true);
    expect(isDocsOnly(["specs/myna-fit.md", "CLAUDE.md", ".claude/skills/x/SKILL.md", "packages/db/README.md"])).toBe(
      true,
    );
    expect(isDocsOnly(["docs/img/flow.png"])).toBe(true);
  });

  it("code, config, workflows and the site's content are not", () => {
    for (const f of [
      "apps/app/src/core/slots.ts",
      "product.config.ts",
      "package.json",
      ".github/workflows/pr.yml",
      "apps/site/src/content/landers/a.md",
      "apps/site/src/content/legal/privasi.md",
      "apps/site/src/pages/tentang.md",
      "factory.json",
    ])
      expect(isDocsOnly(["docs/STATUS.md", f]), f).toBe(false);
  });

  it("an empty list runs everything", () => {
    expect(isDocsOnly([])).toBe(false);
    expect(isDocsOnly(["", "  "])).toBe(false);
  });

  it("the CLI reads git's list on stdin", () => {
    const run = (input) =>
      execFileSync(process.execPath, [new URL("./docs-only.mjs", import.meta.url).pathname], {
        input,
        encoding: "utf8",
      }).trim();
    expect(run("docs/STATUS.md\nspecs/a.md\n")).toBe("true");
    expect(run("docs/STATUS.md\napps/api/src/index.ts\n")).toBe("false");
  });
});
