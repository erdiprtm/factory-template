import { quizProblems } from "@factory/core/quiz";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { id } from "../src/core/i18n/id";
import { quizzes } from "../src/core/quiz/active";
import { featureMessages } from "../src/features/messages";
import { quiz } from "../src/features/quiz";

// Holds in every product repo: whatever quiz the product defines must be well-formed (D-036), and so
// must each A/B arm's quiz (D-094), with or without an experiment.
const all = [...(quiz ? [quiz] : []), ...Object.values(quizzes ?? {})];

describe("product quiz", () => {
  it("has 5–16 valid steps (or is turned off)", () => {
    for (const q of all) expect(quizProblems(q)).toEqual([]);
  });

  it("every string is a translated key", () => {
    const keys = new Set([...Object.keys(id), ...Object.keys(featureMessages.id)]);
    const used = all.flatMap((q) =>
      q.steps.flatMap((s) => [
        s.title,
        ...(s.hint ? [s.hint] : []),
        ...(s.kind === "number" ? (s.unit ? [s.unit] : []) : s.options.map((o) => o.label)),
      ]),
    );
    expect(used.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("quizzes per arm match the experiment's arms, each with its own quiz id", () => {
    if (!quizzes) return;
    const [experiment] = Object.values(product.experiments);
    expect(experiment, "features/quiz.ts exports `quizzes`, so product.config.ts needs an experiment").toBeDefined();
    expect(Object.keys(quizzes).sort()).toEqual(Object.keys(experiment?.variants ?? {}).sort());
    const ids = Object.values(quizzes).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
