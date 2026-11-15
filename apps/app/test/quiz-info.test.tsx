import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// D-129: info screens between questions, in core's own look (slots mocked empty, D-103). They ask
// nothing, the progress bar counts them, the consent gate starts at the first question, and
// quiz_start fires on the first question, not on the intro.
const s = vi.hoisted(() => ({ events: [] as [string, Record<string, unknown>][] }));
vi.mock("../src/features/slots", () => ({ slots: {} }));
vi.mock("../src/core/analytics", () => ({
  track: (e: string, p: Record<string, unknown>) => s.events.push([e, p]),
}));

const { QuizRunner } = await import("../src/core/quiz/runner");
const { I18nProvider } = await import("../src/core/i18n");
const { loadQuizProgress } = await import("../src/core/quiz/storage");

const opts = [
  { value: "x", label: "quiz.next" as const },
  { value: "y", label: "quiz.of" as const },
];
const q = (id: string) => ({ id, kind: "single" as const, title: "quiz.back" as const, options: opts });
const info = (id: string) => ({ id, kind: "info" as const, title: "quiz.step" as const, cta: "common.retry" as const });
const quiz = {
  id: "info-test",
  steps: [info("hi"), info("how"), q("a"), q("b"), info("analysis"), q("c"), q("d"), q("e")],
};
const gate = (node: ReactNode) => <div data-testid="gate">{node}</div>;

beforeEach(() => {
  s.events = [];
  localStorage.clear();
});

describe("quiz info screens", () => {
  it("intro before the gate, then questions inside it; nothing stored for info screens", () => {
    render(
      <I18nProvider>
        <QuizRunner quiz={quiz} onDone={() => {}} gate={gate} />
      </I18nProvider>,
    );
    // Intro: counted by the bar, outside the gate, no quiz_start yet.
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.queryByTestId("gate")).toBeNull();
    expect(screen.queryByTestId("quiz-back")).toBeNull();
    fireEvent.click(screen.getByTestId("quiz-info-next"));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    fireEvent.click(screen.getByTestId("quiz-info-next"));
    expect(s.events.map(([e]) => e)).toEqual(["quiz_start"]);

    // First question: inside the gate.
    expect(screen.getByTestId("gate")).toBeTruthy();
    fireEvent.click(screen.getAllByTestId("quiz-option")[0] as HTMLElement);
    fireEvent.click(screen.getAllByTestId("quiz-option")[0] as HTMLElement);
    // The analysis screen after a question: gated too.
    expect(screen.getByTestId("quiz-info-next")).toBeTruthy();
    expect(screen.getByTestId("gate")).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      const next = screen.queryByTestId("quiz-info-next");
      fireEvent.click(next ?? (screen.getAllByTestId("quiz-option")[0] as HTMLElement));
    }
    expect(screen.getByTestId("quiz-done")).toBeTruthy();
    const saved = loadQuizProgress(quiz.id);
    expect(saved?.answers).toEqual({ a: "x", b: "x", c: "x", d: "x", e: "x" });
    expect(saved?.completedAt).toBeTypeOf("number");
    // quiz_step keeps the question's number (1–5), not the screen's.
    expect(s.events.filter(([e]) => e === "quiz_step").map(([, p]) => p.step)).toEqual([1, 2, 3, 4, 5]);
    expect(s.events.at(-1)?.[0]).toBe("quiz_complete");
  });
});
