import { describe, expect, it } from "vitest";
import { isAnonId, newAnonId } from "../attribution/touch";
import { activeExperiment, anonIdIn, bucketOf, experimentTag, variantFor } from "./index";

// D-094: a device's arm is a pure function of its anonId, so the site, the app and the API agree.
const quizLength = { name: "quiz_length", variants: { short: 50, long: 50 } };

describe("variantFor", () => {
  it("is stable for a device and the same in every runtime (pinned FNV-1a buckets)", () => {
    expect(bucketOf("quiz_length", "aaaaaaaaaaaaaaaa")).toBe(bucketOf("quiz_length", "aaaaaaaaaaaaaaaa"));
    // Pinned: changing the hash would move every running test's devices between arms.
    expect([bucketOf("quiz_length", "aaaaaaaaaaaaaaaa"), bucketOf("x", "0123456789abcdef")]).toEqual([33, 39]);
  });

  it("splits devices by the weights", () => {
    const split = { name: "cta", variants: { a: 20, b: 80 } };
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 10_000; i++) {
      const v = variantFor(split, newAnonId());
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect((counts.a ?? 0) / 10_000).toBeGreaterThan(0.17);
    expect((counts.a ?? 0) / 10_000).toBeLessThan(0.23);
  });

  it("depends on the experiment's name, so a new test reshuffles devices", () => {
    const ids = Array.from({ length: 200 }, () => newAnonId());
    const a = ids.map((id) => variantFor(quizLength, id));
    const b = ids.map((id) => variantFor({ ...quizLength, name: "quiz_length_2" }, id));
    expect(a).not.toEqual(b);
  });
});

describe("experimentTag and activeExperiment", () => {
  it("tags only with an experiment and an anonId", () => {
    const id = anonIdIn(quizLength, "long");
    expect(experimentTag(quizLength, id)).toEqual({ experiment: "quiz_length", variant: "long" });
    expect(experimentTag(null, id)).toBeNull();
    expect(experimentTag(quizLength, null)).toBeNull();
  });

  it("reads the config's one experiment", () => {
    expect(activeExperiment({})).toBeNull();
    expect(activeExperiment(undefined)).toBeNull();
    expect(activeExperiment({ quiz_length: { variants: { short: 50, long: 50 } } })).toEqual(quizLength);
  });
});

describe("anonIdIn (E2E: choose the arm by choosing the device)", () => {
  it("returns a valid anonId in the asked arm, deterministically", () => {
    for (const v of ["short", "long"]) {
      const id = anonIdIn(quizLength, v, "seed");
      expect(isAnonId(id)).toBe(true);
      expect(variantFor(quizLength, id)).toBe(v);
      expect(anonIdIn(quizLength, v, "seed")).toBe(id);
    }
    expect(() => anonIdIn(quizLength, "medium")).toThrow(/unknown variant/);
  });
});
