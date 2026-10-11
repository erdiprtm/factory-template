import { Redirect, useRouter } from "expo-router";
import { useMe } from "../core/auth/use-me";
import { paywallPlacement } from "../core/billing/placement";
import { QuizRunner } from "../core/quiz/runner";
import { sendQuiz } from "../core/quiz/send";
import { setAfterSignIn } from "../core/quiz/storage";
import { quiz } from "../features/quiz";

/** Public onboarding quiz (landers' CTA). Products without a quiz go straight to sign-in. */
export default function QuizScreen() {
  const router = useRouter();
  const me = useMe();
  if (!quiz) return <Redirect href="/sign-in" />;
  async function done() {
    // Placement "after_quiz" (D-037): the paywall comes right after the quiz and sign-in.
    const next = paywallPlacement === "after_quiz" ? "/pricing" : "/";
    if (!me.data?.user) {
      setAfterSignIn(next);
      return router.push("/sign-in");
    }
    await sendQuiz(); // a signed-in retake replaces the stored answers
    router.push(next);
  }
  return <QuizRunner quiz={quiz} onDone={done} />;
}
