// PRODUCT-OWNED: the onboarding quiz (sell engine Module 4, D-036). Replace this EXAMPLE with the
// product's own 5–8 questions (from the spec). Strings are keys in ./messages.ts. Set
// `export const quiz = null` to skip the quiz (landers then go straight to sign-in).
// Health-adjacent products: ask only what the product needs, and never diagnose (CLAUDE.md).
import type { QuizDefinition } from "@factory/core/quiz";
import type { MessageKey } from "../core/i18n";

export const quiz: QuizDefinition<MessageKey> | null = {
  id: "contoh-v1",
  steps: [
    {
      id: "goal",
      kind: "single",
      title: "quizExample.goal.title",
      options: [
        { value: "focus", label: "quizExample.goal.focus" },
        { value: "routine", label: "quizExample.goal.routine" },
        { value: "learn", label: "quizExample.goal.learn" },
      ],
    },
    {
      id: "blockers",
      kind: "multi",
      title: "quizExample.blockers.title",
      hint: "quizExample.blockers.hint",
      max: 2,
      options: [
        { value: "time", label: "quizExample.blockers.time" },
        { value: "motivation", label: "quizExample.blockers.motivation" },
        { value: "start", label: "quizExample.blockers.start" },
        { value: "track", label: "quizExample.blockers.track" },
      ],
    },
    {
      id: "minutes",
      kind: "single",
      title: "quizExample.minutes.title",
      options: [
        { value: "5", label: "quizExample.minutes.5" },
        { value: "15", label: "quizExample.minutes.15" },
        { value: "30", label: "quizExample.minutes.30" },
      ],
    },
    { id: "days", kind: "number", title: "quizExample.days.title", min: 1, max: 7, unit: "quizExample.days.unit" },
    {
      id: "when",
      kind: "single",
      title: "quizExample.when.title",
      options: [
        { value: "morning", label: "quizExample.when.morning" },
        { value: "noon", label: "quizExample.when.noon" },
        { value: "evening", label: "quizExample.when.evening" },
      ],
    },
  ],
  summary: (a) => [
    a.minutes === "5" ? "quizExample.plan.short" : "quizExample.plan.regular",
    "quizExample.plan.reminder",
  ],
};
