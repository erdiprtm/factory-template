import { z } from "zod";

// Worker names are `<slug>` and `<slug>-preview`, and preview aliases add `pr-<n>-`,
// so keep the slug short and DNS-safe.
const slug = z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/, "lowercase letters, digits and dashes; 3-40 chars");

const hostname = z
  .string()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "a hostname like app.example.com");

const locale = z.enum(["id", "en"]);

const planSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  months: z.int().positive(),
  priceIdr: z.int().positive(),
  highlight: z.boolean().optional(),
});

// A CSS length for radii: "12px", "0.75rem", "0", or "9999px" for a pill.
const cssLength = z.string().regex(/^(0|\d+(\.\d+)?(px|rem))$/, "a CSS length like 12px or 0.75rem");

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a 6-digit hex color like #2563eb");
// Token names follow React Native Reusables / shadcn so components work unchanged.
// scripts/gen-theme.mjs turns them into CSS variables for the app (and the site).
export const colorTokens = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "border",
  "input",
  "ring",
] as const;
const colorScale = z.object(
  Object.fromEntries(colorTokens.map((k) => [k, hex])) as Record<(typeof colorTokens)[number], typeof hex>,
);

const aiCaps = {
  perUserPerDay: z.int().min(1).max(1000).default(20),
  anonymousPerDay: z.int().min(0).max(100000).default(300),
};
// "vendor/model" with an optional ":variant". ":free" endpoints are refused: free models may log
// or train on prompts, and products send personal (often health) data.
const openRouterSlug = z
  .string()
  .regex(
    /^~?[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._-]{0,80}(:[a-z0-9-]{1,20})?$/,
    'an OpenRouter model slug like "google/gemini-3.8-flash"',
  )
  .refine((s) => !s.endsWith(":free"), { message: "free OpenRouter models may train on prompts: use a paid one" });
const providerSlug = z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,60}$/, "an OpenRouter provider slug");
const geminiModel = z.string().regex(/^gemini-[a-z0-9][a-z0-9.-]{0,60}$/, 'a Gemini model id like "gemini-3.8-flash"');
/** USD per 1M tokens. */
const aiPrice = z.object({ input: z.number().min(0), cachedInput: z.number().min(0), output: z.number().min(0) });

// The three providers' own settings (D-045, D-083, D-084), without caps: also the shape of a fallback.
const openAiShape = {
  provider: z.literal("openai"),
  model: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,60}$/),
  tier: z.enum(["default", "fast"]).default("default"),
};

const openRouterShape = {
  provider: z.literal("openrouter"),
  model: openRouterSlug,
  fallbackModels: z.array(openRouterSlug).max(3).default([]),
  routing: z
    .object({
      /** Only providers that support every parameter sent (response_format above all). */
      requireParameters: z.boolean().default(true),
      /** "deny": only providers that don't collect (store or train on) the data. */
      dataCollection: z.enum(["deny", "allow"]).default("deny"),
      /** Zero Data Retention endpoints only. Unset = legal.sensitiveDataConsent (resolved by defineProduct). */
      zdr: z.boolean().optional(),
      /** Provider slugs allowed (only) or tried first (order). */
      only: z.array(providerSlug).min(1).optional(),
      order: z.array(providerSlug).min(1).optional(),
      /** Whether other providers may serve when the preferred ones can't (OpenRouter default: true). */
      allowFallbacks: z.boolean().optional(),
    })
    .default({ requireParameters: true, dataCollection: "deny" }),
  prices: z.record(openRouterSlug, aiPrice).default({}),
  tier: z.literal("default").default("default"),
};

const geminiShape = {
  provider: z.literal("gemini"),
  model: geminiModel,
  thinking: z.enum(["minimal", "low", "medium", "high"]).optional(),
  mediaResolution: z.enum(["low", "medium", "high", "ultra_high"]).optional(),
  /** USD per 1M tokens per model id, over the template's list (a new model needs no release, D-091). */
  prices: z.record(geminiModel, aiPrice).default({}),
  tier: z.literal("default").default("default"),
};

