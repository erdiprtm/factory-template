// Quiz answers in D1 (D-036). The API doesn't know the product's questions (they live in the
// app's features), so it stores any small, well-formed answer set; products validate meaning.
import { quizResponses } from "@factory/db";
import { eq } from "drizzle-orm";
import type { Db } from "../entitlements";
import type { QuizAnswers } from "./index";

export async function saveQuizResponse(
  db: Db,
  input: { userId: string; quizId: string; answers: QuizAnswers; completedAt: Date },
  now = new Date(),
): Promise<void> {
  const answers = JSON.stringify(input.answers);
  await db
    .insert(quizResponses)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      quizId: input.quizId,
      answers,
      completedAt: input.completedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [quizResponses.userId, quizResponses.quizId],
      set: { answers, completedAt: input.completedAt, updatedAt: now },
    });
}

/** The user's answers per quiz (for product features, the export, and the app). */
export async function quizResponsesFor(db: Db, userId: string) {
  const rows = await db
    .select({ quizId: quizResponses.quizId, answers: quizResponses.answers, completedAt: quizResponses.completedAt })
    .from(quizResponses)
    .where(eq(quizResponses.userId, userId));
  return rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) as QuizAnswers }));
}

export async function deleteQuizResponses(db: Db, userId: string): Promise<void> {
  await db.delete(quizResponses).where(eq(quizResponses.userId, userId));
}
