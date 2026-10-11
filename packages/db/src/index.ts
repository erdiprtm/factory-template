import * as core from "./core/schema";
import * as features from "./features";

export * from "./core/schema";
export * from "./features";

/** Full schema (core + product features) for drizzle(). */
export const schema = { ...core, ...features };
