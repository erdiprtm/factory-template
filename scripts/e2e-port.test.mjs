import { describe, expect, it } from "vitest";
import product from "../product.config.ts";
import { e2ePort } from "./e2e-port.mjs";

// D-097: each repo's E2E server gets its own port, so two repos' runs don't collide.
describe("e2ePort", () => {
  it("is stable per slug, in 8800–9799, and differs between products", () => {
    expect(e2ePort("myna-fit", undefined)).toBe(e2ePort("myna-fit", undefined));
    const ports = ["factory-template", "myna-fit", "myna-flow", "myna-health"].map((s) => e2ePort(s, undefined));
    for (const p of ports) {
      expect(p).toBeGreaterThanOrEqual(8800);
      expect(p).toBeLessThan(9800);
      expect(p).not.toBe(9229);
    }
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("this repo's port is usable", () => {
    expect([8787, 9229]).not.toContain(e2ePort(product.slug, undefined));
  });

  it("E2E_PORT overrides it, and a bad or reserved value is refused", () => {
    expect(e2ePort("myna-fit", "8901")).toBe(8901);
    expect(e2ePort("myna-fit", "")).toBe(e2ePort("myna-fit", undefined));
    for (const bad of ["abc", "80", "70000", "8787", "9229", "88.5"])
      expect(() => e2ePort("x", bad)).toThrow(/E2E_PORT/);
  });
});
