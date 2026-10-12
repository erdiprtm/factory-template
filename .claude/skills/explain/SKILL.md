---
name: explain
description: Before the human accepts a big change, explain it by answering five questions: what it does in one sentence, the path from screen to database, which files changed and why, how it was proven to work, and the most likely way it fails.
argument-hint: <PR number, branch, or "the last change">
disable-model-invocation: true
---

# /explain

Change: $ARGUMENTS (a PR: `gh pr view <n>` and `gh pr diff <n>`; a branch: `git diff main...<branch>`; default: the current branch against `main`).

Read the actual diff before answering. Don't explain from memory or from the PR description alone. Answer in Bahasa Indonesia, plain words, for someone who doesn't read code. Keep each answer short.

## The five questions

1. **Apa yang dilakukan, dalam satu kalimat?** From the user's point of view, not the code's.
2. **Jalurnya dari layar ke database.** One numbered path: screen or page → the app function → API route → core function → table(s), and back. Name each piece with its file, e.g. `apps/app/src/app/quiz.tsx` → `POST /api/quiz` → `quiz_responses`.
3. **File apa saja yang berubah, dan kenapa.** Group them (app, API, core, database, tests, docs). One line per group or per important file. Flag any change to template-owned files (`core/`, `packages/*`) when this is a product repo.
4. **Bagaimana dibuktikan bekerja.** The tests that cover it (name the test files and what they check), the `pnpm verify` result, the preview URL, and anything checked by hand. Be honest about what is **not** tested.
5. **Cara gagal yang paling mungkin.** The single most likely failure in real use, how it would show up (an error, a wrong number, a silent miss), how to spot it (`/admin`, Sentry, OpenPanel, logs), and how to roll back.

End with a recommendation: accept, accept with a follow-up, or don't accept yet, and why.
