import { describe, expect, it } from "vitest";
import { requireAdmin as fromAdmin } from "../src/core/admin";
import { requireAdmin } from "../src/core/require-admin";
import source from "../src/core/require-admin.ts?raw";

// D-125: a product route importing requireAdmin got undefined at module load (core/admin.ts →
// erase-account → features/user-data → the product's module → core/admin.ts), and silently 404'd.
describe("requireAdmin", () => {
  it("lives in a leaf module: nothing it imports at runtime can reach product code", () => {
    const runtime = [...source.matchAll(/^import (?!type )[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
    expect(runtime.every((spec) => !spec?.startsWith("."))).toBe(true);
    expect(typeof requireAdmin).toBe("function");
  });

  it("core/admin.ts still exports the same middleware", () => {
    expect(fromAdmin).toBe(requireAdmin);
  });
});
