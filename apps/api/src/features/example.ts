import { Hono } from "hono";
import { requireAccessOrFreeUse } from "../core/access";
import type { SessionVariables } from "../core/session";
import { sessionMiddleware } from "../core/session";
import type { Bindings } from "../index";

// PRODUCT-OWNED example of the core action: free uses first (product.config.ts funnel.freeUses),
// then paid access (requireAccessOrFreeUse, D-037). Pure reads of saved results use
// requireAccess or no gate; only the action that produces a new result spends a free use.
// Delete this file and its mount in src/index.ts when building a real product.
export const exampleFeature = new Hono<{ Bindings: Bindings; Variables: SessionVariables }>()
  .use("*", sessionMiddleware)
  .post("/run", requireAccessOrFreeUse, (c) =>
    c.json({ message: "Konten berbayar contoh" as const, freeUsesLeft: c.res.headers.get("x-free-uses-left") }),
  );
