# Operations

Runbook for production incidents, rollbacks, and database recovery. Agents must not run the human-only commands below; the guard hook blocks them (D-006).

## Normal delivery

PR → `verify` + `preview` (isolated preview Worker and D1, smoke test) → auto-merge → `deploy.yml`:

1. verify
2. record the live version
3. D1 Time Travel bookmark
4. migrations
5. deploy
6. smoke test
7. on failure: auto-rollback plus an incident issue

## When an incident issue opens

The issue body states the step outcomes, the previous version, and the D1 bookmark.

| Production line in the issue | What it means | Action |
|---|---|---|
| "Rolled back to `<version>`…" | Code is back on the previous version; users are fine | Fix forward in a new PR. Don't re-run the failed deploy unchanged |
| "Nothing new went live…" | Failed before the deploy step (verify, backup, migrations) | Fix forward. If migrations ran, check the Database line |
| "**Rollback FAILED**" | Production may be broken | Human: see "Manual rollback" now |

## Manual rollback (human)

```sh
cd apps/api
pnpm exec wrangler deployments list            # find a good version id
pnpm exec wrangler rollback <version-id> --message "manual rollback: <reason>"
node ../../scripts/smoke-test.mjs https://factory-template.erdiprtm.workers.dev
```

Limits: only the last 100 versions; blocked if a bound resource was deleted or changed in between. A rollback reverts **code only**, never data.

## Rollback drill (agent or human)

Proves the rollback path (the launch-check item "rollback path verified"):

```sh
gh workflow run deploy.yml --ref main -f rollback_drill=true
```

Expected:
- `Smoke test` fails on purpose.
- `Roll back to the previous version` succeeds and logs "Live version is … (rollback target)".
- An incident issue opens. Close it as a drill.

## Database backups and restore (human only)

D1 **Time Travel** is always on, at no extra cost. Retention is 7 days on Workers Free and 30 days on Workers Paid. Every production deploy that runs migrations logs a bookmark in the run summary and in any incident issue.

Get the current bookmark:
```sh
cd apps/api && pnpm exec wrangler d1 time-travel info DB
```

Restore to a bookmark or a time:
```sh
cd apps/api && pnpm exec wrangler d1 time-travel restore DB --bookmark=<bookmark>
cd apps/api && pnpm exec wrangler d1 time-travel restore DB --timestamp=<unix-seconds or RFC3339>
```

**A restore overwrites the database in place.** Every write made after the bookmark is lost: payments, entitlements, signups. Prefer fixing forward with a new migration. Restore only for real data corruption, and only after:
1. putting the app into a safe state (roll back code that writes bad data),
2. exporting the current state first: `pnpm exec wrangler d1 export DB --remote --output=before-restore.sql`,
3. noting the restore's own returned bookmark, which can undo the restore.

Because migrations are expand/contract (D-010), a code rollback never needs a database restore.

## Long-term exports (recommended before launch)

Time Travel covers 7 to 30 days. For longer retention, a human or a scheduled job can export periodically:

```sh
cd apps/api && pnpm exec wrangler d1 export DB --remote --output=backup-$(date +%Y%m%d).sql
```

Store exports outside Cloudflare (encrypted). They contain personal data, so treat them under UU PDP.

## Deleting resources (human only)

Workers, D1 databases, R2 buckets, and GitHub repos are deleted only by a human. For example, Phase 8 cleans up its dummy product this way:

```sh
pnpm exec wrangler delete --name <worker>
pnpm exec wrangler d1 delete <database>
pnpm exec wrangler r2 bucket delete <bucket>
gh repo delete <owner>/<repo>
```

## Dependency security review (monthly, and when GitHub flags one)

- `pnpm audit --prod` lists advisories. Patch within the same major via `overrides` in `pnpm-workspace.yaml`, only with versions ≥ 14 days old (`node scripts/pick-versions.mjs <pkg>@~x.y.z`). Record each override in `docs/DECISIONS.md`.
- Triage by where the code runs. **Worker runtime** (`apps/api` bundle): fix now. **Browser bundle** (app, site): fix soon. **Build or dev tooling only** (Metro, Expo CLI, Astro build, drizzle-kit): fix when a patch is eligible.
- `pnpm verify` also runs `scripts/check-bundle-secrets.mjs`, which fails if a credential-looking value or server-side env access shows up in the app or site output.

## Secrets

- Cloudflare API token: GitHub secret `CLOUDFLARE_API_TOKEN`. If it might have leaked, open dash.cloudflare.com → My Profile → API Tokens → **Roll**, then run `gh secret set CLOUDFLARE_API_TOKEN` again.
- Worker runtime secrets (Phase 3+): `wrangler versions secret put <NAME>` (top level) and `--env preview` for preview. These are documented in `apps/api/.dev.vars.example`.
  - Use `versions secret put`, not `secret put`. It creates a new **undeployed** version carrying the secret, and the next CI upload or deploy inherits it.
  - Plain `secret put` refuses on the preview Worker, because CI only uploads versions there and never deploys. On production it would deploy from a laptop, which is against the hard rules.
  - Never follow its hint to run `wrangler versions deploy`: deploys go only through CI.
  - The secret is live once the next PR preview or `main` deploy runs. The smoke test proves it, since `/sign-in` and `/api/me` fail without `BETTER_AUTH_SECRET`.
