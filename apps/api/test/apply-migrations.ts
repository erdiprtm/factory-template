import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Storage is isolated per test file; this applies only migrations not yet applied.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
