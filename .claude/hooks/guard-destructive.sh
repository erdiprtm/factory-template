#!/bin/sh
# PreToolUse guard for Bash. Blocks destructive commands even when they are
# phrased in ways the permission deny rules in .claude/settings.json miss
# (e.g. `git -C . push --force`, `sh -c '...'`, `pnpm -C apps/api exec wrangler deploy`).
# Exit 2 blocks the call and shows stderr to the agent.

command -v jq >/dev/null 2>&1 || {
  echo "guard-destructive: jq is required (brew install jq)" >&2
  exit 2
}

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Normalize: drop quotes and backslashes, collapse all whitespace (incl. newlines) to single spaces.
norm=$(printf '%s' "$cmd" | tr -d "\"'\\\\" | tr -s '[:space:]' ' ')

block() {
  echo "Blocked by .claude/hooks/guard-destructive.sh: $1." >&2
  echo "Destructive or production actions run only through CI or by the human (see CLAUDE.md)." >&2
  exit 2
}
has() { printf '%s' "$norm" | grep -Eq -- "$1"; }

T='[^ ;&|]+'                              # one argument token, never crossing a shell separator
G="git( -$T( [^- ;&|][^ ;&|]*)?)*"       # git plus global options such as -C <dir> or -c <k=v>
W="wrangler( $T)*"                        # wrangler plus anything before the subcommand

# git: force push, deleting or pushing straight to main, rewriting history
has "$G push( $T)* (--force[^ ;&|]*|-[a-z]*f[a-z]*|\+$T)( |$)" && block "force push"
has "$G push( $T)* (--delete main|:main)( |$)" && block "deleting main"
has "$G push( -$T)* [^- ;&|][^ ;&|]* (HEAD:)?(refs/heads/)?main( |$)" && block "pushing directly to main (open a PR instead)"
has "$G (rebase|filter-branch|filter-repo)( |$)" && block "rewriting git history"

# GitHub CLI: deleting/hiding repos, raw DELETE calls, bypassing checks, leaking tokens
has 'gh repo (delete|archive|rename)( |$)' && block "deleting, archiving or renaming a repo"
has 'gh repo edit .*--visibility' && block "changing repo visibility"
has 'gh api .*(-X ?DELETE|--method[ =]DELETE)' && block "DELETE through the GitHub API"
has 'gh pr merge .*--admin' && block "merging with --admin (bypasses required checks)"
has 'gh auth (token|logout)( |$)' && block "printing or removing the GitHub token"
has 'gh auth status .*(--show-token|-t( |$))' && block "printing the GitHub token"
has 'gh (secret|variable) delete( |$)' && block "deleting GitHub secrets or variables"
has 'gh workflow disable( |$)' && block "disabling a CI workflow"

# Cloudflare: production deploys from a laptop, deleting resources, remote D1 writes
has "$W (versions )?deploy( |$)" && block "deploying from a laptop (production deploys run in CI)"
has "pnpm( $T)* (run )?deploy( |$)" && block "running a deploy script from a laptop"
has "$W delete( |$)" && block "deleting a Cloudflare resource"
has "$W d1 (execute|migrations apply)( $T)* --remote( |$)" && block "running SQL or migrations against a remote D1 database"
has "$W d1 time-travel restore( |$)" && block "restoring a D1 database (human only, see docs/OPERATIONS.md)"

# Wiping home or root
has '(^|[ ;&|(])rm -[a-zA-Z]*[rR][a-zA-Z]* (/|/\*|~/?|\$HOME/?)( |$)' && block "recursive delete of / or home"

# Local secret files (the .example templates are fine)
if printf '%s' "$norm" | sed 's/\.dev\.vars\.example//g; s/\.env\.example//g' | grep -Eq '\.dev\.vars|(^|[ /])\.env(\.[a-z]+)?( |$)'; then
  block "touching a local secrets file (.dev.vars / .env)"
fi

exit 0
