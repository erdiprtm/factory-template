# Planted-violation fixture (not app code)

A fake lander-style page with four planted failures. Running the rubric on it must flag all four. Line numbers below refer to the fenced snippet (line 1 = `<section`).

```astro
<section class="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-8">
  <h1 class="text-3xl font-extrabold">Untuk kamu yang sibuk, dapatkan rencana harian yang jelas dalam 2 menit</h1>
  <p class="text-lg text-muted-foreground">Jawab beberapa pertanyaan singkat.</p>
  <div class="flex gap-3">
    <a href="/quiz" class="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">Mulai kuis 2 menit</a>
    <a href="/harga/" class="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">Lihat harga</a>
  </div>
</section>
<section class="mx-auto max-w-2xl px-5 py-10">
  <ul class="flex flex-col gap-3">
    <li class="flex gap-3"><span aria-hidden="true">🥗</span> Rencana makan harian</li>
    <li class="flex gap-3"><span aria-hidden="true">📋</span> Daftar belanja otomatis</li>
  </ul>
  <div class="mt-6 h-24 w-24 animate-bounce rounded-full bg-accent"></div>
</section>
<section class="mx-auto max-w-2xl px-5 py-10">
  <h2 class="text-2xl font-bold">Siap mencoba?</h2>
  <a href="/quiz" class="mt-6 flex min-h-14 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">Daftar sekarang</a>
</section>
```

## Expected findings

| # | Line | Finding | Sev | Fix |
|---|---|---|---|---|
| A2 | 11, 12 | Emoji (🥗, 📋) used as list icons | C | Use the product's icon set, or plain text |
| B2 / G3 | 5, 6 | Two filled `bg-primary` buttons in the hero viewport | C | Keep "Mulai kuis 2 menit" filled; "Lihat harga" becomes an outline button or a text link |
| A7 / C3 | 14 | `animate-bounce` on a decorative circle: a loop that isn't status or loading (also fails C4, no reduced-motion handling) | C | Remove it |
| G4 | 5, 18 | Hero CTA "Mulai kuis 2 menit" ≠ final CTA "Daftar sekarang" | C | Final CTA uses "Mulai kuis 2 menit" |

Also expected (not planted, but true): G5 FAIL at line 5 (the hero CTA sits in a `flex` row, so it isn't full width on mobile), G2 minor (no "how it works", no pricing). A reviewer that reports these too is right.

## Result when this rubric was run on the fixture (2026-10-15)

All four planted failures flagged: A2 (lines 11–12), B2/G3 (5–6), A7/C3/C4 (14), G4 (5 vs 18). Plus G5 (5) and G2 (minor). See `clean-page.md` for the fixed version, which passes.
