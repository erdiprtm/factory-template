import type { QuizDefinition } from "@factory/core/quiz";
import * as features from "../../features/quiz";
import { currentArm } from "../experiment";
import type { MessageKey } from "../i18n";

type Quiz = QuizDefinition<MessageKey>;

/**
 * The product's quizzes per A/B arm (D-094): features/quiz.ts may export
 * `quizzes: { [variant]: QuizDefinition }` next to `quiz`, keyed by the arms of the one experiment
 * in product.config.ts. Optional, so a product's quiz.ts without it keeps compiling.
 */
export const quizzes = (features as { quizzes?: Record<string, Quiz> | null }).quizzes ?? null;

/** The quiz this device takes: its arm's, else `quiz` (no experiment, or an arm without one). */
export function activeQuiz(): Quiz | null {
  const arm = currentArm();
  return (arm && quizzes?.[arm.variant]) || features.quiz;
}
