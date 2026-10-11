#!/usr/bin/env bash
# One-time GitHub setup for fully automated delivery (docs/DECISIONS.md D-007).
# Safe to re-run: it updates the existing "main" ruleset instead of adding a second one.
#
# Usage: scripts/setup-github.sh <owner/repo> <production-url> [<site-url>]
#   e.g. scripts/setup-github.sh erdiprtm/factory-template https://factory-template.<sub>.workers.dev https://factory-template-site.<sub>.workers.dev
set -euo pipefail

repo="${1:?usage: setup-github.sh <owner/repo> <production-url>}"
prod_url="${2:?usage: setup-github.sh <owner/repo> <production-url> [<site-url>]}"
site_url="${3:-}"

echo "• Merge settings: squash only, auto-merge on, delete head branches after merge"
gh repo edit "$repo" \
  --enable-auto-merge \
  --delete-branch-on-merge \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false

echo "• Actions variable PRODUCTION_URL=$prod_url"
gh variable set PRODUCTION_URL --repo "$repo" --body "$prod_url"
if [ -n "$site_url" ]; then
  echo "• Actions variable SITE_URL=$site_url"
  gh variable set SITE_URL --repo "$repo" --body "$site_url"
fi

# main: no deletion, no force push, changes only through PRs, and the PR checks
# `verify` + `preview` must pass. No bypass actors, not even admins.
ruleset=$(cat <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "verify" }, { "context": "preview" }]
      }
    }
  ]
}
JSON
)

existing=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "main") | .id' | head -n 1)
if [ -n "$existing" ]; then
  method=PUT; path="repos/$repo/rulesets/$existing"
else
  method=POST; path="repos/$repo/rulesets"
fi
echo "• Ruleset \"main\" ($method)"
if ! printf '%s' "$ruleset" | gh api -X "$method" "$path" --input - >/dev/null; then
  cat >&2 <<'MSG'
Could not create the ruleset. On GitHub Free, rulesets (and with them auto-merge gating)
only work on public repositories. Options: make the repo public, or upgrade the owner to
GitHub Pro (free for students via the GitHub Student Developer Pack). See docs/SETUP_HUMAN.md.
MSG
  exit 1
fi

echo "Done. Agent PRs now merge themselves with: gh pr merge <n> --auto --squash"
