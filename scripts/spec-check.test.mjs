import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSpec } from "./spec-check.mjs";

const template = readFileSync(new URL("../docs/SPEC_TEMPLATE.md", import.meta.url), "utf8")
  .split("````md")[1]
  .split("````")[0];
const dummy = readFileSync(new URL("../specs/catatan-harian.md", import.meta.url), "utf8");

describe("spec-check", () => {
  it("accepts a complete spec (the Phase 8 dummy)", () => {
    expect(checkSpec(dummy)).toEqual([]);
  });

  it("rejects the unfilled template with every required section named", () => {
    const problems = checkSpec(template);
    expect(problems.join("\n")).toMatch(/Core features/);
    expect(problems.join("\n")).toMatch(/Paid vs free/);
    expect(problems.join("\n")).toMatch(/Data the product stores/);
    expect(problems.join("\n")).toMatch(/Kill criteria/);
  });

  it("rejects more than three core features", () => {
    const spec = dummy.replace("3. (Berbayar) Cari kata di semua catatan.", "3. a\n4. b");
    expect(checkSpec(spec)).toContain("Core features: at most 3 in v1 (found 4)");
  });
});
