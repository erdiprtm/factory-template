import { quizProblems } from "@factory/core/quiz";
import { describe, expect, it } from "vitest";
import { id } from "../src/core/i18n/id";
import { featureMessages } from "../src/features/messages";
import { quiz } from "../src/features/quiz";

// Holds in every product repo: whatever quiz the product defines must be well-formed (D-036).
describe("product quiz", () => {
  it("has 5–8 valid steps (or is turned off)", () => {
    if (quiz) expect(quizProblems(quiz)).toEqual([]);
  });

  it("every string is a translated key", () => {
    if (!quiz) return;
    const keys = new Set([...Object.keys(id), ...Object.keys(featureMessages.id)]);
    const used = quiz.steps.flatMap((s) => [
      s.title,
      ...(s.hint ? [s.hint] : []),
      ...(s.kind === "number" ? (s.unit ? [s.unit] : []) : s.options.map((o) => o.label)),
    ]);
    expect(used.filter((k) => !keys.has(k))).toEqual([]);
  });
});
