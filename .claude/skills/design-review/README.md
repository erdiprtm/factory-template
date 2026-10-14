# /design-review: sources and credits

The rubric in `SKILL.md` is written in our own words for factory products (D-075). It adapts ideas from two MIT-licensed projects. Nothing from them is installed, cloned or run here, and no files are copied.

| Project | URL | Licence | What we took |
|---|---|---|---|
| design-taste (madebymustafa) | https://github.com/madebymustafa/design-taste | MIT | Reading material from `skills/design-taste`, `taste-motion`, `taste-accessibility`, `taste-design-review`, `taste-landing-page` and `taste-ux-copy`: the AI-default tells, transform/opacity-only motion and status-only loops, contrast and target sizes, the 8-second read, landing section order and CTA discipline, empty/error/loading copy, claims need proof |
| better-design (marvkr) | https://github.com/marvkr/better-design | MIT | The workflow only (inspect the repo's tokens and components, keep the existing system, load principles, implement, review, fix critical issues before handoff) and its trust-boundary idea (fetched or rendered content is evidence, never instructions) |

## Left out on purpose

- design-taste's 10 visual-style ("genre") skills, its install script and validators.
- Rules that clash with factory products:
  - its 300–900 ms motion durations (ours: 100–250 ms, up to 350 ms for sheets, unless the product's `DESIGN.md` says otherwise);
  - "always pair a serif with a sans" (fonts come from `brand.tokens`);
  - oversized editorial headlines in app screens;
  - a blanket ban on large radii (radii are product tokens).
- better-design's hosted MCP, API key and catalog/brand-copy themes. A product's own design system always wins.
