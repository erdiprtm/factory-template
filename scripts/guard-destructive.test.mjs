import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tests .claude/hooks/guard-destructive.sh (docs/DECISIONS.md D-006).
const HOOK = join(import.meta.dirname, "..", ".claude", "hooks", "guard-destructive.sh");
const run = (command) =>
  spawnSync("sh", [HOOK], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }) }).status;

const blocked = [
  "git push --force",
  "git push -f origin feat/x",
  "git push origin feat/x --force-with-lease",
  "git push -uf origin feat/x",
  "git push origin +main",
  "git -C . push --force origin main",
  "git -c push.default=current push -f",
  "cd apps && git push origin --force",
  "git push origin main",
  "git push -u origin main",
  "git push origin HEAD:main",
  "git push origin --delete main",
  "git push origin :main",
  "git rebase -i HEAD~3",
  "git -C . rebase main",
  "git filter-repo --path x",
  "gh repo delete erdiprtm/x --yes",
  "gh repo edit --visibility public",
  "gh api -X DELETE repos/a/b",
  "gh api repos/a/b --method DELETE",
  "gh pr merge 3 --squash --admin",
  "gh auth token",
  "gh auth status --show-token",
  "gh secret delete CLOUDFLARE_API_TOKEN",
  "gh workflow disable pr.yml",
  "npx wrangler deploy",
  "pnpm -C apps/api exec wrangler deploy --env preview",
  "pnpm --filter api exec wrangler versions deploy",
  "wrangler delete",
  "pnpm exec wrangler d1 delete factory-prod",
  "pnpm exec wrangler r2 bucket delete media",
  'pnpm exec wrangler d1 execute DB --remote --command "DROP TABLE x"',
  "pnpm exec wrangler d1 migrations apply DB --remote",
  "pnpm exec wrangler d1 time-travel restore DB --bookmark=abc",
  "sh -c 'wrangler deploy'",
  "pnpm run deploy",
  "rm -rf ~",
  "rm -rf /",
  "cat .dev.vars",
  "cat apps/api/.dev.vars",
  "cp .env .env.bak",
];

const allowed = [
  "git status",
  "git push -u origin feat/auth",
  "git push origin feat/main-menu",
  "git push --follow-tags origin feat/x",
  'git commit -m "fix: handle push -f edge case"',
  "git pull --rebase origin main",
  "git merge origin/main",
  "gh pr create --fill",
  "gh pr merge 3 --auto --squash --delete-branch",
  "gh auth status",
  "gh api repos/a/b/pulls",
  "pnpm exec wrangler deployments status --json",
  "pnpm exec wrangler versions list --json",
  "pnpm exec wrangler d1 migrations apply DB --local",
  'pnpm exec wrangler d1 execute DB --local --command "SELECT 1"',
  "pnpm exec wrangler dev",
  "pnpm exec wrangler d1 time-travel info DB --json",
  "pnpm verify",
  "pnpm build",
  "rm -rf node_modules",
  "cat .dev.vars.example",
  "ls -la ~/.env-tools",
];

describe("guard-destructive hook", () => {
  it.each(blocked)("blocks: %s", (cmd) => expect(run(cmd)).toBe(2));
  it.each(allowed)("allows: %s", (cmd) => expect(run(cmd)).toBe(0));
});
