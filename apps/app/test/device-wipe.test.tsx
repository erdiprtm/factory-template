import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-105 (UU PDP): deleting the account leaves nothing of the person on the device. Core's own UI
// (slots mocked, D-103) and core message keys only, so this holds in every product repo.
const hook = vi.hoisted(() => ({ calls: 0, fail: false }));
vi.mock("../src/features/device-data", () => ({
  onDeviceWipe: async () => {
    hook.calls++;
    if (hook.fail) throw new Error("product storage trouble");
  },
}));
vi.mock("../src/features/slots", () => ({ slots: {} }));

const { wipeDevice, WIPE_KEEP } = await import("../src/core/device-wipe");
const { loadQuizProgress, saveQuizProgress } = await import("../src/core/quiz/storage");
const { currentTouch } = await import("../src/core/attribution");
const { QuizRunner } = await import("../src/core/quiz/runner");
const { I18nProvider } = await import("../src/core/i18n");

const quiz = {
  id: "wipe-test",
  steps: ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    kind: "single" as const,
    title: "quiz.back" as const,
    options: [
      { value: "x", label: "quiz.next" as const },
      { value: "y", label: "quiz.of" as const },
    ],
  })),
};

function fillDevice() {
  window.localStorage.setItem("theme", "dark");
  window.localStorage.setItem("locale", "en");
  saveQuizProgress(quiz.id, { answers: { a: "x", b: "y", c: "x", d: "x", e: "y" }, completedAt: 1 });
  window.localStorage.setItem("factory.afterSignIn", "/pricing");
  window.localStorage.setItem("factory.firstResult", "1");
  window.localStorage.setItem("factory.consent.marketing", "{}");
  window.localStorage.setItem("myna.mealDraft", "{}"); // a product's own key
  window.sessionStorage.setItem("something", "1");
}

describe("wipeDevice", () => {
  it("clears every key but the display choices, runs the product's hook, and the quiz starts over", async () => {
    fillDevice();
    const before = currentTouch()?.anonId;
    await wipeDevice();
    const left = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).sort();
    expect(left).toEqual([...WIPE_KEEP].sort());
    expect(window.sessionStorage.length).toBe(0);
    expect(hook.calls).toBe(1);
    expect(loadQuizProgress(quiz.id)).toBeNull();
    // A new device as far as attribution goes: the deleted person's anonId isn't reused.
    expect(currentTouch()?.anonId).not.toBe(before);

    render(
      <I18nProvider>
        <QuizRunner quiz={quiz} onDone={() => {}} />
      </I18nProvider>,
    );
    // Step 1 of 5, whatever language the kept choice shows.
    const bar = screen.getByRole("progressbar");
    expect([bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax")]).toEqual(["1", "5"]);
  });

  it("still clears the device when the product's hook fails", async () => {
    fillDevice();
    hook.fail = true;
    await wipeDevice();
    expect(loadQuizProgress(quiz.id)).toBeNull();
    expect(window.localStorage.getItem("myna.mealDraft")).toBeNull();
    hook.fail = false;
  });
});
