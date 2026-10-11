import type { QuizAnswers } from "@factory/core/quiz";

// Web: quiz progress survives reloads and the magic-link round trip (localStorage, per quiz id).
export type QuizProgress = { answers: QuizAnswers; completedAt?: number; sentAt?: number };
const key = (quizId: string) => `factory.quiz.${quizId}`;

export function loadQuizProgress(quizId: string): QuizProgress | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(quizId)) ?? "null") as QuizProgress | null;
    return raw && typeof raw === "object" && raw.answers && typeof raw.answers === "object" ? raw : null;
  } catch {
    return null;
  }
}

export function saveQuizProgress(quizId: string, progress: QuizProgress): void {
  try {
    window.localStorage.setItem(key(quizId), JSON.stringify(progress));
  } catch {
    // storage blocked: progress lasts for this page load only
  }
}

// Where to go once the quiz's sign-in completes (paywall placement "after_quiz", D-037).
const NEXT = "factory.afterSignIn";
export function setAfterSignIn(path: "/pricing" | "/"): void {
  try {
    window.localStorage.setItem(NEXT, path);
  } catch {}
}
export function takeAfterSignIn(): "/pricing" | null {
  try {
    const v = window.localStorage.getItem(NEXT);
    window.localStorage.removeItem(NEXT);
    return v === "/pricing" ? v : null;
  } catch {
    return null;
  }
}
