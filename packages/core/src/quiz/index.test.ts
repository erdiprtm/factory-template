import { describe, expect, it } from "vitest";
import {
  cleanAnswers,
  firstOpenStep,
  frozenAnswers,
  isQuizComplete,
  isValidAnswer,
  type QuizDefinition,
  quizProblems,
  recapAnswers,
} from "./index";

const opts = [
  { value: "a", label: "opt.a" },
  { value: "b", label: "opt.b" },
  { value: "c", label: "opt.c" },
];
const quiz: QuizDefinition = {
  id: "onboarding",
  steps: [
    { id: "goal", kind: "single", title: "q.goal", options: opts },
    { id: "habits", kind: "multi", title: "q.habits", options: opts, max: 2 },
    { id: "age", kind: "number", title: "q.age", min: 13, max: 100, unit: "unit.years" },
    { id: "time", kind: "single", title: "q.time", options: opts },
    { id: "level", kind: "single", title: "q.level", options: opts },
  ],
};

describe("quiz definition", () => {
  it("accepts 5–8 well-formed steps", () => {
    expect(quizProblems(quiz)).toEqual([]);
  });

  it("rejects too few or too many steps, duplicate ids, bad options and ranges", () => {
    expect(quizProblems({ ...quiz, steps: quiz.steps.slice(0, 4) })).toHaveLength(1);
    const nine = Array.from({ length: 17 }, (_, i) => ({
      ...(quiz.steps[0] as object),
      id: `s${i}`,
    })) as QuizDefinition["steps"];
    expect(quizProblems({ ...quiz, steps: nine })[0]).toMatch(/5–16/);
    const bad: QuizDefinition = {
      id: "Bad Id",
      steps: [
        ...quiz.steps.slice(0, 3),
        { id: "goal", kind: "single", title: "x", options: [opts[0] as (typeof opts)[0]] },
        { id: "n", kind: "number", title: "x", min: 5, max: 5 },
      ],
    };
    expect(quizProblems(bad)).toEqual([
      'quiz id "Bad Id" must be lowercase letters, digits, - or _',
      "step ids must be unique",
      'step "goal": 2–8 options',
      'step "n": min must be below max',
    ]);
  });
});

describe("answers", () => {
  it("validates by step kind", () => {
    const [single, multi, num] = quiz.steps as [
      QuizDefinition["steps"][0],
      QuizDefinition["steps"][0],
      QuizDefinition["steps"][0],
    ];
    expect([isValidAnswer(single, "a"), isValidAnswer(single, "z"), isValidAnswer(single, ["a"])]).toEqual([
      true,
      false,
      false,
    ]);
    expect([
      isValidAnswer(multi, ["a", "b"]),
      isValidAnswer(multi, ["a", "b", "c"]),
      isValidAnswer(multi, []),
      isValidAnswer(multi, ["a", "a"]),
    ]).toEqual([true, false, false, false]);
    expect([
      isValidAnswer(num, 30),
      isValidAnswer(num, 12),
      isValidAnswer(num, Number.NaN),
      isValidAnswer(num, "30"),
    ]).toEqual([true, false, false, false]);
  });

  it("cleans stored answers, finds the next step and completion", () => {
    const answers = cleanAnswers(quiz, { goal: "a", habits: ["z"], age: 30, extra: "x" });
    expect(answers).toEqual({ goal: "a", age: 30 });
    expect(firstOpenStep(quiz, answers)).toBe(1);
    expect(isQuizComplete(quiz, answers)).toBe(false);
    expect(isQuizComplete(quiz, { ...answers, habits: ["b"], time: "a", level: "c" })).toBe(true);
    expect(cleanAnswers(quiz, "junk")).toEqual({});
  });

  it("recaps answers with option labels", () => {
    expect(recapAnswers(quiz, { goal: "b", habits: ["a", "c"], age: 30 })).toEqual([
      { title: "q.goal", labels: ["opt.b"] },
      { title: "q.habits", labels: ["opt.a", "opt.c"] },
      { title: "q.age", labels: [], value: 30, unit: "unit.years" },
    ]);
  });
});

describe("frozenAnswers (slots read earlier answers, D-094)", () => {
  it("is a copy a slot can't change", () => {
    const answers = { goal: "bulk", blockers: ["time"], days: 3 };
    const shown = frozenAnswers(answers);
    expect(shown).toEqual(answers);
    expect(Object.isFrozen(shown) && Object.isFrozen(shown.blockers)).toBe(true);
    expect(() => {
      (shown as Record<string, unknown>).goal = "cut";
    }).toThrow();
    expect(() => (shown.blockers as string[]).push("x")).toThrow();
    expect(answers.blockers).toEqual(["time"]);
  });
});
