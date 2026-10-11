---
name: sync-template
description: Pull factory template updates into this product repo and resolve conflicts following the ownership rule. Use in product repos.
disable-model-invocation: true
---

# /sync-template

Follow `docs/TEMPLATE_SYNC.md`.

1. `git remote get-url template`. If it's missing, run `git remote add template https://github.com/<owner>/factory-template.git`.
2. `git fetch template`, then `git switch -c chore/sync-template-$(date +%Y%m%d) origin/main`.
3. `git merge template/main --no-ff`. **Never rebase or force-push.**
4. Resolve conflicts with the ownership rule:
   - **Template wins:** `core/` folders, `packages/*` (except `packages/db/src/features/`), `scripts/`, `.github/`, `.claude/`, `CLAUDE.md` sections other than the product header.
   - **Product wins:** `features/` folders, `product.config.ts` (keep product values; take new *fields* the template added, with their defaults), `specs/`, site content (`apps/site/src/content/seo/`, landing copy), `factory.json`.
   - **Migrations:** keep both sides' files (timestamped names never collide). Then run `pnpm db:generate`. It should report no changes; if it doesn't, a schema drifted, so stop and report.
   - **`pnpm-lock.yaml`:** take the template's version, then run `pnpm install` to regenerate.
5. `pnpm theme`, then `pnpm verify`. Fix product code that broke because of a template API change (product-owned folders only).
6. Open a PR (`gh pr create --fill`, then `gh pr merge --auto --squash`). In the PR body, list the template commits pulled and any product changes they required.
