# Clean fixture (not app code)

The page from `planted-violations.md`, fixed. Running the rubric on it must pass every applicable line.

```astro
<section class="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-8">
  <h1 class="text-3xl font-extrabold">Untuk kamu yang sibuk, dapatkan rencana harian yang jelas dalam 2 menit</h1>
  <p class="text-lg text-muted-foreground">Jawab 5 pertanyaan singkat, lalu lihat rencana harianmu. Gratis dicoba.</p>
  <a href="/quiz" class="flex min-h-14 items-center justify-center rounded-xl bg-primary px-6 text-lg font-bold text-primary-foreground">Mulai kuis 2 menit</a>
  <a href="/harga/" class="self-center py-3 text-muted-foreground underline">Lihat harga</a>
</section>
<section class="mx-auto max-w-2xl px-5 py-10">
  <h2 class="text-2xl font-bold">Cara kerjanya</h2>
  <ol class="mt-4 list-decimal pl-5">
    <li>Jawab 5 pertanyaan tentang kebiasaanmu.</li>
    <li>Lihat rencana harian yang langsung bisa dipakai.</li>
    <li>Lanjutkan kalau cocok. Bayar sekali, tanpa tagihan otomatis.</li>
  </ol>
</section>
<section class="mx-auto max-w-2xl px-5 py-10">
  <h2 class="text-2xl font-bold">Belum yakin? Kuisnya gratis dan tidak perlu kartu.</h2>
  <a href="/quiz" class="mt-6 flex min-h-14 items-center justify-center rounded-xl bg-primary px-6 text-lg font-bold text-primary-foreground">Mulai kuis 2 menit</a>
</section>
```

## Expected result

- A1–A7: PASS (no gradients, emoji, card rows, glass, nesting or loops).
- B1: PASS (tokens only). B2/G3: PASS (one filled button per viewport; "Lihat harga" is a text link, ≥ 44 px tall with `py-3`). B3: PASS with the template tokens (`muted-foreground` on `background` is 7.6:1 light, 7.3:1 dark).
- C1–C4: N/A (no motion).
- D1: PASS. D2–D3, E1–E4: N/A (static page, short fixed copy).
- F1–F4: PASS (same label everywhere, plain Bahasa Indonesia, no unproven claims).
- G1: PASS (what, for whom, one CTA in the top third). G2: PASS for a lander (no fake proof strip; how it works; the close answers "is it free?"). G4: PASS (same label top and bottom). G5: PASS (full width, 56 px, top and bottom). G7: PASS if the ad's hook is this headline word for word. G8: PASS.
