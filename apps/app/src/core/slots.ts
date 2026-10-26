// Display slots for core screens (D-054). A product fills them in src/features/slots.tsx to change
// how a core screen LOOKS; core keeps everything else: state, validation, consent checkboxes and the
// accept button (UU PDP), requireAccess, prices from config and "no web prices on native".
// A slot only gets finished, display-ready props: it can't submit, skip or unlock anything.
import type { QuizAnswer, QuizAnswers, QuizStep } from "@factory/core/quiz";
import type { ComponentType } from "react";
import type { Locale, MessageKey } from "./i18n";

export type QuizStepSlotProps = {
  step: QuizStep<MessageKey>;
  /** The current answer, if the user already answered this step (e.g. after "back"). */
  value: QuizAnswer | undefined;
  /**
   * Every answer so far (D-094), keyed by step id, already validated by core: read-only, for
   * display (a bubble that reacts to the goal, live targets from earlier numbers).
   */
  answers: Readonly<QuizAnswers>;
  /** Core validates (isValidAnswer) and ignores invalid answers, so the slot can't skip a step. */
  onAnswer: (value: QuizAnswer) => void;
  /** Go back one step; undefined on the first step. */
  back: (() => void) | undefined;
  progress: { step: number; total: number };
  t: (key: MessageKey) => string;
};

export type HeaderSlotProps = { title: string; subtitle: string };

export type PlanCardSlotProps = {
  plan: { id: string; label: string; months: number };
  /** Formatted by core from product.config.ts, e.g. "Rp249.000". */
  price: string;
  perWeek: string;
  highlighted: boolean;
  /** e.g. "Hemat Rp49.000 (16%) dibanding 6 bulan", for the highlighted plan only. */
  saving: string | null;
  bestLabel: string;
  buyLabel: string;
  /** Starts core's checkout for this plan. */
  onBuy: () => void;
  busy: boolean;
};

export type TabItemSlotProps = {
  label: string;
  active: boolean;
  /** The tab's icon from features/nav.ts, if any. */
  Icon?: ComponentType<{ size: number; color: string }>;
  /** Theme colors (native SVG can't read CSS variables). */
  colors: { primary: string; mutedForeground: string; foreground: string; accent: string };
};

export type QuizSummaryBodySlotProps = {
  /** The product's plan lines (quiz.summary), translated. */
  lines: string[];
  /** The answers, translated and formatted for the locale ("71,5 kg"). */
  recap: { title: string; value: string }[];
  /** The raw answers by step id (D-094), read-only, for numbers the product derives from them. */
  answers: Readonly<QuizAnswers>;
  /**
   * Change one earlier answer from the summary (D-098), e.g. a "Hari latihan" selector. Core
   * validates it (a step of this quiz, isValidAnswer), saves it and redraws the summary; it returns
   * false and changes nothing when the answer is refused. Consent and the "next" button stay core's.
   */
  onChange: (stepId: string, value: QuizAnswer) => boolean;
};

export type PricingFooterSlotProps = {
  /** The payment methods as compact labels ("QRIS", "VA BRI · BNI"), from config. */
  methods: string[];
  /** The user has access now (a renewal, not a first purchase). */
  hasAccess: boolean;
  t: (key: MessageKey) => string;
};

export type BillingReturnSlotProps = {
  state: "checking" | "paid" | "failed" | "timeout";
  /** Core's text for the state. */
  text: string;
  /** Show the "home" button: the payment is final (paid or failed). */
  done: boolean;
  homeLabel: string;
  onHome: () => void;
  /** Paid: when the user's access now ends, formatted for the locale ("12 Okt 2027"), D-098. */
  accessUntil: string | null;
  /** The same moment as an ISO string, for a product's own formatting. */
  accessUntilIso: string | null;
};

export type CenterActionSlotProps = {
  /** "bottom": the phone tab bar's middle (room for a raised round button); "top": the wide web bar. */
  placement: "bottom" | "top";
  /** Theme colors (native SVG can't read CSS variables). */
  colors: { primary: string; primaryForeground: string; mutedForeground: string; foreground: string };
};

export type AdminPanelSlotProps = {
  t: (key: MessageKey) => string;
  locale: Locale;
};

export type CoreSlots = {
  /** One quiz step (question + input): e.g. a chat bubble with a stepper for numbers. */
  quizStep?: ComponentType<QuizStepSlotProps>;
  /** "Rencana kamu siap" header. */
  quizSummaryHeader?: ComponentType<HeaderSlotProps>;
  /** The summary's plan lines and answer recap (D-058). The "next" and "back" buttons stay core's. */
  quizSummaryBody?: ComponentType<QuizSummaryBodySlotProps>;
  /** Back from the payment provider (D-058). Core polls the status and decides the state. */
  billingReturn?: ComponentType<BillingReturnSlotProps>;
  /**
   * `stage` (display only, D-086): "email" while asking for the address, "sent" on "Cek email kamu",
   * so a slot can hide what doesn't fit there (e.g. a "no account yet? try the quiz" link).
   */
  signInHeader?: ComponentType<HeaderSlotProps & { productName: string; stage: "email" | "sent" }>;
  /** /consent and the pre-signup consent gate. The checkboxes and button stay core's. */
  consentHeader?: ComponentType<HeaderSlotProps & { where: "account" | "anonymous" }>;
  pricingIntro?: ComponentType<HeaderSlotProps>;
  /**
   * Under the plan cards on /pricing (D-098): e.g. a short FAQ, which above the plans would push the
   * buy buttons off a small screen. Display only; web only, like the plans (native shows no prices).
   */
  pricingFooter?: ComponentType<PricingFooterSlotProps>;
  /**
   * The product's own wording for a core button, as one of its message keys (D-098). quizSummaryCta:
   * the summary's "next" button, e.g. "Foto makanan pertamaku" when the quiz leads to a free first use.
   */
  labels?: { quizSummaryCta?: MessageKey };
  /** One plan on /pricing and in UpgradePrompt (web only: native never shows prices). */
  planCard?: ComponentType<PlanCardSlotProps>;
  /** The content of one bottom tab; core keeps the press target, role and navigation. */
  tabItem?: ComponentType<TabItemSlotProps>;
  /** Extra classes for the bottom tab bar container. */
  tabBarClassName?: string;
  /**
   * The product's center action (D-111), e.g. a raised camera button: rendered between the two
   * halves of the bottom tabs, and after the links in the wide web bar. It handles its own press
   * (so a web file picker opens inside the tap) and supplies its own role="button" and label. Not a
   * tab: it doesn't count toward MAX_TABS.
   */
  centerAction?: ComponentType<CenterActionSlotProps>;
  /** Icons for the tabs core adds (D-058): Beranda (without product tabs), Akun, Admin. */
  coreTabIcons?: Partial<Record<"home" | "account" | "admin", ComponentType<{ size: number; color: string }>>>;
  accountHeader?: ComponentType<HeaderSlotProps & { productName: string; logo: string }>;
  /**
   * The product's own section on /admin (D-100), under the unit economics: e.g. scan feedback from
   * a product table. Core renders it only for admins; its data comes from the product's own API
   * route, guarded on the server with core's `requireAdmin` (apps/api/src/core/admin.ts).
   */
  adminPanel?: ComponentType<AdminPanelSlotProps>;
};
