// Loaded only by the Better Auth CLI (`pnpm --filter @factory/api auth:schema`) to generate
// packages/db/src/core/auth-schema.ts. Constructing auth does no I/O, so a stub DB is fine.
import { getAuth } from "./auth";

export const auth = getAuth({ APP_ENV: "development", AUTH_HOSTS: "localhost:8787", DB: {} as never });
