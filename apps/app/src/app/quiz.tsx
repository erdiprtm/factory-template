import { questionRange } from "@factory/core/quiz";
import { type Href, Redirect, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { AnonymousConsentGate } from "../core/auth/anonymous-consent";
import { consentPlacement } from "../core/auth/inline-consent";
import { useMe } from "../core/auth/use-me";
import { anonymousEntry, paywallPlacement } from "../core/billing/placement";
import { activeQuiz } from "../core/quiz/active";
import { QuizRunner } from "../core/quiz/runner";
import { sendQuiz } from "../core/quiz/send";
import { setAfterSignIn } from "../core/quiz/storage";

/**
 * Public onboarding quiz (landers' CTA). Products without a quiz go straight to sign-in, or to their
 * public entry screen when visitors get a first use before signup (D-042). In that "pay for proof"
 * flow the visitor consents first (D-043): the quiz may ask health data and the first use processes it.
 */
export default function QuizScreen() {
  const router = useRouter();
  const me = useMe();
  // The device's A/B arm picks the quiz when the product tests one (D-094).
  const [quiz] = useState(activeQuiz);
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
  // Inline consent (D-074): a row under the first or last question instead of a screen before.
  // Questions only: info screens (D-129) ask nothing.
  const range = questionRange(definition);
  const consentAt = !anonymousEntry
    ? undefined
    : consentPlacement === "quiz_first"
      ? range.first
      : consentPlacement === "quiz_last"
        ? range.last
        : undefined;
  // A visitor who gets a free first use goes there next, not to sign-up (D-098): the summary says so.
  const tryFirst = Boolean(anonymousEntry) && !me.data?.user;
  // The consent screen (D-043) comes before the first question; intro screens (D-129) come before it.
  const gate = anonymousEntry ? (node: ReactNode) => <AnonymousConsentGate>{node}</AnonymousConsentGate> : undefined;
  return <QuizRunner quiz={definition} onDone={done} consentAt={consentAt} tryFirst={tryFirst} gate={gate} />;
}
