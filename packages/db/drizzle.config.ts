import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only. They are applied by wrangler (`d1 migrations apply`):
// locally by `pnpm db:migrate:local`, remotely only by CI.
export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/core/auth-schema.ts", "./src/core/schema.ts", "./src/features/*.ts"],
  out: "./migrations",
  // Timestamp prefixes keep template and product migrations from colliding after a template sync.
  migrations: { prefix: "timestamp" },
  strict: true,
});
