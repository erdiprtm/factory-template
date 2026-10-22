import {
  cleanAnswers,
  firstOpenStep,
  frozenAnswers,
  isValidAnswer,
  type QuizAnswer,
  type QuizDefinition,
  type QuizStep,
  recapAnswers,
} from "@factory/core/quiz";
import { Button, Card, CardContent, CardHeader, CardTitle, cn, ErrorText, Input, Screen, Text } from "@factory/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { slots } from "../../features/slots";
import { track } from "../analytics";
import { type InlineConsent, useInlineConsent } from "../auth/inline-consent";
import { formatNumber } from "../format";
import { type MessageKey, useI18n } from "../i18n";
import { loadQuizProgress, saveQuizProgress } from "./storage";

/**
 * Runs a product's quiz (D-036): one step per screen, progress bar, back button, answers saved on
 * the device after every step. Ends on the "Rencana kamu siap" summary; `onDone` decides what's
 * next (sign-in, first result or paywall).
 *
 * `consentAt` (D-074): the step under which a visitor gives the pre-signup consent in one row.
 * That step can't be answered until the box is ticked, and answering it records the consent first.
 *
 * `tryFirst` (D-098): the summary leads to a free first use (funnel.anonymousEntry), not to sign-up,
 * so its subtitle and button say so.
 */
export function QuizRunner(props: RunnerProps) {
  return props.consentAt === undefined ? <Runner {...props} consent={NO_CONSENT} /> : <RunnerWithConsent {...props} />;
}

type RunnerProps = {
  quiz: QuizDefinition<MessageKey>;
  onDone: () => void;
  consentAt?: number;
  tryFirst?: boolean;
};

const NO_CONSENT: InlineConsent = { needed: [], pending: false, ticked: true, accept: async () => true, row: null };

function RunnerWithConsent(props: RunnerProps) {
  return <Runner {...props} consent={useInlineConsent()} />;
}

function Runner({ quiz, onDone, consentAt, tryFirst = false, consent }: RunnerProps & { consent: InlineConsent }) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState(() => cleanAnswers(quiz, loadQuizProgress(quiz.id)?.answers));
  const [index, setIndex] = useState(() => firstOpenStep(quiz, answers));
  const shown = useMemo(() => frozenAnswers(answers), [answers]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("quiz_start", { quiz: quiz.id });
  }, [quiz.id]);

  function answer(step: QuizStep<MessageKey>, value: QuizAnswer) {
    // Core validates every answer, including a product slot's (D-054): an invalid one is ignored.
    if (!isValidAnswer(step, value)) return;
    const next = { ...answers, [step.id]: value };
    const at = quiz.steps.indexOf(step);
    const done = at === quiz.steps.length - 1;
    setAnswers(next);
    saveQuizProgress(quiz.id, { answers: next, ...(done ? { completedAt: Date.now() } : {}) });
    track("quiz_step", { quiz: quiz.id, step: at + 1 });
    if (done) track("quiz_complete", { quiz: quiz.id });
    setIndex(at + 1);
  }

  // From the summary (D-098): one earlier answer changed, validated like any other and saved as a
  // new completion, so sendQuiz sends the latest answers after sign-in.
  function change(stepId: string, value: QuizAnswer): boolean {
    const step = quiz.steps.find((s) => s.id === stepId);
    if (!step || !isValidAnswer(step, value)) return false;
    const next = { ...answers, [stepId]: value };
    setAnswers(next);
    saveQuizProgress(quiz.id, { answers: next, completedAt: Date.now() });
    return true;
  }

  if (index >= quiz.steps.length)
    return (
      <Summary
        quiz={quiz}
        answers={answers}
        onChange={change}
        tryFirst={tryFirst}
        onBack={() => setIndex(quiz.steps.length - 1)}
        onDone={onDone}
      />
    );
  const step = quiz.steps[index] as QuizStep<MessageKey>;
  const total = quiz.steps.length;
  // Core's, under the step even when a product slot draws it: the slot can't skip the consent.
  // Locked while /api/me loads too: until then nobody knows whether consent is still needed.
  const asking = index === consentAt && (consent.pending || consent.needed.length > 0);
  const onAnswer = asking
    ? async (v: QuizAnswer) => {
        if (await consent.accept()) answer(step, v);
      }
    : (v: QuizAnswer) => answer(step, v);
  const StepSlot = slots.quizStep;
  if (StepSlot) {
    return (
      <Screen className="max-w-xl">
        <StepSlot
          key={step.id}
          step={step}
          value={answers[step.id]}
          answers={shown}
          onAnswer={(v) => void onAnswer(v)}
          back={index > 0 ? () => setIndex(index - 1) : undefined}
          progress={{ step: index + 1, total }}
          t={t}
        />
        {asking ? consent.row : null}
      </Screen>
    );
  }

  return (
    <Screen className="max-w-xl">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          {index > 0 ? (
            <Pressable
              role="button"
              onPress={() => setIndex(index - 1)}
              className="min-h-11 justify-center pr-4"
              testID="quiz-back"
            >
              <Text className="text-muted-foreground">{`← ${t("quiz.back")}`}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Text variant="muted">{`${t("quiz.step")} ${index + 1} ${t("quiz.of")} ${total}`}</Text>
        </View>
        <View
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <View
            className="h-2 rounded-full bg-primary"
            style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }}
          />
        </View>
      </View>
      <View className="gap-2">
        <Text variant="h2" role="heading">
          {t(step.title)}
        </Text>
        {step.hint ? <Text variant="muted">{t(step.hint)}</Text> : null}
      </View>
      <StepInput
        key={step.id}
        step={step}
        value={answers[step.id]}
        onAnswer={(v) => void onAnswer(v)}
        locked={asking && !consent.ticked}
      />
      {asking ? consent.row : null}
    </Screen>
  );
}

