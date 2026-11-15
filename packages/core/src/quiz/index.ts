// Config-driven quiz onboarding (sell engine Module 4, D-036). Pure: the definition lives in the
// product's app features (src/features/quiz.ts); strings are i18n keys (K). Answers are kept on
// the device first and attached to the user after signup (POST /api/quiz).

// 5–8 steps is the default advice (D-036); up to 16 so a longer quiz can be tested against it (D-094).
// Questions only: info screens (D-129) don't count.
export const QUIZ_MIN_STEPS = 5;
export const QUIZ_MAX_STEPS = 16;
/** Most info screens in one quiz (D-129). */
export const QUIZ_MAX_INFO = 8;

export type QuizOption<K extends string = string> = { value: string; label: K };
export type QuizStep<K extends string = string> =
  | { id: string; kind: "single"; title: K; hint?: K; options: QuizOption<K>[] }
  | { id: string; kind: "multi"; title: K; hint?: K; options: QuizOption<K>[]; max?: number }
  | { id: string; kind: "number"; title: K; hint?: K; min: number; max: number; unit?: K }
  /**
   * A short free answer, e.g. the first name (D-125). Trimmed, at most `maxLength` characters
   * (default and cap TEXT_MAX). Kept on the device only: never sent to the API or analytics.
   */
  | { id: string; kind: "text"; title: K; hint?: K; placeholder?: K; maxLength?: number };

/**
 * A screen without a question (D-129): an intro, an "analysis" of the answers so far, a proof
 * screen. It stores no answer, sends nothing and doesn't count as a question. Info screens before
 * the first question come before the pre-signup consent (D-043): they ask nothing. `image` is a URL
 * (an absolute one on native).
 */
export type QuizInfo<K extends string = string> = {
  id: string;
  kind: "info";
  title: K;
  body?: K;
  cta: K;
  image?: string;
};

/** One screen of a quiz: a question or an info screen. */
export type QuizScreen<K extends string = string> = QuizStep<K> | QuizInfo<K>;

export const isQuestion = <K extends string>(s: QuizScreen<K>): s is QuizStep<K> => s.kind !== "info";

/** Longest text answer (D-125). */
export const TEXT_MAX = 40;

export type QuizAnswer = string | string[] | number;
export type QuizAnswers = Record<string, QuizAnswer>;

export type QuizDefinition<K extends string = string> = {
  /** Stable id; change it when the questions change meaning (answers are stored under it). */
  id: string;
  /** Questions, with info screens (D-129) anywhere between them. */
  steps: QuizScreen<K>[];
  /** Personalized lines for the "Rencana kamu siap" summary. Default: a recap of the answers. */
  summary?: (answers: QuizAnswers) => K[];
};

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** What's wrong with a definition (empty = fine). Checked by a test in every product repo. */
export function quizProblems(def: QuizDefinition): string[] {
  const problems: string[] = [];
  if (!ID.test(def.id)) problems.push(`quiz id "${def.id}" must be lowercase letters, digits, - or _`);
  const questions = def.steps.filter(isQuestion);
  if (questions.length < QUIZ_MIN_STEPS || questions.length > QUIZ_MAX_STEPS)
    problems.push(`a quiz has ${QUIZ_MIN_STEPS}–${QUIZ_MAX_STEPS} questions (has ${questions.length})`);
  const infos = def.steps.length - questions.length;
  if (infos > QUIZ_MAX_INFO) problems.push(`a quiz has at most ${QUIZ_MAX_INFO} info screens (has ${infos})`);
  const ids = def.steps.map((s) => s.id);
  if (new Set(ids).size !== ids.length) problems.push("step ids must be unique");
  for (const step of def.steps) {
    if (!ID.test(step.id)) problems.push(`step id "${step.id}" is invalid`);
    if (step.kind === "info") continue;
    if (step.kind === "number") {
      if (!(step.min < step.max)) problems.push(`step "${step.id}": min must be below max`);
      continue;
    }
    if (step.kind === "text") {
      const max = step.maxLength ?? TEXT_MAX;
      if (!Number.isInteger(max) || max < 1 || max > TEXT_MAX)
        problems.push(`step "${step.id}": maxLength is 1–${TEXT_MAX}`);
      continue;
    }
    if (step.options.length < 2 || step.options.length > 8) problems.push(`step "${step.id}": 2–8 options`);
    const values = step.options.map((o) => o.value);
    if (new Set(values).size !== values.length) problems.push(`step "${step.id}": option values must be unique`);
  }
  return problems;
}

