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
  brand: z.object({
    tokens: z
      .object({
        colors: z.object({ light: colorScale, dark: colorScale }),
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
  }),
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
  payments: z.object({
    provider: z.enum(["duitku", "doku"]),
    methods: z.array(z.string().min(1)).nonempty(),
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
  // AI provider for the product's model calls (D-045). null = the product makes none. The key is a
  // Worker secret (OPENAI_API_KEY), never here. model: an OpenAI model id with a known price in
  // @factory/core/ai (re-check the pricing page before changing it). tier "fast" = OpenAI Fast mode
  // (twice the price, roughly half the latency). The caps bound cost: perUserPerDay per account or
  // device per 24 h (all features together), anonymousPerDay for all visitors without an account
  // together. One feature's own cap goes on its route: requireAiBudgetFor (D-050).
  ai: z
    .object({
      provider: z.literal("openai"),
      model: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,60}$/),
      tier: z.enum(["default", "fast"]).default("default"),
      perUserPerDay: z.int().min(1).max(1000).default(20),
      anonymousPerDay: z.int().min(0).max(100000).default(300),
    })
    .nullable()
    .default(null),
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
export type ProductConfig = z.output<typeof productSchema>;
export type Plan = ProductConfig["plans"][number];

/** Validates product.config.ts at load time, so a bad config fails the build. */
export function defineProduct(config: ProductConfigInput): ProductConfig {
  const result = productSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid product.config.ts:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
