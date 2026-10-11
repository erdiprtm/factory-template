import * as authTables from "./core/auth-schema";
import * as core from "./core/schema";
import * as features from "./features";

export * from "./core/auth-schema";
export * from "./core/schema";
export * from "./features";

/** Better Auth's tables, passed to its Drizzle adapter. */
export const authSchema = authTables;

/** Full schema (auth + core + product features) for drizzle(). */
export const schema = { ...authTables, ...core, ...features };
