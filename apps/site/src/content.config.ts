import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Legal templates (privasi, syarat). Template-owned structure; text reviewed per product.
const legal = defineCollection({
  loader: glob({ base: "./src/content/legal", pattern: "*.md" }),
  schema: z.object({ title: z.string(), description: z.string(), version: z.string() }),
});

// SEO content pages (PRODUCT-OWNED): file name = URL, e.g. kolesterol.md → /kolesterol/.
const seo = defineCollection({
  loader: glob({ base: "./src/content/seo", pattern: "*.md" }),
  schema: z.object({
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(170),
    updated: z.string(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

// Ad landers (PRODUCT-OWNED content, sell engine Module 3, D-035): one file per campaign,
// file name = URL, e.g. promo-kolesterol.md → /l/promo-kolesterol/. No code needed.
// `hook` is the ad's hook, word for word: it is the page's headline (ad → lander "scent").
const quote = z.object({ kind: z.literal("quote"), text: z.string().min(10).max(280), who: z.string().min(2).max(80) });
const stats = z.object({
  kind: z.literal("stats"),
  items: z
    .array(z.object({ value: z.string().min(1).max(16), label: z.string().min(2).max(60) }))
    .min(1)
    .max(3),
});
const landers = defineCollection({
  loader: glob({ base: "./src/content/landers", pattern: "*.md" }),
  schema: ({ image }) =>
    z.object({
      // Up to 160 characters: some formula hooks run long ("Untuk [siapa] yang [masalah], …").
      hook: z.string().min(10).max(160),
      sub: z.string().min(20).max(300),
      cta: z.string().min(2).max(40),
      /** Browser tab and share text; landers are noindex, so this isn't for search. */
      description: z.string().min(50).max(170),
      /** The utm_campaign the ads use, so /admin can join spend to this lander. */
      campaign: z.string().max(200).optional(),
      proof: z
        .discriminatedUnion("kind", [
          quote,
          stats,
          z.object({ kind: z.literal("image"), src: image(), alt: z.string().min(5).max(200) }),
        ])
        .optional(),
    }),
});

export const collections = { legal, seo, landers };
