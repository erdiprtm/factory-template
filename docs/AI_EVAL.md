# AI eval: compare models on the product's own photos (D-085)

`pnpm ai:eval` runs a product's eval set (real photos with known answers) through one or more
provider/model configs and prints a Markdown table: accuracy, macro ranges, failures, latency and
cost in rupiah. Use it to **choose a model by measured accuracy** and to **catch regressions** before
changing `product.config.ts` `ai` (or the prompt).

It goes through the same pieces production uses:

- the adapter and provider factory (`aiProvider`, `apps/api/src/core/ai.ts`), so every provider the
  template supports works here too;
- each config is validated with the real `product.config.ts` `ai` schema (strict: a typo fails);
- the **product's own** request (system prompt, schema, image detail, output cap) and scorer, from
  `apps/api/src/features/ai-eval.ts` (product-owned).

It runs **locally only**, with keys from your shell's environment. It never reads `.dev.vars`,
refuses to run when `CI` is set (unless `--allow-ci`), and is not part of `pnpm verify`.

## 1. Point the product module at the real code path

`apps/api/src/features/ai-eval.ts` exports `aiEval`:

| Field | What it is |
|---|---|
| `request(image)` | The `AiJsonRequest` the scan route sends. **Import the route's own builder**, don't copy it, so the eval measures what users get. |
| `score(output)` | Model output → `{ items: string[], macros?: Record<string, number> }`. `items` are ranked names (first guess first, then alternatives). Return `null` when the output is unusable (counted as a schema failure). If the product shows macros, compute them here the way the route does (model's names and portions × curated data), so the macro column checks what users see. |
| `mock(req)` | The answer for `{ "provider": "mock" }`, a free dry run of the whole pipeline. |
| `expectedUsage` | Typical tokens per call (`inputTokens`, `outputTokens`), for the estimate shown before running. Take it from `/admin` or `ai_usage` once the feature runs. |

The template ships an example (meal photo → ranked dish names), marked PRODUCT-OWNED.

## 2. Build an eval set

The folder is `evals/` at the repo root. It is **gitignored**: photos stay on your machine.

- **20–50 real photos**, taken the way users will take them (phone camera, normal light, not staged):
  - mixed plates (nasi campur, nasi padang) with several dishes;
  - street food (siomay, gorengan, martabak, sate) and home cooking;
  - packaged products: the **front** and, as a separate photo, the **nutrition label**;
  - a few hard ones: dim light, half-eaten, unusual angle.
- **Consent and privacy (UU PDP):** use your own photos, or other people's **only with their
  permission**. No faces, names, receipts or addresses in the frame. Don't put the folder in a shared
  drive. Photos are sent to the provider you test, under that provider's API terms.
- Keep each photo under about 1 MB (resize first); `.jpg`, `.png` or `.webp`.

`evals/expected.json`, one entry per photo:

```json
[
  { "file": "siomay-1.jpg", "items": [{ "name": "Siomay", "aliases": ["somay", "siomay bandung"] }], "macros": { "protein": [10, 25] } },
  { "file": "nasi-campur-1.jpg", "items": [{ "name": "Nasi putih" }, { "name": "Rendang" }, { "name": "Sayur nangka" }] },
  { "file": "teh-kotak-depan.jpg", "items": [{ "name": "Teh kotak", "aliases": ["teh kemasan"] }] }
]
```

- `items`: every dish (or product) in the photo. A guess counts when it equals one of them, or one of
  its `aliases`, after lowercasing and removing accents and punctuation ("Gado-gado" = "gado gado").
  Matching is exact otherwise, so add the names a model may reasonably use as aliases.
- `macros` (optional): `[min, max]` ranges, inclusive, under whatever keys your `score` returns.
  Make ranges as wide as a real portion varies; they catch wild answers, not grams.

`evals/models.json`, the configs to compare (any field of `product.config.ts` `ai`, plus `label`):

```json
[
  { "provider": "openai", "model": "gpt-6-luna" },
  { "provider": "openai", "model": "gpt-6-sol", "tier": "fast", "label": "sol fast" },
  { "provider": "mock" }
]
```

Or skip the file: `pnpm ai:eval -- --model openai:gpt-6-luna --model openai:gpt-6-sol:fast`.

## 3. Run it

Export the key for each provider you compare in this shell (a dedicated key with a small budget is
best; `SETUP_HUMAN.md` 11b), then:

```sh
pnpm ai:eval                     # evals/expected.json × evals/models.json
pnpm ai:eval -- --model mock     # free: checks the set and the scorer
pnpm ai:eval -- --yes            # run although the estimate is above Rp 20.000
```

Options: `--dir`, `--models`, `--model` (repeatable), `--usd-idr` (default 16,500 per USD, an
assumption; check today's rate), `--max-rp` (default 20,000), `--yes`, `--out` (default
`evals/results/<date>.md`), `--product`.

The estimated cost (list prices × `expectedUsage` × photos) is printed first. Above `--max-rp`, or
when a model has no price in the adapter, nothing runs without `--yes`. Calls run one at a time.

## 4. Read the table

| Column | Meaning |
|---|---|
| Top-1 | Share of photos whose **first** name is one of the expected items. The number that matters most. |
| Top-3 | Same within the first three names (only when the model gave alternatives). A big gap to top-1 means a "pick from 3" UI would help. |
| Macros in range | Share of all macro ranges hit (a failed call misses all of its ranges). |
| Schema fail / refused | No usable answer although the call went through (bad JSON, refusal, `score` returned `null`). Should be 0. |
| Other errors | Quota, rate limit, provider down, bad request. Re-run before judging a model on these. |
| Median / p90 latency | Per call as measured by the adapter. p90 is what slow-network users feel. |
| Rp / scan, Total | From the real token usage and list prices, before PPN, at `--usd-idr`. `n/a` = no price known. |

Below it, "Per photo" shows each config's first answer with ✓/✗, so you can see *which* photos a
model gets wrong. Keep the reports (they're in the gitignored folder) and compare after every prompt
or model change: a drop in top-1 on the same set is a regression.

20–50 photos give a rough number (one photo is 2–5 points). Treat differences of a few points as
noise; prefer the cheaper model unless the better one wins clearly.
