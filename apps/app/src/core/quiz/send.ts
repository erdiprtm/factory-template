import { cleanAnswers, isQuizComplete, sharedAnswers } from "@factory/core/quiz";
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
    // Text answers (a first name) stay on the device (D-125).
    .$post({ json: { quizId: quiz.id, answers: sharedAnswers(quiz, answers), completedAt: progress.completedAt } })
    .catch(() => null);
  if (res?.ok) saveQuizProgress(quiz.id, { ...progress, sentAt: Date.now() });
}
