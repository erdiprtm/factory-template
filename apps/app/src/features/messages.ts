// PRODUCT-OWNED: UI strings for product features (src/features/**), merged into the core
// catalogs by src/core/i18n. Use a feature prefix ("notes.title"). Every key needs both
// languages: `en` is typed from `id`, so a missing translation fails the typecheck.
// Keys must not reuse core keys (core wins; the i18n test checks for overlap).

const id = {} as const;

export type FeatureMessages = Record<keyof typeof id, string>;

const en: FeatureMessages = {};

export const featureMessages = { id, en };
