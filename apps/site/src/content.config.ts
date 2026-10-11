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

export const collections = { legal, seo };