/**
 * Another provider to try when the primary can't answer at all (D-091): unavailable, quota, rate
 * limited, 5xx or a timeout. Never on bad output or a refusal: another model mustn't silently retry
 * those. Its own key comes from the environment as usual; without it there's no fallback.
 */
export const aiFallbackSchema = z.discriminatedUnion("provider", [
  z.object(openAiShape),
  z.object(openRouterShape),
  z.object(geminiShape),
]);

/** product.config.ts `ai` without null (D-045, D-083, D-084, D-091); see the comment at `ai` below. */
export const aiSchema = z.discriminatedUnion("provider", [
  z.object({ ...openAiShape, fallback: aiFallbackSchema.optional(), ...aiCaps }),
  z.object({ ...openRouterShape, fallback: aiFallbackSchema.optional(), ...aiCaps }),
  z.object({ ...geminiShape, fallback: aiFallbackSchema.optional(), ...aiCaps }),
]);

/** aiSchema refusing unknown keys (a typo fails): `pnpm ai:eval`'s model configs (D-085). */
export const strictAiSchema = z.discriminatedUnion(
  "provider",
  aiSchema.options.map((o) => o.strict()) as unknown as typeof aiSchema.options,
);

/** An `ai` config as parsed (routing.zdr possibly unset). */
export type AiConfigParsed = z.output<typeof aiSchema>;
/** An `ai` config with OpenRouter's zdr resolved: what defineProduct returns. */
export type AiConfig = AiConfigParsed extends infer A
  ? A extends { provider: "openrouter"; routing: infer R }
    ? Omit<A, "routing"> & { routing: Omit<R, "zdr"> & { zdr: boolean } }
    : A
  : never;

/** Zero Data Retention by default whenever the product handles sensitive (health) data (D-083). */
export function resolveAi(ai: AiConfigParsed, legal: { sensitiveDataConsent: boolean }): AiConfig {
  // An OpenRouter fallback (D-091) follows the same rule as an OpenRouter primary.
  type WithRouting = { provider: string; routing?: { zdr?: boolean } };
  const zdr = <T extends WithRouting>(p: T): T =>
    p.provider === "openrouter" && p.routing
      ? { ...p, routing: { ...p.routing, zdr: p.routing.zdr ?? legal.sensitiveDataConsent } }
      : p;
  return { ...zdr(ai), ...(ai.fallback ? { fallback: zdr(ai.fallback) } : {}) } as AiConfig;
}

/** Pakasir API v2 method codes (D-092; @factory/core/billing PAKASIR_METHODS has labels and limits). */
export const PAKASIR_METHOD_CODES = [
  "qris",
  "bri_va",
  "bni_va",
  "cimb_niaga_va",
  "maybank_va",
  "danamon_va",
  "bnc_va",
  "bsi_va",
  "muamalat_va",
  "ocbc_va",
] as const;

