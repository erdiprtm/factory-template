import {
  cleanAnswers,
  firstOpenStep,
  frozenAnswers,
  isQuestion,
  isValidAnswer,
  type QuizAnswer,
  type QuizDefinition,
  type QuizInfo,
  type QuizStep,
  questionRange,
  recapAnswers,
  TEXT_MAX,
} from "@factory/core/quiz";
import { Button, Card, CardContent, CardHeader, CardTitle, cn, ErrorText, Input, Screen, Text } from "@factory/ui";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
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
 *
 * Info screens (D-129) ask nothing and store nothing. `gate` wraps everything from the first question
 * on (the pre-signup consent screen, D-043), so intro screens before it can work as the lander.
 */
export function QuizRunner(props: RunnerProps) {
  return props.consentAt === undefined ? <Runner {...props} consent={NO_CONSENT} /> : <RunnerWithConsent {...props} />;
}

type RunnerProps = {
  quiz: QuizDefinition<MessageKey>;
  onDone: () => void;
  consentAt?: number;
  tryFirst?: boolean;
  gate?: (node: ReactNode) => ReactNode;
};

const NO_CONSENT: InlineConsent = {
  needed: [],
  pending: false,
  ticked: true,
  nudged: false,
  accept: async () => true,
  row: null,
};

function RunnerWithConsent(props: RunnerProps) {
  return <Runner {...props} consent={useInlineConsent()} />;
}

function Runner({
  quiz,
  onDone,
  consentAt,
  tryFirst = false,
  gate,
  consent,
}: RunnerProps & { consent: InlineConsent }) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState(() => cleanAnswers(quiz, loadQuizProgress(quiz.id)?.answers));
  const [index, setIndex] = useState(() => firstOpenStep(quiz, answers));
  const shown = useMemo(() => frozenAnswers(answers), [answers]);
  const range = useMemo(() => questionRange(quiz), [quiz]);
  const started = useRef(false);

  // On the first question, not on intro screens (D-129): the funnel's quiz_start stays comparable.
  useEffect(() => {
    if (started.current || index < range.first) return;
    started.current = true;
    track("quiz_start", { quiz: quiz.id });
  }, [quiz.id, index, range.first]);

  function answer(step: QuizStep<MessageKey>, value: QuizAnswer) {
    // Core validates every answer, including a product slot's (D-054): an invalid one is ignored.
    if (!isValidAnswer(step, value)) return;
    const next = { ...answers, [step.id]: value };
    const at = quiz.steps.indexOf(step);
    const done = at === range.last;
    setAnswers(next);
    saveQuizProgress(quiz.id, { answers: next, ...(done ? { completedAt: Date.now() } : {}) });
    // The question's number (info screens left out), as before D-129.
    track("quiz_step", { quiz: quiz.id, step: quiz.steps.slice(0, at + 1).filter(isQuestion).length });
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

  const gated = (node: ReactNode) => (gate && index >= range.first ? gate(node) : node);
  if (index >= quiz.steps.length)
    return gated(
      <Summary
        quiz={quiz}
        answers={answers}
        onChange={change}
        tryFirst={tryFirst}
        onBack={() => setIndex(quiz.steps.length - 1)}
        onDone={onDone}
      />,
    );
  const screen = quiz.steps[index];
  if (!screen) return null;
  const total = quiz.steps.length;
  const back = index > 0 ? () => setIndex(index - 1) : undefined;
  if (screen.kind === "info") {
    const next = () => setIndex(index + 1);
    const InfoSlot = slots.quizInfo;
    return gated(
      InfoSlot ? (
        <Screen className="max-w-xl">
          <InfoSlot
            key={screen.id}
            step={screen}
            answers={shown}
            next={next}
            back={back}
            progress={{ step: index + 1, total }}
            t={t}
          />
        </Screen>
      ) : (
        <InfoScreen step={screen} next={next} back={back} progress={{ step: index + 1, total }} />
      ),
    );
  }
  const step = screen;
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
    return gated(
      <Screen className="max-w-xl">
        <StepSlot
          key={step.id}
          step={step}
          value={answers[step.id]}
          answers={shown}
          onAnswer={(v) => void onAnswer(v)}
          back={back}
          progress={{ step: index + 1, total }}
          t={t}
          locked={asking && !consent.ticked}
          consentMissing={asking && consent.nudged}
        />
        {asking ? consent.row : null}
      </Screen>,
    );
  }

  return gated(
    <Screen className="max-w-xl">
      <Progress back={back} step={index + 1} total={total} />
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
    </Screen>,
  );
}

