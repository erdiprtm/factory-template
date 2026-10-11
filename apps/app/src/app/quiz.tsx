import { Redirect, useRouter } from "expo-router";
import { useMe } from "../core/auth/use-me";
import { QuizRunner } from "../core/quiz/runner";
import { sendQuiz } from "../core/quiz/send";
import { quiz } from "../features/quiz";

/** Public onboarding quiz (landers' CTA). Products without a quiz go straight to sign-in. */
export default function QuizScreen() {
  const router = useRouter();
  const me = useMe();
  if (!quiz) return <Redirect href="/sign-in" />;
  async function done() {
    if (!me.data?.user) return router.push("/sign-in");
    await sendQuiz(); // a signed-in retake replaces the stored answers
    router.push("/");
  }
  return <QuizRunner quiz={quiz} onDone={done} />;
}
