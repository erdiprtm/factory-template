---
name: ad-hooks
description: Generate 10 ad hooks for a product with the formula "Untuk [siapa] yang [masalah], dapatkan [hasil] dalam [waktu]", across five hook types, checked against Meta Advertising Standards and the product guardrails. (Named ad-hooks because /hooks is Claude Code's built-in hook settings.)
argument-hint: <specs/slug.md or a one-line product description>
disable-model-invocation: true
---

# /ad-hooks

Product: $ARGUMENTS (read the spec if it's a path: target user, problem, core loop, "aha").

## Formula

**"Untuk [siapa] yang [masalah], dapatkan [hasil] dalam [waktu]"**

- **siapa**: a person the viewer recognizes as themself (role, situation), not "semua orang".
- **masalah**: in the user's own words, from the spec.
- **hasil**: what the product **actually** does in the first session (the "aha"), never more.
- **waktu**: true for that first result (e.g. "2 menit" for a quiz plus plan), never a body-change timeline.

## Write 10 hooks, two per type

1. **Skeptic flip**: name the doubt, then flip it. ("Kirain ribet. Ternyata …")
2. **Before → after**: the situation, not the body. ("Dari bingung mulai dari mana → punya rencana 5 menit sehari")
3. **Name the pain**: the exact moment it hurts. ("Jam 9 malam, tugas belum mulai …")
4. **Teach one thing**: one useful tip, with the product as the next step.
5. **A push**: a direct invitation with a low-risk next step ("Coba kuis 2 menit, gratis").

At least 5 of the 10 use the formula word for word. The others may reorder it but keep all four parts.

## Check every hook (drop or rewrite any that fail)

- Meta Advertising Standards and `CLAUDE.md` ad guardrails:
  - no before/after body images or wording;
  - no weight-loss claims or timelines;
  - no medical or health claims;
  - no body shaming, and no "kamu gendut/jelek/malas";
  - no personal attributes asserted about the viewer ("Kamu penderita diabetes?" is not allowed; "Untuk yang ingin pola makan lebih teratur" is fine).
- It promises only what the product does in its first session.
- Under 125 characters for the primary text's first line, plain Bahasa Indonesia.

## Output

A table: #, type, hook, the lander `hook` it maps to (the lander must repeat it **word for word**, D-035), and a one-line note on why it passes the checks. Then recommend the 3 to test first with `/ad-test-plan`, and offer to create a lander file for each (`apps/site/src/content/landers/<slug>.md`).
