import type { QuizAnswers } from "@factory/core/quiz";
import { kvGet, kvRemove, kvSet } from "../kv";

// Native: quiz progress kept across app restarts (core/kv, D-060), with the web build's keys.
export type QuizProgress = { answers: QuizAnswers; completedAt?: number; sentAt?: number };
const key = (quizId: string) => `factory.quiz.${quizId}`;

export function loadQuizProgress(quizId: string): QuizProgress | null {
  try {
    const raw = JSON.parse(kvGet(key(quizId)) ?? "null") as QuizProgress | null;
    return raw && typeof raw === "object" && raw.answers && typeof raw.answers === "object" ? raw : null;
  } catch {
    return null;
  }
}

export function saveQuizProgress(quizId: string, progress: QuizProgress): void {
  kvSet(key(quizId), JSON.stringify(progress));
}

// Where to go once the quiz's sign-in completes (paywall placement "after_quiz", D-037).
const NEXT = "factory.afterSignIn";
export function setAfterSignIn(path: "/pricing" | "/"): void {
  kvSet(NEXT, path);
}
export function takeAfterSignIn(): "/pricing" | null {
  const v = kvGet(NEXT);
  kvRemove(NEXT);
  return v === "/pricing" ? v : null;
}