export const productSchema = z.object({
  slug,
  name: z.string().min(1),
  tagline: z.string().min(1),
  locale: z
    .object({ default: locale, supported: z.array(locale).nonempty() })
    .refine((l) => l.supported.includes(l.default), {
      message: "default locale must be in supported",
      path: ["default"],
    }),
  // null until the product has its own domain (it runs on workers.dev until then)
  domain: z
    .object({
      app: hostname.nullable(),
      site: hostname.nullable(),
      /**
       * One domain only (D-068): the site path a visitor without a session sees at "/" instead of
       * sign-in, e.g. "/mulai/" (routed to the site Worker). null = sign-in, as before.
       */
      anonymousHome: z
        .string()
        .regex(/^\/(?!api\/|_expo\/|assets\/)[a-z0-9-]+(\/[a-z0-9-]+)*\/$/, "a site path like /mulai/")
        .nullable()
        .default(null),
    })
    .refine((d) => d.anonymousHome === null || (d.app !== null && d.site === d.app), {
      message: "anonymousHome needs one domain: domain.app set and domain.site equal to it",
      path: ["anonymousHome"],
    }),
  brand: z
    .object({
      tokens: z
        .object({
          // dark: required unless brand.darkMode is false (D-076).
          colors: z.object({ light: colorScale, dark: colorScale.optional() }),
          radius: z.string(),
          fontFamily: z.object({ sans: z.string(), heading: z.string().optional() }),
          // Everything below is optional; unset = the template's look (D-052).
          /** Corner radius per element (CSS length). Unset: card/button/input/sheet = radius, chip = pill. */
          radii: z
            .object({ card: cssLength, button: cssLength, chip: cssLength, input: cssLength, sheet: cssLength })
            .partial()
            .default({}),
          /** Height of buttons and inputs in px (44 is the minimum touch target). Unset = 48. */
          controlHeight: z.int().min(44).max(72).optional(),
          /** Card elevation. */
          shadow: z.enum(["none", "soft", "lift"]).default("none"),
          /** Spacing inside cards and screens. */
          density: z.enum(["compact", "regular"]).default("regular"),
          /** Font weights. Unset heading = h1 bold, h2/h3 semibold; unset body = normal. */
          weights: z
            .object({
              heading: z.enum(["medium", "semibold", "bold", "extrabold"]).optional(),
              body: z.enum(["normal", "medium"]).optional(),
            })
            .default({}),
          /**
           * Bundled font files, no calls to Google: app web + native load them with expo-font from
           * apps/app/assets/fonts/<file>; the site self-hosts apps/site/public/fonts/<file>. Once any is
           * listed, fontFamily.sans (body) and fontFamily.heading (headings) must name listed families.
           */
          fonts: z
            .array(
              z.object({
                family: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/, "a font family name"),
                file: z
                  .string()
                  .regex(
                    /^[\w-]+\.(ttf|otf)$/,
                    "a .ttf or .otf font file name like Inter-Regular.ttf (Metro and expo-font on native need these)",
                  ),
                weight: z.int().min(100).max(900).multipleOf(100).default(400),
              }),
            )
            .max(12)
            .default([]),
        })
        .superRefine((t, ctx) => {
          if (t.fonts.length === 0) return;
          // Several weights per family are fine (D-057); the same family + weight twice is not.
          const seen = new Set<string>();
          for (const f of t.fonts) {
            const key = `${f.family}@${f.weight}`;
            if (seen.has(key))
              ctx.addIssue({
                code: "custom",
                message: `font "${f.family}" weight ${f.weight} is listed twice`,
                path: ["fonts"],
              });
            seen.add(key);
          }
          const families = new Set(t.fonts.map((f) => f.family));
          for (const [key, name] of Object.entries(t.fontFamily)) {
            if (name && !families.has(name))
              ctx.addIssue({
                code: "custom",
                message: `fontFamily.${key} "${name}" is not in fonts`,
                path: ["fontFamily", key],
              });
          }
        }),
      logo: z.string().startsWith("/"),
      favicon: z.string().startsWith("/"),
      /**
       * The site header (D-096): the product name as text (today's look), the logo (`logo`, served
       * by the site) or both. logoHeight in px; the link keeps its 44 px tap target.
       */
      header: z
        .object({
          show: z.enum(["name", "logo", "logo_name"]).default("name"),
          logoHeight: z.int().min(20).max(64).default(32),
        })
        .default({ show: "name", logoHeight: 32 }),
      /**
       * Hand-made PNG favicons, relative to apps/app (D-096), exactly 16 and 32 px. Unset: `pnpm theme`
       * scales pwa.icon down. Either way it writes /favicon-16.png, /favicon-32.png and /favicon.ico
       * to the app and the site, linked next to the SVG favicon.
       */
      faviconPng: z
        .object({
          "16": z.string().regex(/^[\w-]+(\/[\w-]+)*\.png$/, "a PNG path relative to apps/app"),
          "32": z.string().regex(/^[\w-]+(\/[\w-]+)*\.png$/, "a PNG path relative to apps/app"),
        })
        .nullable()
        .default(null),
      /**
       * Whether the product has a dark mode (D-076). false = light only: no colors.dark needed, no
       * .dark CSS, the app never switches to dark (no Tampilan row in Akun), the site loads no
       * /theme.js, and both say color-scheme "light". Default true: today's behaviour.
       */
      darkMode: z.boolean().default(true),
    })
    .superRefine((b, ctx) => {
      if (b.darkMode && !b.tokens.colors.dark)
        ctx.addIssue({
          code: "custom",
          message: "colors.dark is required unless brand.darkMode is false",
          path: ["tokens", "colors", "dark"],
        });
    })
    // Light only: dark mirrors light, so code that picks a palette by scheme always gets one.
    .transform((b) => ({
      ...b,
      tokens: {
        ...b.tokens,
        colors: { light: b.tokens.colors.light, dark: b.tokens.colors.dark ?? b.tokens.colors.light },
      },
    })),
  trial: z.object({ enabled: z.boolean(), days: z.int().min(1).max(90) }),
  plans: z
    .array(planSchema)
    .nonempty()
    .superRefine((plans, ctx) => {
      const ids = plans.map((p) => p.id);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "plan ids must be unique" });
      if (plans.filter((p) => p.highlight).length > 1)
        ctx.addIssue({ code: "custom", message: "at most one plan can be highlighted" });
    }),
  // Duitku and DOKU show their hosted page; methods there only document intent (D-017). Pakasir
  // (D-092) uses the app's own checkout: methods are Pakasir codes, QRIS shown first.
  payments: z
    .object({
      provider: z.enum(["duitku", "doku", "pakasir"]),
      methods: z.array(z.string().min(1)).nonempty(),
    })
    .superRefine((p, ctx) => {
      if (p.provider !== "pakasir") return;
      const unknown = p.methods.filter((m) => !(PAKASIR_METHOD_CODES as readonly string[]).includes(m));
      if (unknown.length > 0)
        ctx.addIssue({
          code: "custom",
          message: `Pakasir method codes are ${PAKASIR_METHOD_CODES.join(", ")}; unknown: ${unknown.join(", ")}`,
        });
    }),
  legal: z.object({
    companyName: z.string().min(1),
    contactEmail: z.email(),
    sensitiveDataConsent: z.boolean(),
    // Filled into the privacy policy and terms templates (apps/site). Reviewed by a lawyer before launch.
    // Set true only after a lawyer reviewed the privacy policy and terms; removes the TEMPLATE banner.
    reviewed: z.boolean().default(false),
    productDataDescription: z.string().default("Tidak ada data tambahan selain data akun dan langganan."),
    /**
     * How the required consents are asked (D-074). "separate": one checkbox per document, as before.
     * "single": one checkbox whose sentence names the documents (and, with sensitiveDataConsent, the
     * health data and its purpose: word it in features/messages.ts); one tick records every type.
     */
    consentStyle: z.enum(["separate", "single"]).default("separate"),
    /**
     * Where a visitor consents before signup, in "pay for proof" products (D-043, D-074). "screen":
     * a screen before the quiz, as before. "quiz_first" / "quiz_last": a row under the quiz's first
     * or last question; nothing leaves the device before it's ticked.
     */
    consentPlacement: z.enum(["screen", "quiz_first", "quiz_last"]).default("screen"),
    refundPolicy: z
      .string()
      .default(
        "Karena akses diberikan segera setelah pembayaran, pembayaran tidak dapat dikembalikan, kecuali terjadi kesalahan tagihan atau layanan tidak dapat dipakai karena kesalahan kami. Hubungi kami untuk pengajuan.",
      ),
  }),
  admin: z.object({ emails: z.array(z.email()) }),
  // OpenPanel (FACTORY_BLUEPRINT.md Section 9). The client ID is public (it ships to browsers);
  // its secret never goes here. Unset = analytics off. Events are sent from production only.
  analytics: z.object({ openpanelClientId: z.uuid().nullable().default(null) }).default({ openpanelClientId: null }),
  // Sentry DSN (public: browsers carry it; it can only submit events). Unset = monitoring off.
  // Errors are reported from production and preview only, with PII scrubbed (@factory/core/monitoring).
  monitoring: z.object({ sentryDsn: z.url().nullable().default(null) }).default({ sentryDsn: null }),
  // Sign-in (D-079). emailCode: the sign-in email carries a 6-digit code next to the magic link,
  // typed where the visitor started (an email app's browser keeps its own cookies). On by default.
  auth: z.object({ emailCode: z.boolean().default(true) }).default({ emailCode: true }),
  // The paid funnel (sell engine Module 5, D-037): the first real result comes before the paywall.
  // freeUses: free uses of the core action per user, enforced by the API (requireAccessOrFreeUse).
  // paywallPlacement: when the paywall is offered: right after the quiz and sign-in, under the first
  // result, or only once the free uses run out.
  // anonymousFreeUses: uses a visitor gets BEFORE signing up ("pay for proof", D-042), counted toward
  // freeUses once they sign up; 0 = sign-in required. anonymousPerIpPerDay caps them per IP per day
  // (generous: mobile carriers put many people behind one IP).
  // anonymousEntry: the product's PUBLIC screen for that first use (e.g. "/scan"), outside the signed-in
  // area. The quiz leads there instead of to sign-in, after the visitor's consent (D-043). Required
  // when anonymousFreeUses > 0.
  funnel: z
    .object({
      coreAction: z
        .string()
        .regex(/^[a-z][a-z0-9_]{1,30}$/)
        .default("core"),
      freeUses: z.int().min(0).max(100).default(1),
      anonymousFreeUses: z.int().min(0).max(10).default(0),
      anonymousPerIpPerDay: z.int().min(1).max(1000).default(20),
      anonymousEntry: z
        .string()
        .regex(/^\/[a-z0-9][a-z0-9/-]{0,60}$/, 'an app path like "/scan"')
        .nullable()
        .default(null),
      paywallPlacement: z.enum(["after_quiz", "after_first_result", "after_quota"]).default("after_first_result"),
    })
    .refine((f) => f.anonymousFreeUses <= f.freeUses, {
      message: "anonymousFreeUses can't exceed freeUses (they count toward them after signup)",
      path: ["anonymousFreeUses"],
    })
    .refine((f) => f.anonymousFreeUses === 0 || f.anonymousEntry !== null, {
      message: "anonymousFreeUses needs anonymousEntry: the public screen where the visitor gets the first result",
      path: ["anonymousEntry"],
    })
    .default({
      coreAction: "core",
      freeUses: 1,
      anonymousFreeUses: 0,
      anonymousPerIpPerDay: 20,
      anonymousEntry: null,
      paywallPlacement: "after_first_result",
    }),
  // /admin unit economics (sell engine Module 6, D-038). paymentFeePercent: the provider's fee on a
  // typical method; adTaxPercent: tax on top of ad spend (Meta charges 11% in Indonesia);
  // targetCacFactor: target CAC = breakeven CAC × this; benchmarks: the minimum conversion from the
  // previous funnel step (0–1), below which /admin flags the step red.
  economics: z
    .object({
      paymentFeePercent: z.number().min(0).max(20).default(2),
      adTaxPercent: z.number().min(0).max(50).default(11),
      targetCacFactor: z.number().min(0.1).max(1).default(0.9),
      benchmarks: z
        .partialRecord(
          z.enum([
            "cta_tap",
            "quiz_start",
            "quiz_complete",
            "first_result",
            "paywall_view",
            "checkout_start",
            "purchase",
          ]),
          z.number().min(0).max(1),
        )
        .default({
          cta_tap: 0.25,
          quiz_start: 0.7,
          quiz_complete: 0.6,
          first_result: 0.5,
          paywall_view: 0.6,
          checkout_start: 0.15,
          purchase: 0.5,
        }),
    })
    .default({
      paymentFeePercent: 2,
      adTaxPercent: 11,
      targetCacFactor: 0.9,
      benchmarks: {
        cta_tap: 0.25,
        quiz_start: 0.7,
        quiz_complete: 0.6,
        first_result: 0.5,
        paywall_view: 0.6,
        checkout_start: 0.15,
        purchase: 0.5,
      },
    }),
  // A/B experiment (D-094): { <name>: { variants: { <arm>: <weight %> } } }, weights summing to 100.
  // At most one at a time (one test per funnel stays readable at Rp100K/day). A device's arm comes
  // from its anonId, so changing the weights or their order mid-test moves devices between arms:
  // start a new experiment name instead. An experiment named in features/quiz.ts `quizzes` picks the
  // quiz per arm; /admin's funnel splits by arm.
  experiments: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, 'a name like "quiz_length"'),
      z.object({
        variants: z
          .record(z.string().regex(/^[a-z][a-z0-9_]{0,19}$/, 'an arm like "short"'), z.int().min(1).max(99))
          .refine((v) => Object.keys(v).length >= 2, { message: "an experiment needs at least 2 variants" })
          .refine((v) => Object.values(v).reduce((a, b) => a + b, 0) === 100, {
            message: "variant weights must sum to 100",
          }),
      }),
    )
    .refine((e) => Object.keys(e).length <= 1, { message: "run at most one experiment at a time" })
    .default({}),
  // AI provider for the product's model calls (D-045, D-083, D-084). null = the product makes none.
  // Keys are Worker secrets (OPENAI_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY), never here. The
  // caps bound cost: perUserPerDay per account or device per 24 h (all features together),
  // anonymousPerDay for all visitors without an account together. One feature's own cap goes on its
  // route: requireAiBudgetFor (D-050). Re-check the provider's models and prices before changing one.
  // - "openai": model = an OpenAI model id with a price in @factory/core/ai; tier "fast" = Fast mode
  //   (twice the price, roughly half the latency).
  // - "openrouter" (D-083): model = an OpenRouter slug ("google/gemini-3.8-flash"); fallbackModels
  //   are tried in order when it fails; routing = OpenRouter provider preferences (zdr unset = on
  //   when legal.sensitiveDataConsent). Cost comes from OpenRouter's response; `prices` (USD per 1M
  //   tokens per slug) is only used when a response carries none.
  // - "gemini" (D-084): model = a Gemini API model id ("gemini-3.8-flash"); thinking = the
  //   documented thinking_level (unset = the model's default); mediaResolution = image detail.
  ai: aiSchema.nullable().default(null),
  // Installable web app (D-080): `pnpm theme` writes the manifest, the head tags and every icon
  // size from one source icon. promptAfter: when the app offers "Pasang di HP": on the payment
  // success screen, under the first result (UpgradePrompt), or never (Akun still has the link).
  pwa: z
    .object({
      enabled: z.boolean().default(true),
      /** Source icon, relative to apps/app: a square PNG of at least 512 px (1024 is best). */
      icon: z
        .string()
        .regex(/^[\w-]+(\/[\w-]+)*\.png$/, "a PNG path relative to apps/app, like assets/icon.png")
        .default("assets/icon.png"),
      /**
       * Optional full-bleed source for Android's maskable icon (logo inside the centre 80%). Unset:
       * made from `icon`, scaled to 80% on its own corner colour (or the background colour).
       */
      maskableIcon: z
        .string()
        .regex(/^[\w-]+(\/[\w-]+)*\.png$/, "a PNG path relative to apps/app")
        .nullable()
        .default(null),
      /** The name under the home-screen icon (about 12 characters show). Unset = product name. */
      shortName: z.string().min(1).max(30).nullable().default(null),
      promptAfter: z.enum(["payment", "first_result", "never"]).default("never"),
    })
    .default({ enabled: true, icon: "assets/icon.png", maskableIcon: null, shortName: null, promptAfter: "never" }),
  // Meta Pixel ID (public: browsers carry it). Unset = no Pixel, no Conversions API, no marketing
  // consent banner. The CAPI access token is a Worker secret (META_CAPI_TOKEN), never here. D-034.
  marketing: z
    .object({
      metaPixelId: z
        .string()
        .regex(/^\d{10,20}$/, "a Meta Pixel ID (digits)")
        .nullable()
        .default(null),
    })
    .default({ metaPixelId: null }),
});

export type ProductConfigInput = z.input<typeof productSchema>;
export type ProductConfig = Omit<z.output<typeof productSchema>, "ai"> & { ai: AiConfig | null };
export type Plan = ProductConfig["plans"][number];

/** Validates product.config.ts at load time, so a bad config fails the build. */
export function defineProduct(config: ProductConfigInput): ProductConfig {
  const result = productSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid product.config.ts:\n${z.prettifyError(result.error)}`);
  }
  const c = result.data;
  return { ...c, ai: c.ai ? resolveAi(c.ai, c.legal) : null };
}
