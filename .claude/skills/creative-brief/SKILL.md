---
name: creative-brief
description: Write one 9:16 video ad brief anyone can shoot on a phone (product, who/where, scenes S1–S4 with timings, CTA, rules) for one hook, with a safe-zone reminder.
argument-hint: <the hook, word for word> [specs/slug.md]
disable-model-invocation: true
---

# /creative-brief

Hook: $ARGUMENTS

One page, in Bahasa Indonesia, that a friend with a phone can shoot in one afternoon without asking questions. Read the spec if given (target user, "aha", what the product does).

## Brief format

**Produk:** name, one line on what it does.
**Hook (wajib persis):** the hook, word for word. It's the first words on screen and the lander's headline.
**Format:** 9:16 vertical, 15–25 seconds, 1080×1920, captions burned in (most people watch muted).
**Siapa & di mana:** who is on camera (matching the target user) and the setting (kamar kos, dapur, kantor, motor parkir…). Natural light, no studio.

| Scene | Time | On screen | Voice / caption |
|---|---|---|---|
| S1 Hook | 0–3 s | … | the hook, word for word |
| S2 Masalah | 3–8 s | the moment it hurts | … |
| S3 Produk | 8–18 s | the real app screens: quiz → "Rencana kamu siap" → first result | … |
| S4 CTA | 18–25 s | the phone with the lander, or a person pointing | one clear CTA |

**CTA:** one action, the same words as the lander button (e.g. "Mulai kuis 2 menit"). The ad's link is the lander with `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.

**Aturan:**
- Show real app screens only; no fake features or results.
- Meta Advertising Standards and `CLAUDE.md`: no before/after bodies, no weight-loss or medical claims, no body shaming, no personal attributes about the viewer.
- Health-adjacent products say "bukan pengganti tenaga profesional" on screen in S3 or S4.
- No copyrighted music: use the free sound library in Meta or CapCut.
- Faces and voices only from people who agreed in writing.

**Safe zone (9:16):** keep text and faces out of the top ~14% (account name and "Sponsored") and the bottom ~35% (caption, CTA button, icons), and ~6% from each side. Put the hook text in the middle third.

**Deliverables:** the edited video, plus 2 alternate S1 openings with the same hook, for testing.
