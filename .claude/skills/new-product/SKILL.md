---
name: new-product
description: Create a new product repo from this factory template, from a spec in specs/. Use when the human wants to start a new product.
argument-hint: <specs/slug.md> <slug>
disable-model-invocation: true
---

# /new-product

Create a product repo from `$ARGUMENTS` (spec path and slug).

1. **Spec first.** Run `node scripts/spec-check.mjs <spec>`. If it fails, stop and ask the human to fill the missing sections (in Bahasa Indonesia, quoting `docs/SPEC_TEMPLATE.md`). Never invent product decisions.
2. **Inputs.**
   - GitHub owner: `gh api user --jq .login`.
   - Workers subdomain: the template's `PRODUCTION_URL` (`gh variable get PRODUCTION_URL`), e.g. `erdiprtm` from `https://x.erdiprtm.workers.dev`.
   - Visibility: private needs GitHub Pro for the `main` ruleset (D-007). Otherwise pass `--public`. Ask the human if unsure.
3. **Template repo flag.** `gh repo view --json isTemplate`. If it's false, ask the human to approve `gh repo edit --template`.
4. **Dry run.** `node scripts/new-product.mjs --spec <spec> --slug <slug> --owner <owner> --subdomain <sub>`. Show the plan to the human.
5. **Create.** Run the same command with `--execute`, plus `CLOUDFLARE_ACCOUNT_ID=<id from wrangler whoami>` in the environment.
6. **Shared secrets** (D-066): in the new repo folder, `pnpm setup-secrets --dry-run`, then `pnpm setup-secrets`. It sets the names in `factory.secrets.json` from the human's `~/.config/factory/.env.shared`, never printing a value; it asks the human for permission. Never read that file.
   - If it reports a missing prerequisite (gh login, no `.env.shared`) or a missing name, tell the human (in Bahasa Indonesia) the exact fix it printed and point to `docs/SECRETS.md`. Values are typed into that file or the terminal, never into chat.
   - Fallback without `.env.shared`: the human runs `gh secret set CLOUDFLARE_API_TOKEN --repo <owner>/<slug>`. It must be an **API Token** (dash.cloudflare.com/profile/api-tokens, template "Edit Cloudflare Workers" + Account D1 Edit, Zone Resources "All zones"), **never the Global API Key**: CI sends it as a Bearer token, and Cloudflare answers a Global API Key there with `Rate limited [code: 10429]`, not an auth error (D-029).
7. **In this template repo,** commit the `factory.json` change on a branch and open a PR (normal auto-merge flow).
8. **Continue in the new repo** with `/build-from-spec specs/<slug>.md`.

Never delete anything. Removing a product (repo, Workers, D1) is a human step; see `docs/OPERATIONS.md`.
