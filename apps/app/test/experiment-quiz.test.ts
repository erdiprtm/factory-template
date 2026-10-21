import { anonIdIn } from "@factory/core/experiments";
import type { QuizDefinition } from "@factory/core/quiz";
import { describe, expect, it, vi } from "vitest";

// D-094: core's /quiz picks the device's arm's quiz. Mocked config and quizzes (D-078).
const experiment = { name: "quiz_length", variants: { short: 50, long: 50 } };
const step = (id: string) => ({
  id,
  kind: "single" as const,
  title: "quiz.back" as const,
  options: [
    { value: "x", label: "quiz.next" as const },
    { value: "y", label: "quiz.of" as const },
  ],
});
const make = (id: string, n: number): QuizDefinition<"quiz.back" | "quiz.next" | "quiz.of"> => ({
  id,
  steps: Array.from({ length: n }, (_, i) => step(`s${i}`)),
});

vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: Record<string, unknown> }).default;
  return { default: { ...real, experiments: { quiz_length: { variants: experiment.variants } } } };
});
vi.mock("../src/features/quiz", () => ({
  quiz: make("plain", 5),
  quizzes: { short: make("short-v1", 8), long: make("long-v1", 14) },
}));

function visit(aid: string) {
  window.localStorage.clear();
  window.history.replaceState(null, "", `/quiz?aid=${aid}`);
}

describe("activeQuiz", () => {
  it("gives each arm its own quiz, sticky for the device", async () => {
    for (const [variant, quizId] of [
      ["short", "short-v1"],
      ["long", "long-v1"],
    ] as const) {
      visit(anonIdIn(experiment, variant, `app${variant}`));
      vi.resetModules();
      const fresh = await import("../src/core/quiz/active");
      const arm = await import("../src/core/experiment");
      expect(arm.currentArm()).toEqual({ experiment: "quiz_length", variant });
      expect(fresh.activeQuiz()?.id).toBe(quizId);
      expect(fresh.activeQuiz()?.id).toBe(quizId);
    }
  });
});
