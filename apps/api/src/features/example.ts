import { Hono } from "hono";
import { requireAccess } from "../core/access";
import type { SessionVariables } from "../core/session";
import { sessionMiddleware } from "../core/session";
import type { Bindings } from "../index";

// PRODUCT-OWNED example of a paid feature: every route behind requireAccess.
// Delete this file and its mount in src/index.ts when building a real product.
export const exampleFeature = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>()
  .use("*", sessionMiddleware, requireAccess)
  .get("/", (c) => c.json({ message: "Konten berbayar contoh" as const }));
