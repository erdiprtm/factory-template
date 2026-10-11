import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Same migrations CI applies, so tests run against the real schema in a real local D1.
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "../../packages/db/migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // APP_ENV=test: emails are captured and auth rate limits are off.
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_ENV: "test",
            AUTH_HOSTS: "localhost",
            ADMIN_EMAILS: "admin@example.com",
          },
        },
      }),
    ],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
