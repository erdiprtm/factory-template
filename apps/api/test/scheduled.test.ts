import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { runScheduled } from "../src/core/cron";
import * as productJobs from "../src/features/scheduled";

// The product's scheduled jobs (D-046) run after core's, and their failure doesn't stop core's.
describe("product scheduled jobs", () => {
  it("runs them with the cron's time and reports their counts", async () => {
    const now = new Date();
    const spy = vi.spyOn(productJobs, "runProductScheduled").mockResolvedValue({ cleaned: 2 });
    const result = await runScheduled(env, now);
    expect(spy).toHaveBeenCalledWith(env, now);
    expect(result.product).toEqual({ cleaned: 2 });
    spy.mockRestore();
  });

  it("keeps core's results when a product job throws", async () => {
    const spy = vi.spyOn(productJobs, "runProductScheduled").mockRejectedValue(new Error("boom"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runScheduled(env);
    expect(result.product).toEqual({});
    expect(result).toHaveProperty("expired");
    spy.mockRestore();
    quiet.mockRestore();
  });
});
