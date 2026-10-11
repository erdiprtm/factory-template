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
  domain: z.object({ app: hostname.nullable(), site: hostname.nullable() }),
  brand: z.object({
    tokens: z.object({
      colors: z.object({ light: colorScale, dark: colorScale }),
      radius: z.string(),
      fontFamily: z.object({ sans: z.string(), heading: z.string().optional() }),
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
  funnel: z
    .object({
      coreAction: z
        .string()
        .regex(/^[a-z][a-z0-9_]{1,30}$/)
        .default("core"),
      freeUses: z.int().min(0).max(100).default(1),
      paywallPlacement: z.enum(["after_quiz", "after_first_result", "after_quota"]).default("after_first_result"),
    })
    .default({ coreAction: "core", freeUses: 1, paywallPlacement: "after_first_result" }),
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
