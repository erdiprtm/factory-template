import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// D-098: the quiz summary's wording follows what comes next, a product may name its button, and its
// body slot may change an earlier answer (core-validated); /pricing has a footer slot under the
// plans; the payment return screen knows when access ends. Core message keys only (D-078).
const mock = vi.hoisted(() => ({ slots: {} as Record<string, unknown> }));
vi.mock("../src/features/slots", () => ({ slots: mock.slots }));
vi.mock("../src/core/analytics", () => ({ track: vi.fn(), initAnalytics: () => Promise.resolve() }));
vi.mock("../src/core/marketing", () => ({ metaTrack: vi.fn() }));
vi.mock("../src/core/pwa/install-card", () => ({ InstallOffer: () => null }));
vi.mock("../src/core/billing/plans", () => ({ PlanCards: () => <p>plans</p> }));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ data: { user: { email: "a@example.com" }, access: true } }),
  useRefreshMe: () => () => {},
}));
const until = "2027-10-12T05:00:00.000Z";
vi.mock("../src/core/api", () => ({
  api: {
    api: {
      billing: {
        status: {
          $get: async () => ({
            ok: true,
            json: async () => ({ status: "paid", planId: "12m", amountIdr: 1, event: "purchase", accessUntil: until }),
          }),
        },
      },
    },
  },
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ paymentId: "pay_x" }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const { QuizRunner } = await import("../src/core/quiz/runner");
const { I18nProvider, t } = await import("../src/core/i18n");
const { saveQuizProgress, loadQuizProgress } = await import("../src/core/quiz/storage");
const { Pricing } = await import("../src/core/signed-in/pricing");
const { BillingReturn } = await import("../src/core/signed-in/billing-return");

const option = (value: string) => ({ value, label: "quiz.next" as const });
const single = (id: string) => ({
  id,
  kind: "single" as const,
  title: "quiz.back" as const,
  options: [option("x"), option("y")],
});
const quiz = {
  id: "summary-test",
  steps: [
    ...["a", "b", "c", "d"].map(single),
    { id: "days", kind: "number" as const, title: "quiz.back" as const, min: 1, max: 7 },
  ],
};

function summary(props: { tryFirst?: boolean } = {}) {
  saveQuizProgress(quiz.id, { answers: { a: "x", b: "x", c: "x", d: "x", days: 3 }, completedAt: 1 });
  return render(
    <I18nProvider>
      <QuizRunner quiz={quiz} onDone={() => {}} {...props} />
    </I18nProvider>,
  );
}
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{node}</I18nProvider>
    </QueryClientProvider>,
  );

describe("quiz summary wording (D-098)", () => {
  it("sign-up next: save; a free first use next: try it", () => {
    const { unmount } = summary();
    expect(screen.getByTestId("quiz-done").textContent).toBe(t("quiz.summary.cta"));
    expect(screen.getByText(t("quiz.summary.subtitle"))).toBeTruthy();
    unmount();
    summary({ tryFirst: true });
    expect(screen.getByTestId("quiz-done").textContent).toBe(t("quiz.summary.ctaTry"));
    expect(screen.getByText(t("quiz.summary.subtitleTry"))).toBeTruthy();
  });

  it("a product's own label wins", () => {
    mock.slots.labels = { quizSummaryCta: "common.loading" };
    summary({ tryFirst: true });
    expect(screen.getByTestId("quiz-done").textContent).toBe(t("common.loading"));
    delete mock.slots.labels;
  });
});

describe("summary body slot can change an earlier answer (D-098)", () => {
  it("core validates, saves as a new completion and redraws; refused answers change nothing", () => {
    const results: boolean[] = [];
    mock.slots.quizSummaryBody = ({
      answers,
      onChange,
    }: {
      answers: Record<string, unknown>;
      onChange: (id: string, v: unknown) => boolean;
    }) => (
      <div>
        <p data-testid="days">{String(answers.days)}</p>
        <button type="button" onClick={() => results.push(onChange("days", 5))}>
          ok
        </button>
        <button type="button" onClick={() => results.push(onChange("days", 99), onChange("nope", "x"))}>
          bad
        </button>
      </div>
    );
    summary();
    fireEvent.click(screen.getByText("bad"));
    expect(screen.getByTestId("days").textContent).toBe("3");
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByTestId("days").textContent).toBe("5");
    expect(results).toEqual([false, false, true]);
    const saved = loadQuizProgress(quiz.id);
    expect(saved?.answers.days).toBe(5);
    expect(saved?.completedAt).toBeGreaterThan(1);
    delete mock.slots.quizSummaryBody;
  });
});

describe("/pricing footer slot (D-098)", () => {
  it("sits under the plans and gets the compact methods and the access state", () => {
    mock.slots.pricingFooter = ({ methods, hasAccess }: { methods: string[]; hasAccess: boolean }) => (
      <p data-testid="footer">{`${methods.length > 0}:${hasAccess}`}</p>
    );
    wrap(<Pricing />);
    const plans = screen.getByText("plans");
    const footer = screen.getByTestId("footer");
    expect(footer.textContent).toBe("true:true");
    expect(plans.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(t("pricing.subtitle"))).toBeTruthy();
    delete mock.slots.pricingFooter;
  });
});

describe("/pricing terms switch (D-109)", () => {
  it("payments.showTerms false: no terms subtitle, in the default view or a slot", async () => {
    vi.resetModules();
    vi.doMock("../../../product.config", async (orig) => {
      const real = ((await orig()) as { default: { payments: object } }).default;
      return { default: { ...real, payments: { ...real.payments, showTerms: false } } };
    });
    const fresh = await import("../src/core/signed-in/pricing");
    const i18n = await import("../src/core/i18n");
    const seen: string[] = [];
    mock.slots.pricingIntro = ({ subtitle }: { subtitle: string }) => {
      seen.push(subtitle);
      return null;
    };
    // The fresh modules' own I18nProvider (vi.resetModules gave this test new instances).
    const show = () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <i18n.I18nProvider>
            <fresh.Pricing />
          </i18n.I18nProvider>
        </QueryClientProvider>,
      );
    show();
    expect(seen.at(-1)).toBe("");
    delete mock.slots.pricingIntro;
    show();
    expect(screen.queryByText(i18n.t("pricing.subtitle"))).toBeNull();
    vi.doUnmock("../../../product.config");
  });
});

describe("payment return knows when access ends (D-098)", () => {
  it("default view shows it; a slot gets it formatted and raw", async () => {
    const { unmount } = wrap(<BillingReturn />);
    await waitFor(() => expect(screen.getByText(new RegExp(t("billing.return.until")))).toBeTruthy());
    expect(screen.getByText(/12 Oktober 2027/)).toBeTruthy();
    unmount();
    const seen: unknown[] = [];
    mock.slots.billingReturn = (p: { accessUntil: string | null; accessUntilIso: string | null }) => {
      seen.push([p.accessUntil, p.accessUntilIso]);
      return null;
    };
    wrap(<BillingReturn />);
    await act(async () => {});
    await waitFor(() => expect(seen).toContainEqual(["12 Oktober 2027", until]));
    delete mock.slots.billingReturn;
  });
});
