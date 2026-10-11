# Product spec format

Every product gets one page in `specs/<slug>.md` using the template below. `/build-from-spec` **refuses to start** if any of these sections is missing or empty: **Core features**, **Paid vs free**, **Data the product stores**, **Kill criteria** (under Launch & distribution).

Keep it to one page. Max 3 core features in v1. Everything else goes under "Out of scope".

````md
# <Product name> — Spec v<n>

## One-liner
<What it does, for whom, in one sentence.>

## Target user & problem
<Who, what pain, how they solve it today.>

## Core features (v1 — max 3)
1. …
2. …
3. …

## Paid vs free
- Free / trial: …
- Paid (6 or 12 months): …

## Plans & prices
- 6 bulan: Rp…
- 12 bulan: Rp…

## Data the product stores
<List. Flag anything sensitive (health, children, finance, location).>

## Content & data sources
<Where facts/numbers come from. Who curates them.>

## Out of scope for v1
- …

## Launch & distribution
- Launch date: …
- First channel(s): SEO pages / content / community / ads
- Success metric at day 30: …
- Kill criteria at day 60: …

## Open questions
- …
````

## Notes for writing a good spec

- **Data the product stores:** if anything is health-related or otherwise sensitive under UU PDP, say so. It turns on `legal.sensitiveDataConsent` in `product.config.ts`.
- **Content & data sources:** numbers shown to users (nutrition, health, prices) must come from curated data stored in the product, never from model memory (CLAUDE.md product guardrails).
- **Kill criteria:** a measurable condition and a date, e.g. "fewer than 20 paying users by day 60". It is copied into `factory.json`.
- **Plans & prices:** become `plans` in `product.config.ts`. Integer IDR, exactly two durations (6 and 12 months).
