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

const colorScale = z.record(z.string(), z.string());

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
  }),
  admin: z.object({ emails: z.array(z.email()) }),
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
