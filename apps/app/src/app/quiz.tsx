import { type Href, Redirect, useRouter } from "expo-router";
import { AnonymousConsentGate } from "../core/auth/anonymous-consent";
import { useMe } from "../core/auth/use-me";
import { anonymousEntry, paywallPlacement } from "../core/billing/placement";
import { QuizRunner } from "../core/quiz/runner";
import { sendQuiz } from "../core/quiz/send";
import { setAfterSignIn } from "../core/quiz/storage";
import { quiz } from "../features/quiz";

/**
 * Public onboarding quiz (landers' CTA). Products without a quiz go straight to sign-in, or to their
 * public entry screen when visitors get a first use before signup (D-042). In that "pay for proof"
 * flow the visitor consents first (D-043): the quiz may ask health data and the first use processes it.
 */
export default function QuizScreen() {
  const router = useRouter();
  const me = useMe();
  if (!quiz) return <Redirect href={(anonymousEntry ?? "/sign-in") as Href} />;
  const definition = quiz;
  async function done() {
    // Placement "after_quiz" (D-037): the paywall comes right after the quiz and sign-in.
    const next = paywallPlacement === "after_quiz" ? "/pricing" : "/";
    if (!me.data?.user) {
      if (anonymousEntry) return router.push(anonymousEntry as Href);
      setAfterSignIn(next);
      return router.push("/sign-in");
    }
    await sendQuiz(); // a signed-in retake replaces the stored answers
    router.push(next);
  }
  const runner = <QuizRunner quiz={definition} onDone={done} />;
  return anonymousEntry ? <AnonymousConsentGate>{runner}</AnonymousConsentGate> : runner;
}
