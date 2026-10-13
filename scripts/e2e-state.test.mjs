import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { E2E_STATE, resetE2eState } from "./e2e-state.mjs";

describe("e2e-state (a fresh local D1 per E2E run, D-064)", () => {
  it("empties E2E's own state and leaves pnpm dev's .wrangler/state alone", () => {
    const api = mkdtempSync(join(tmpdir(), "e2e-state-"));
    const e2e = join(api, E2E_STATE, "v3/d1");
    const dev = join(api, ".wrangler/state/v3/d1");
    for (const dir of [e2e, dev]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "db.sqlite"), "counters");
    }
    expect(resetE2eState(api)).toBe(join(api, ".wrangler/e2e"));
    expect(existsSync(join(api, E2E_STATE))).toBe(false);
    expect(existsSync(join(dev, "db.sqlite"))).toBe(true);
    // A first run, with nothing there yet, is fine too.
    expect(() => resetE2eState(api)).not.toThrow();
  });
});