function StepInput({
  step,
  value,
  onAnswer,
  locked = false,
}: {
  step: QuizStep<MessageKey>;
  value: QuizAnswer | undefined;
  onAnswer: (v: QuizAnswer) => void;
  /** Consent not ticked yet (D-074): the answer can be prepared but not sent on. */
  locked?: boolean;
}) {
  const { t } = useI18n();
  const [multi, setMulti] = useState<string[]>(Array.isArray(value) ? value : []);
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  const [invalid, setInvalid] = useState(false);

  if (step.kind === "number") {
    const submit = () => {
      const n = Number(text.replace(",", "."));
      if (!isValidAnswer(step, n)) return setInvalid(true);
      onAnswer(n);
    };
    return (
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <Input
            testID="quiz-number"
            className="flex-1"
            accessibilityLabel={t(step.title)}
            inputMode="decimal"
            value={text}
            onChangeText={(v) => {
              setText(v);
              setInvalid(false);
            }}
            onSubmitEditing={submit}
          />
          {step.unit ? <Text className="text-foreground">{t(step.unit)}</Text> : null}
        </View>
        {invalid ? <ErrorText>{`${t("quiz.numberRange")} ${step.min}–${step.max}`}</ErrorText> : null}
        <Button testID="quiz-next" onPress={submit} disabled={locked || text.trim() === ""}>
          <Text>{t("quiz.next")}</Text>
        </Button>
      </View>
    );
  }

  const isMulti = step.kind === "multi";
  const max = isMulti ? (step.max ?? step.options.length) : 1;
  return (
    <View role={isMulti ? "group" : "radiogroup"} className="gap-3">
      {step.options.map((o) => {
        const selected = isMulti ? multi.includes(o.value) : value === o.value;
        return (
          <Pressable
            key={o.value}
            testID="quiz-option"
            role={isMulti ? "checkbox" : "radio"}
            aria-checked={selected}
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (!isMulti) return locked ? undefined : onAnswer(o.value);
              setMulti((m) =>
                m.includes(o.value) ? m.filter((v) => v !== o.value) : m.length < max ? [...m, o.value] : m,
              );
            }}
            className={cn(
              "min-h-14 justify-center rounded-xl border-2 px-4 py-3",
              selected ? "border-primary bg-accent" : "border-border bg-card",
            )}
          >
            <Text className="text-base font-medium text-foreground">{t(o.label)}</Text>
          </Pressable>
        );
      })}
      {isMulti ? (
        <>
          {max < step.options.length && !step.hint ? (
            <Text variant="muted">{`${t("quiz.pickUpTo")} ${max}`}</Text>
          ) : null}
          <Button testID="quiz-next" onPress={() => onAnswer(multi)} disabled={locked || multi.length === 0}>
            <Text>{t("quiz.next")}</Text>
          </Button>
        </>
      ) : null}
    </View>
  );
}

function Summary({
  quiz,
  answers,
  onChange,
  tryFirst,
  onBack,
  onDone,
}: {
  quiz: QuizDefinition<MessageKey>;
  answers: Record<string, QuizAnswer>;
  onChange: (stepId: string, value: QuizAnswer) => boolean;
  tryFirst: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  // What comes next decides the wording (D-098); a product's own button label wins.
  const subtitle = t(tryFirst ? "quiz.summary.subtitleTry" : "quiz.summary.subtitle");
  const cta = t(slots.labels?.quizSummaryCta ?? (tryFirst ? "quiz.summary.ctaTry" : "quiz.summary.cta"));
  const lineTexts = (quiz.summary?.(answers) ?? []).map((key) => t(key));
  // Answers translated and formatted for the locale ("71,5 kg" in Indonesian), for both views.
  const recap = recapAnswers(quiz, answers).map((r) => ({
    title: t(r.title),
    value:
      r.value !== undefined
        ? `${formatNumber(r.value, locale)}${r.unit ? ` ${t(r.unit)}` : ""}`
        : r.labels.map((l) => t(l)).join(", "),
  }));
  const Header = slots.quizSummaryHeader;
  const Body = slots.quizSummaryBody;
  return (
    <Screen className="max-w-xl">
      {Header ? (
        <Header title={t("quiz.summary.title")} subtitle={subtitle} />
      ) : (
        <View className="gap-2">
          <Text variant="h1" role="heading">
            {t("quiz.summary.title")}
          </Text>
          <Text variant="lead">{subtitle}</Text>
        </View>
      )}
      {Body ? (
        <Body lines={lineTexts} recap={recap} answers={frozenAnswers(answers)} onChange={onChange} />
      ) : (
        <>
          {lineTexts.length > 0 ? (
            <Card>
              <CardContent className="gap-2">
                {lineTexts.map((line) => (
                  <Text key={line} className="text-foreground">{`✓ ${line}`}</Text>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t("quiz.summary.answers")}</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              {recap.map((r) => (
                <View key={r.title} className="gap-0.5">
                  <Text variant="muted">{r.title}</Text>
                  <Text className="font-medium text-foreground">{r.value}</Text>
                </View>
              ))}
            </CardContent>
          </Card>
        </>
      )}
      <Button testID="quiz-done" onPress={onDone}>
        <Text>{cta}</Text>
      </Button>
      <Button variant="ghost" onPress={onBack}>
        <Text>{t("quiz.back")}</Text>
      </Button>
    </Screen>
  );
}