/** Back link, "Langkah N dari M" and the bar. Info screens count (D-129), so the bar moves on them too. */
function Progress({ back, step, total }: { back: (() => void) | undefined; step: number; total: number }) {
  const { t } = useI18n();
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        {back ? (
          <Pressable role="button" onPress={back} className="min-h-11 justify-center pr-4" testID="quiz-back">
            <Text className="text-muted-foreground">{`← ${t("quiz.back")}`}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text variant="muted">{`${t("quiz.step")} ${step} ${t("quiz.of")} ${total}`}</Text>
      </View>
      <View
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <View className="h-2 rounded-full bg-primary" style={{ width: `${Math.round((step / total) * 100)}%` }} />
      </View>
    </View>
  );
}

/** Core's look for an info screen (D-129); a product's quizInfo slot replaces it. */
function InfoScreen({
  step,
  next,
  back,
  progress,
}: {
  step: QuizInfo<MessageKey>;
  next: () => void;
  back: (() => void) | undefined;
  progress: { step: number; total: number };
}) {
  const { t } = useI18n();
  return (
    <Screen className="max-w-xl">
      <Progress back={back} step={progress.step} total={progress.total} />
      {step.image ? (
        <Image
          source={{ uri: step.image }}
          accessibilityIgnoresInvertColors
          className="aspect-video w-full rounded-xl bg-muted"
          resizeMode="cover"
        />
      ) : null}
      <View className="gap-2">
        <Text variant="h2" role="heading">
          {t(step.title)}
        </Text>
        {step.body ? <Text variant="lead">{t(step.body)}</Text> : null}
      </View>
      <Button testID="quiz-info-next" onPress={next}>
        <Text>{t(step.cta)}</Text>
      </Button>
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
  /**
   * Consent not ticked yet (D-074): the answer can be prepared but not sent on. Taps still reach
   * onAnswer, which refuses and shows "Centang persetujuan dulu, ya" (D-124) instead of nothing.
   */
  locked?: boolean;
}) {
  const { t } = useI18n();
  const [multi, setMulti] = useState<string[]>(Array.isArray(value) ? value : []);
  const [text, setText] = useState(
    typeof value === "number" ? String(value) : step.kind === "text" && typeof value === "string" ? value : "",
  );
  const [invalid, setInvalid] = useState(false);

  // A short free answer (D-125), e.g. the first name: kept on the device only.
  if (step.kind === "text") {
    const max = Math.min(step.maxLength ?? TEXT_MAX, TEXT_MAX);
    const submit = () => {
      const v = text.trim().replace(/\s+/g, " ");
      if (!isValidAnswer(step, v)) return;
      onAnswer(v);
    };
    return (
      <View className="gap-3">
        <Input
          testID="quiz-text"
          accessibilityLabel={t(step.title)}
          placeholder={step.placeholder ? t(step.placeholder) : undefined}
          autoCapitalize="words"
          maxLength={max}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
        />
        <Button testID="quiz-next" onPress={submit} disabled={text.trim() === ""}>
          <Text>{t("quiz.next")}</Text>
        </Button>
      </View>
    );
  }

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
        <Button testID="quiz-next" onPress={submit} disabled={text.trim() === ""}>
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
              if (!isMulti) return onAnswer(o.value);
              setMulti((m) =>
                m.includes(o.value) ? m.filter((v) => v !== o.value) : m.length < max ? [...m, o.value] : m,
              );
            }}
            className={cn(
              "min-h-14 justify-center rounded-xl border-2 px-4 py-3",
              selected ? "border-primary bg-accent" : "border-border bg-card",
              locked && "opacity-60",
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
          <Button testID="quiz-next" onPress={() => onAnswer(multi)} disabled={multi.length === 0}>
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
      r.text !== undefined
        ? r.text
        : r.value !== undefined
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
