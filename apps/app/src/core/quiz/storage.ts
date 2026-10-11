import type { QuizAnswers } from "@factory/core/quiz";

// Native: in-memory until Phase 10 adds persistent storage (like theme and locale).
export type QuizProgress = { answers: QuizAnswers; completedAt?: number; sentAt?: number };
const memory = new Map<string, QuizProgress>();

export function loadQuizProgress(quizId: string): QuizProgress | null {
  return memory.get(quizId) ?? null;
}

export function saveQuizProgress(quizId: string, progress: QuizProgress): void {
  memory.set(quizId, progress);
}
