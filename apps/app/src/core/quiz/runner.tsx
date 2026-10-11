import {
  cleanAnswers,
  firstOpenStep,
  isValidAnswer,
  type QuizAnswer,
  type QuizDefinition,
  type QuizStep,
  recapAnswers,
} from "@factory/core/quiz";
import { Button, Card, CardContent, CardHeader, CardTitle, cn, ErrorText, Input, Screen, Text } from "@factory/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { track } from "../analytics";
import { type MessageKey, useI18n } from "../i18n";
import { loadQuizProgress, saveQuizProgress } from "./storage";

/**
 * Runs a product's quiz (D-036): one step per screen, progress bar, back button, answers saved on
 * the device after every step. Ends on the "Rencana kamu siap" summary; `onDone` decides what's
 * next (sign-in, first result or paywall).
 */
export function QuizRunner({ quiz, onDone }: { quiz: QuizDefinition<MessageKey>; onDone: () => void }) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState(() => cleanAnswers(quiz, loadQuizProgress(quiz.id)?.answers));
  const [index, setIndex] = useState(() => firstOpenStep(quiz, answers));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("quiz_start", { quiz: quiz.id });
  }, [quiz.id]);

  function answer(step: QuizStep<MessageKey>, value: QuizAnswer) {
    const next = { ...answers, [step.id]: value };
    const at = quiz.steps.indexOf(step);
    const done = at === quiz.steps.length - 1;
    setAnswers(next);
    saveQuizProgress(quiz.id, { answers: next, ...(done ? { completedAt: Date.now() } : {}) });
    track("quiz_step", { quiz: quiz.id, step: at + 1 });
    if (done) track("quiz_complete", { quiz: quiz.id });
    setIndex(at + 1);
  }

  if (index >= quiz.steps.length)
    return <Summary quiz={quiz} answers={answers} onBack={() => setIndex(quiz.steps.length - 1)} onDone={onDone} />;
  const step = quiz.steps[index] as QuizStep<MessageKey>;
  const total = quiz.steps.length;

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
          aria-valuenow={index}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <View className="h-2 rounded-full bg-primary" style={{ width: `${Math.round((index / total) * 100)}%` }} />
        </View>
      </View>
      <View className="gap-2">
        <Text variant="h2" role="heading">
          {t(step.title)}
        </Text>
        {step.hint ? <Text variant="muted">{t(step.hint)}</Text> : null}
      </View>
      <StepInput key={step.id} step={step} value={answers[step.id]} onAnswer={(v) => answer(step, v)} />
    </Screen>
  );
}

function StepInput({
  step,
  value,
  onAnswer,
}: {
  step: QuizStep<MessageKey>;
  value: QuizAnswer | undefined;
  onAnswer: (v: QuizAnswer) => void;
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
            )}
          >
            <Text className="text-base font-medium text-foreground">{t(o.label)}</Text>
          </Pressable>
        );
      })}
      {isMulti ? (
        <>
          {max < step.options.length ? <Text variant="muted">{`${t("quiz.pickUpTo")} ${max}`}</Text> : null}
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
  onBack,
  onDone,
}: {
  quiz: QuizDefinition<MessageKey>;
  answers: Record<string, QuizAnswer>;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const lines = quiz.summary?.(answers) ?? [];
  return (
    <Screen className="max-w-xl">
      <View className="gap-2">
        <Text variant="h1" role="heading">
          {t("quiz.summary.title")}
        </Text>
        <Text variant="lead">{t("quiz.summary.subtitle")}</Text>
      </View>
      {lines.length > 0 ? (
        <Card>
          <CardContent className="gap-2 pt-6">
            {lines.map((key) => (
              <Text key={key} className="text-foreground">{`✓ ${t(key)}`}</Text>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("quiz.summary.answers")}</CardTitle>
        </CardHeader>
        <CardContent className="gap-3">
          {recapAnswers(quiz, answers).map((r) => (
            <View key={r.title} className="gap-0.5">
              <Text variant="muted">{t(r.title)}</Text>
              <Text className="font-medium text-foreground">
                {r.value !== undefined
                  ? `${r.value}${r.unit ? ` ${t(r.unit)}` : ""}`
                  : r.labels.map((l) => t(l)).join(", ")}
              </Text>
            </View>
          ))}
        </CardContent>
      </Card>
      <Button testID="quiz-done" onPress={onDone}>
        <Text>{t("quiz.summary.cta")}</Text>
      </Button>
      <Button variant="ghost" onPress={onBack}>
        <Text>{t("quiz.back")}</Text>
      </Button>
    </Screen>
  );
}
