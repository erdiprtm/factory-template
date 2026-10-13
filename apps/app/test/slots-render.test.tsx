import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { withCoreIcons } from "../src/core/nav/tabs";

// D-058 follow-ups to D-054, rendered: summary body slot with locale-formatted numbers, core tab
// icons, and the default summary without the old top gap.
vi.mock("../src/features/slots", () => ({
  slots: {
    quizSummaryBody: ({ recap }: { recap: { title: string; value: string }[] }) => (
      <ul data-testid="recap">
        {recap.map((r) => (
          <li key={r.title}>{r.value}</li>
        ))}
      </ul>
    ),
  },
}));

const { QuizRunner } = await import("../src/core/quiz/runner");
const { I18nProvider } = await import("../src/core/i18n");
const { saveQuizProgress } = await import("../src/core/quiz/storage");

describe("quiz summary body slot", () => {
  it("gets the recap with numbers in the locale's format", () => {
    const quiz = {
      id: "render-test",
      steps: [
        {
          id: "a",
          kind: "single" as const,
          title: "quiz.back" as const,
          options: [
            { value: "x", label: "quiz.next" as const },
            { value: "y", label: "quiz.of" as const },
          ],
        },
        { id: "w", kind: "number" as const, title: "quiz.step" as const, min: 30, max: 200, unit: "quiz.of" as const },
        {
          id: "b",
          kind: "single" as const,
          title: "quiz.back" as const,
          options: [
            { value: "x", label: "quiz.next" as const },
            { value: "y", label: "quiz.of" as const },
          ],
        },
        {
          id: "c",
          kind: "single" as const,
          title: "quiz.of" as const,
          options: [
            { value: "x", label: "quiz.next" as const },
            { value: "y", label: "quiz.of" as const },
          ],
        },
        {
          id: "d",
          kind: "single" as const,
          title: "quiz.next" as const,
          options: [
            { value: "x", label: "quiz.next" as const },
            { value: "y", label: "quiz.of" as const },
          ],
        },
      ],
    };
    saveQuizProgress(quiz.id, { answers: { a: "x", w: 71.5, b: "x", c: "y", d: "x" }, completedAt: Date.now() });
    render(
      <I18nProvider>
        <QuizRunner quiz={quiz} onDone={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("recap").textContent).toContain("71,5");
    expect(screen.getByTestId("quiz-done")).toBeTruthy();
  });
});

describe("core tab icons", () => {
  const Icon = () => null;
  it("fill Beranda, Akun and Admin, and leave a product tab's own icon", () => {
    const own = () => null;
    const tabs = withCoreIcons(
      [
        { href: "/", label: "home" },
        { href: "/scan", label: "scan", icon: own },
        { href: "/account", label: "account", core: "account" as const },
        { href: "/admin", label: "admin", core: "admin" as const },
      ],
      { home: Icon, account: Icon, admin: Icon },
    );
    expect(tabs.map((t) => t.icon)).toEqual([Icon, own, Icon, Icon]);
    expect(withCoreIcons([{ href: "/account", label: "a", core: "account" as const }], {})[0]?.icon).toBeUndefined();
  });
});
