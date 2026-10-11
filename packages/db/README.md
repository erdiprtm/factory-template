# @factory/db

Drizzle schema and SQL migrations for Cloudflare D1. Template-owned, except `src/features/`.

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `pnpm db:generate` | Diff the schema and write a new SQL migration to `packages/db/migrations/` |
| `pnpm db:migrate:local` | Apply pending migrations to the local D1 used by `pnpm dev` |
| `pnpm db:seed:local` | Load `seed/dev.sql` into the local D1 |

Remote databases (`factory-template-prod`, `factory-template-preview`) are migrated **only by CI**: the PR workflow migrates preview, and `deploy.yml` migrates production after taking a Time Travel bookmark.

## Rules

- **Expand/contract only** (`scripts/check-migrations.mjs`, D-010). Add tables, nullable columns, or columns with a `DEFAULT`. Dropping or renaming happens later, in a migration-only PR marked `-- migration: contract`.
- **Never edit a merged migration.** Add a new one.
- Rename the generated file to say what it does, keeping the timestamp prefix (e.g. `20261011041937_core_tables.sql`), and update its `tag` in `migrations/meta/_journal.json`.
- Keep SQL portable to Postgres. No SQLite-only types or functions. Amounts are integer IDR; timestamps are UTC epoch ms (`timestamp_ms`).
- Code reachable from the API's `AppType` must import D1 types explicitly, not via Worker globals (D-013).

## Adding product tables (product repos)

1. Create `src/features/<feature>.ts` with `sqliteTable(...)` definitions. Prefix table names with the feature, e.g. `notes_entries`.
2. Export it from `src/features/index.ts`: `export * from "./<feature>";`
3. Reference users by `user_id` text (indexed). Reference core tables only by id; never alter core tables.
4. Run `pnpm db:generate`, review the SQL, rename the file, then run `pnpm db:migrate:local` and add tests.

Migration files use **timestamp** prefixes, so template migrations pulled in by `/sync-template` and product migrations don't collide on file names. After a sync that brings new template migrations, run `pnpm db:generate` once before adding new product changes, so Drizzle's snapshot includes both.
