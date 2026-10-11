// PRODUCT-OWNED: UI strings for product features (src/features/**), merged into the core
// catalogs by src/core/i18n. Use a feature prefix ("notes.title"). Every key needs both
// languages: `en` is typed from `id`, so a missing translation fails the typecheck.
// Keys must not reuse core keys (core wins; the i18n test checks for overlap).

// EXAMPLE quiz strings (features/quiz.ts): replace with the product's own.
const id = {
  "quizExample.goal.title": "Apa yang paling ingin kamu capai?",
  "quizExample.goal.focus": "Lebih fokus setiap hari",
  "quizExample.goal.routine": "Punya rutinitas yang teratur",
  "quizExample.goal.learn": "Belajar hal baru sedikit demi sedikit",
  "quizExample.blockers.title": "Apa yang biasanya menghambatmu?",
  "quizExample.blockers.hint": "Pilih maksimal dua.",
  "quizExample.blockers.time": "Tidak sempat",
  "quizExample.blockers.motivation": "Semangat cepat turun",
  "quizExample.blockers.start": "Bingung mulai dari mana",
  "quizExample.blockers.track": "Lupa mencatat kemajuan",
  "quizExample.minutes.title": "Berapa lama waktu yang kamu punya per hari?",
  "quizExample.minutes.5": "5 menit",
  "quizExample.minutes.15": "15 menit",
  "quizExample.minutes.30": "30 menit atau lebih",
  "quizExample.days.title": "Berapa hari per minggu kamu mau rutin?",
  "quizExample.days.unit": "hari",
  "quizExample.when.title": "Kapan waktu terbaikmu?",
  "quizExample.when.morning": "Pagi",
  "quizExample.when.noon": "Siang",
  "quizExample.when.evening": "Malam",
  "quizExample.plan.short": "Langkah kecil 5 menit, cocok untuk hari yang padat",
  "quizExample.plan.regular": "Sesi rutin yang bertahap naik tiap minggu",
  "quizExample.plan.reminder": "Pengingat di waktu terbaikmu",
} as const;

export type FeatureMessages = Record<keyof typeof id, string>;

const en: FeatureMessages = {
  "quizExample.goal.title": "What do you most want to achieve?",
  "quizExample.goal.focus": "Focus better every day",
  "quizExample.goal.routine": "Have a steady routine",
  "quizExample.goal.learn": "Learn something new, bit by bit",
  "quizExample.blockers.title": "What usually gets in the way?",
  "quizExample.blockers.hint": "Pick up to two.",
  "quizExample.blockers.time": "No time",
  "quizExample.blockers.motivation": "Motivation fades fast",
  "quizExample.blockers.start": "Not sure where to start",
  "quizExample.blockers.track": "Forget to track progress",
  "quizExample.minutes.title": "How much time do you have per day?",
  "quizExample.minutes.5": "5 minutes",
  "quizExample.minutes.15": "15 minutes",
  "quizExample.minutes.30": "30 minutes or more",
  "quizExample.days.title": "How many days a week do you want to keep at it?",
  "quizExample.days.unit": "days",
  "quizExample.when.title": "When is your best time?",
  "quizExample.when.morning": "Morning",
  "quizExample.when.noon": "Midday",
  "quizExample.when.evening": "Evening",
  "quizExample.plan.short": "Small 5-minute steps for busy days",
  "quizExample.plan.regular": "Regular sessions that build up every week",
  "quizExample.plan.reminder": "Reminders at your best time",
};

export const featureMessages = { id, en };
