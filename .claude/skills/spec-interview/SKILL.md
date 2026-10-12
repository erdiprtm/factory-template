---
name: spec-interview
description: Interview the human one question at a time to turn a product idea into a complete one-page spec (docs/SPEC_TEMPLATE.md format), pushing back when the scope is more than one core loop. Use before /new-product.
argument-hint: <product idea in a sentence, optional>
disable-model-invocation: true
---

# /spec-interview

Idea so far: $ARGUMENTS

Goal: a spec in `specs/<slug>.md` that passes `node scripts/spec-check.mjs` and that the sell engine can run (lander → quiz → first result → paywall → renewal). Talk in Bahasa Indonesia, plain and friendly.

## Rules

- **One question per message.** Wait for the answer. Never send a list of questions.
- Give a short example answer with each question, so the human can react instead of starting from a blank page.
- After each answer, restate it in one line ("Jadi: …") and only then ask the next question.
- **Push back on scope.** A v1 has **one core loop**: one thing the user does again and again. If an answer adds a second loop (a marketplace *and* a tracker, a community *and* a course), say so plainly, name the two loops, and ask which one ships first. Everything else goes to "Out of scope for v1".
- Push back on vague answers. "Semua orang" is not a target user. "Membantu" is not a result. Ask for a concrete person, a concrete moment and a concrete number.
- Apply the product guardrails in `CLAUDE.md`: general guidance only, no diagnosis, curated data for any health or nutrition number, never shaming.

## Questions, in this order

1. **Siapa** persisnya penggunanya? (usia/peran, situasi, di mana mereka sekarang)
2. **Masalah**: apa yang menyakitkan, kapan terasa, dan bagaimana mereka mengatasinya hari ini?
3. **Core loop**: apa satu hal yang pengguna lakukan berulang-ulang di produk ini? (satu kalimat, kata kerja)
4. **30 detik pertama**: apa yang dilihat dan dilakukan pengguna sejak membuka link iklan? (lander → kuis → hasil)
5. **"Aha"**: hasil nyata pertama yang membuat mereka bilang "oh, ini berguna". Harus terjadi sebelum paywall.
6. **Kembali besok**: kenapa mereka kembali besok? (pengingat, progres, data baru…)
7. **Yang dibayar**: apa yang dibuka dengan berlangganan, dan berapa pemakaian gratis sebelum paywall? Usulkan harga 6 dan 12 bulan (bilangan bulat IDR, minimal Rp10.000), lalu tunjukkan per minggunya.
8. **Kill criteria**: angka terukur dan tanggal, misalnya "< 20 pelanggan berbayar di hari ke-60" atau "CAC > 2× target selama 14 hari".

Then fill the rest yourself and confirm in one message: data the product stores (flag sensitive data), content and data sources, the 5–8 quiz questions, paywall placement, the first 3 ad hooks (see `/ad-hooks`), and open questions.

## Output

1. Write `specs/<slug>.md` in the exact format of `docs/SPEC_TEMPLATE.md`, including the **Core loop & funnel** section. Max 3 core features, one page.
2. Run `node scripts/spec-check.mjs specs/<slug>.md` and fix anything it reports.
3. Show the human the spec and the slug. Suggest `/new-product specs/<slug>.md <slug>` as the next step. Don't run it without a yes.
