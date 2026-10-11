// Config-driven quiz onboarding (sell engine Module 4, D-036). Pure: the definition lives in the
// product's app features (src/features/quiz.ts); strings are i18n keys (K). Answers are kept on
// the device first and attached to the user after signup (POST /api/quiz).

export const QUIZ_MIN_STEPS = 5;
export const QUIZ_MAX_STEPS = 8;

export type QuizOption<K extends string = string> = { value: string; label: K };
export type QuizStep<K extends string = string> =
  | { id: string; kind: "single"; title: K; hint?: K; options: QuizOption<K>[] }
  | { id: string; kind: "multi"; title: K; hint?: K; options: QuizOption<K>[]; max?: number }
  | { id: string; kind: "number"; title: K; hint?: K; min: number; max: number; unit?: K };

export type QuizAnswer = string | string[] | number;
export type QuizAnswers = Record<string, QuizAnswer>;

export type QuizDefinition<K extends string = string> = {
  /** Stable id; change it when the questions change meaning (answers are stored under it). */
  id: string;
  steps: QuizStep<K>[];
  /** Personalized lines for the "Rencana kamu siap" summary. Default: a recap of the answers. */
  summary?: (answers: QuizAnswers) => K[];
};

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** What's wrong with a definition (empty = fine). Checked by a test in every product repo. */
export function quizProblems(def: QuizDefinition): string[] {
  const problems: string[] = [];
  if (!ID.test(def.id)) problems.push(`quiz id "${def.id}" must be lowercase letters, digits, - or _`);
  if (def.steps.length < QUIZ_MIN_STEPS || def.steps.length > QUIZ_MAX_STEPS)
    problems.push(`a quiz has ${QUIZ_MIN_STEPS}–${QUIZ_MAX_STEPS} steps (has ${def.steps.length})`);
  const ids = def.steps.map((s) => s.id);
  if (new Set(ids).size !== ids.length) problems.push("step ids must be unique");
  for (const step of def.steps) {
    if (!ID.test(step.id)) problems.push(`step id "${step.id}" is invalid`);
    if (step.kind === "number") {
      if (!(step.min < step.max)) problems.push(`step "${step.id}": min must be below max`);
      continue;
    }
    if (step.options.length < 2 || step.options.length > 8) problems.push(`step "${step.id}": 2–8 options`);
    const values = step.options.map((o) => o.value);
    if (new Set(values).size !== values.length) problems.push(`step "${step.id}": option values must be unique`);
  }
  return problems;
}

export function isValidAnswer(step: QuizStep, value: unknown): value is QuizAnswer {
  if (step.kind === "number")
    return typeof value === "number" && Number.isFinite(value) && value >= step.min && value <= step.max;
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
  for (const step of def.steps) {
    const v = (answers as Record<string, unknown>)[step.id];
    if (isValidAnswer(step, v)) out[step.id] = v;
  }
  return out;
}

/** The first unanswered step (steps.length when all are answered). */
export function firstOpenStep(def: QuizDefinition, answers: QuizAnswers): number {
  const i = def.steps.findIndex((s) => !(s.id in answers));
  return i === -1 ? def.steps.length : i;
}

export const isQuizComplete = (def: QuizDefinition, answers: QuizAnswers) =>
  firstOpenStep(def, answers) === def.steps.length;

/** Default summary: each step's title with the chosen option labels (numbers shown as given). */
export function recapAnswers<K extends string>(
  def: QuizDefinition<K>,
  answers: QuizAnswers,
): { title: K; labels: K[]; value?: number; unit?: K }[] {
  return def.steps.flatMap((step) => {
    const a = answers[step.id];
    if (a === undefined) return [];
    if (step.kind === "number") return [{ title: step.title, labels: [], value: a as number, unit: step.unit }];
    const chosen = Array.isArray(a) ? a : [a];
    return [{ title: step.title, labels: step.options.filter((o) => chosen.includes(o.value)).map((o) => o.label) }];
  });
}
