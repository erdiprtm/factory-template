import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// D-074: legal.consentStyle "single" + consentPlacement "quiz_first". One core checkbox (never
// pre-checked, links to both documents) under the first question; the step can't be answered until
// it's ticked; answering records every required type first.
vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: { legal: object } }).default;
  return {
    default: {
      ...real,
      legal: { ...real.legal, sensitiveDataConsent: true, consentStyle: "single", consentPlacement: "quiz_first" },
    },
  };
});
const needed = ["terms", "privacy", "sensitive_data"];
const accept = vi.fn(async (_types: string[]) => {});
const refresh = vi.fn(async () => {});
const meState = vi.hoisted(() => ({ isPending: false }));
vi.mock("../src/core/api", () => ({ acceptAnonymousConsents: (types: string[]) => accept(types) }));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () =>
    meState.isPending
      ? { isPending: true, data: undefined }
      : { isPending: false, data: { user: null, missingConsents: needed, access: false } },
  useRefreshMe: () => refresh,
}));
vi.mock("../src/core/analytics", () => ({ track: vi.fn() }));

const { ConsentChecks, singleSentence } = await import("../src/core/auth/consent-checks");
const { QuizRunner } = await import("../src/core/quiz/runner");
const { I18nProvider, t } = await import("../src/core/i18n");

const quiz = {
  id: "single-consent-test",
  steps: [
    {
      id: "a",
      kind: "single" as const,
      title: "quizExample.goal.title" as const,
      options: [{ value: "x", label: "quizExample.goal.focus" as const }],
    },
    {
      id: "b",
      kind: "single" as const,
      title: "quizExample.when.title" as const,
      options: [{ value: "y", label: "quizExample.when.morning" as const }],
    },
  ],
};

describe("single consent (D-074)", () => {
  beforeEach(() => {
    accept.mockClear();
    localStorage.clear();
  });

  it("one unticked checkbox naming health data, links to both documents; one tick checks every type", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <ConsentChecks needed={needed as never} checked={{}} onChange={onChange} />
      </I18nProvider>,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.getAttribute("aria-checked")).toBe("false");
    expect(boxes[0]?.textContent).toContain(singleSentence(needed as never, "id", (k) => t(k)));
    expect(boxes[0]?.textContent).toMatch(/data kesehatan/);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links.some((h) => h?.endsWith("/syarat/"))).toBe(true);
    expect(links.some((h) => h?.endsWith("/privasi/"))).toBe(true);
    fireEvent.click(boxes[0] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ terms: true, privacy: true, sensitive_data: true });
  });

  it("the first question can't be answered unticked; ticking then answering records all types, then advances", async () => {
    render(
      <I18nProvider>
        <QuizRunner quiz={quiz} onDone={() => {}} consentAt={0} />
      </I18nProvider>,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("quiz-option"));
    expect(accept).not.toHaveBeenCalled();
    expect(screen.getByText(t("quizExample.goal.title"))).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("quiz-option"));
    await vi.waitFor(() => expect(accept).toHaveBeenCalledWith(needed));
    await vi.waitFor(() => expect(screen.getByText(t("quizExample.when.title"))).toBeTruthy());
  });

  it("stays locked while /api/me is still loading: a fast tap can't skip the consent", async () => {
    meState.isPending = true;
    try {
      render(
        <I18nProvider>
          <QuizRunner quiz={quiz} onDone={() => {}} consentAt={0} />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByTestId("quiz-option"));
      await new Promise((r) => setTimeout(r, 20));
      expect(accept).not.toHaveBeenCalled();
      expect(screen.getByText(t("quizExample.goal.title"))).toBeTruthy();
    } finally {
      meState.isPending = false;
    }
  });

  it("no row and no consent call on other steps or without consentAt", () => {
    render(
      <I18nProvider>
        <QuizRunner quiz={quiz} onDone={() => {}} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