export function isValidAnswer(step: QuizScreen, value: unknown): value is QuizAnswer {
  if (step.kind === "info") return false; // nothing to answer (D-129)
  if (step.kind === "number")
    return typeof value === "number" && Number.isFinite(value) && value >= step.min && value <= step.max;
  if (step.kind === "text")
    return (
      typeof value === "string" &&
      value === value.trim() &&
      value.length > 0 &&
      value.length <= Math.min(step.maxLength ?? TEXT_MAX, TEXT_MAX) &&
      // biome-ignore lint/suspicious/noControlCharactersInRegex: a name has no control characters
      !/[\u0000-\u001f\u007f]/.test(value)
    );
  const allowed = new Set(step.options.map((o) => o.value));
  if (step.kind === "single") return typeof value === "string" && allowed.has(value);
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= (step.max ?? step.options.length) &&
    new Set(value).size === value.length &&
    value.every((v) => typeof v === "string" && allowed.has(v))
  );
}

/** Keeps only valid answers to this definition's steps (stored data can be stale or tampered). */
export function cleanAnswers(def: QuizDefinition, answers: unknown): QuizAnswers {
  const out: QuizAnswers = {};
  if (!answers || typeof answers !== "object") return out;
  for (const step of def.steps.filter(isQuestion)) {
    const v = (answers as Record<string, unknown>)[step.id];
    if (isValidAnswer(step, v)) out[step.id] = v;
  }
  return out;
}

/** The answers that may leave the device (D-125): everything but text steps, which stay on it. */
export function sharedAnswers(def: QuizDefinition, answers: QuizAnswers): QuizAnswers {
  const local = new Set(def.steps.filter((s) => s.kind === "text").map((s) => s.id));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !local.has(id)));
}

/**
 * Where a returning visitor continues: the first unanswered question, or the info screens right
 * before it (D-129: a fresh visitor sees the intro). steps.length when every question is answered.
 */
export function firstOpenStep(def: QuizDefinition, answers: QuizAnswers): number {
  if (isQuizComplete(def, answers)) return def.steps.length;
  let i = def.steps.findIndex((s) => isQuestion(s) && !(s.id in answers));
  while (i > 0 && def.steps[i - 1]?.kind === "info") i--;
  return i;
}

export const isQuizComplete = (def: QuizDefinition, answers: QuizAnswers) =>
  def.steps.every((s) => !isQuestion(s) || s.id in answers);

/** Index of the first and the last question (D-129: info screens may come before and after). */
export function questionRange(def: QuizDefinition): { first: number; last: number } {
  const at = def.steps.flatMap((s, i) => (isQuestion(s) ? [i] : []));
  return { first: at[0] ?? -1, last: at.at(-1) ?? -1 };
}

/** Default summary: each step's title with the chosen option labels (numbers shown as given). */
export function recapAnswers<K extends string>(
  def: QuizDefinition<K>,
  answers: QuizAnswers,
): { title: K; labels: K[]; value?: number; unit?: K; text?: string }[] {
  return def.steps.flatMap((step) => {
    const a = answers[step.id];
    if (a === undefined || step.kind === "info") return [];
    if (step.kind === "number") return [{ title: step.title, labels: [], value: a as number, unit: step.unit }];
    if (step.kind === "text") return [{ title: step.title, labels: [], text: a as string }];
    const chosen = Array.isArray(a) ? a : [a];
    return [{ title: step.title, labels: step.options.filter((o) => chosen.includes(o.value)).map((o) => o.label) }];
  });
}

/** A frozen copy for product slots (D-094): they read earlier answers but can't change core's state. */
export function frozenAnswers(answers: QuizAnswers): Readonly<QuizAnswers> {
  return Object.freeze(
    Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze([...v]) : v])),
  ) as Readonly<QuizAnswers>;
}
