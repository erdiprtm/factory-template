# Shared secrets (`pnpm setup-secrets`)

Every product repo needs the same few GitHub Actions secrets before CI can deploy it. Instead of pasting them into each new repo, keep them once on your machine and run one command per repo (D-066):

```sh
pnpm setup-secrets --dry-run   # which names would be set, which are missing; changes nothing
pnpm setup-secrets             # sets them on the current repo (the clone you're in)
```

## How it works

- **Values** come from `~/.config/factory/.env.shared` on your machine, and only from there. The script refuses a file inside the repo and never prints a value. Each value goes to `gh secret set` on stdin, so it never appears in the process list or in logs.
- **Names** come from `factory.secrets.json`, committed in the repo. Only those names are set, whatever else `.env.shared` holds. Today the list is `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The file is template-owned: products don't change it (`docs/TEMPLATE_SYNC.md`).
- **Target** is the current repo (`gh repo view`), unless you pass `--repo`.

| Flag | Effect |
|---|---|
| `--repo owner/name` | Target another repo. Names still come from this checkout's `factory.secrets.json` |
| `--dry-run` | Shows what would be set and what is missing. Changes nothing |
| `--only NAME,NAME` | Sets only these names. They must be in the allowlist; the rest are reported as skipped |

The script first checks that `gh` is installed and logged in (`gh auth status`) and that `.env.shared` exists. If something is missing, it prints the exact fix. At the end it prints **set / skipped / missing**, by name only. It exits 1 if a selected name is missing from `.env.shared` (or `gh` failed to set one), and 2 on a bad flag.

## Create `~/.config/factory/.env.shared`

Do this once, in your own terminal (never paste tokens into a chat):

```sh
mkdir -p ~/.config/factory
touch ~/.config/factory/.env.shared
chmod 600 ~/.config/factory/.env.shared   # only you can read it; the script warns otherwise
open -e ~/.config/factory/.env.shared     # macOS; or any editor
```

Contents: one `NAME=value` line per secret. `#` starts a comment; quotes are optional.

```sh
# Shared infra tokens only. See docs/SECRETS.md.
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
```

- `CLOUDFLARE_API_TOKEN`: an **API Token** from dash.cloudflare.com/profile/api-tokens (template "Edit Cloudflare Workers" + Account D1 Edit, Zone Resources "All zones"). **Never the Global API Key**: Cloudflare answers it with `Rate limited [code: 10429]` (D-029). `docs/SETUP_HUMAN.md` step 9 has the clicks.
- `CLOUDFLARE_ACCOUNT_ID`: from `pnpm exec wrangler whoami` or the dashboard's sidebar. Not secret, but CI reads it as a secret.

The file is outside every repo. `.gitignore` also ignores `.env.shared` and `*.env.shared` in case a copy ever lands in a repo by mistake.

## What belongs there, and what doesn't

**Shared:** infra tokens that are the same for every product and only let CI deploy:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

A new shared name needs a template PR that adds it to `factory.secrets.json`, with a reason in `docs/DECISIONS.md`.

**Per repo, never in `.env.shared`:**

| Secret | Why | How it's set |
|---|---|---|
| `BETTER_AUTH_SECRET_PRODUCTION` / `_PREVIEW` | Must differ per product: one leak must not open another product's sessions | `/new-product` generates random ones |
| Production payment keys (Duitku, DOKU…) | Tied to one merchant account; a mix-up charges the wrong business | `wrangler versions secret put` per product (`docs/SETUP_HUMAN.md`), production only by the human |
| Database keys and anything that reaches user data | Products' data must stay isolated | Per product, never shared |
| Per-product service keys (Resend, OpenPanel, Meta CAPI, AI providers) | Each product has its own project, quota and audit trail | Worker secrets, per product (`apps/api/.dev.vars.example`) |

Rule of thumb: if leaking it from one product would expose another product's users or money, it's per repo.

## Rotate a token

1. Create the new value. For Cloudflare: dash.cloudflare.com → My Profile → API Tokens → the token → **Roll** (or create a new one, as above).
2. Replace its line in `~/.config/factory/.env.shared`.
3. For each repo in `factory.json` (and the template itself), from this checkout:

   ```sh
   pnpm setup-secrets --repo <owner/repo> --only CLOUDFLARE_API_TOKEN
   ```

4. Check: re-run CI on any open PR, or wait for the next merge. Its `preview` job (or the deploy) must pass.
5. If you created a new token instead of rolling, delete the old one in the Cloudflare dashboard once every repo has the new value.

If a token might have leaked, roll it first, then do steps 2 to 4 at once.
