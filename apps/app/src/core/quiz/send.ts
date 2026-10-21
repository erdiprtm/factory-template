import { cleanAnswers, isQuizComplete } from "@factory/core/quiz";
import { api } from "../api";
import { activeQuiz } from "./active";
import { loadQuizProgress, saveQuizProgress } from "./storage";

/** After sign-in (and consent): attaches the device's completed quiz to the user, once per completion. */
export async function sendQuiz(): Promise<void> {
  const quiz = activeQuiz();
  if (!quiz) return;
  const progress = loadQuizProgress(quiz.id);
  if (!progress?.completedAt || (progress.sentAt ?? 0) >= progress.completedAt) return;
  const answers = cleanAnswers(quiz, progress.answers);
  if (!isQuizComplete(quiz, answers)) return;
  const res = await api.api.quiz
    .$post({ json: { quizId: quiz.id, answers, completedAt: progress.completedAt } })
    .catch(() => null);
  if (res?.ok) saveQuizProgress(quiz.id, { ...progress, sentAt: Date.now() });
}
