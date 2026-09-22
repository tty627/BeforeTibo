# Documentation artwork and screenshots

These assets accompany the two READMEs. They contain no user repository, credential, account response, personal quota history or raw run log.

| File | Origin | Meaning |
|---|---|---|
| beforetibo-hero.png | Original AI-generated editorial illustration, imagegen, text-to-image mode, 2026-09-22 | Fictional workshop metaphor. This is artwork, not an application screenshot or measured performance claim. |
| workflow.svg | Authored SVG | The implemented candidate → validator → immutable artifact → offline harvest path, with bounded repair and stop/recovery. |
| csv-demo.png | Actual Playwright screenshot of an accepted synthetic DEMO artifact | Uploaded the committed synthetic before/after CSV fixtures, selected id, compared, and verified the real JSON download against the fixed expected diff. |
| harvest-demo.png | Actual Playwright screenshot of a synthetic Test Recipe harvest | Header and first complete artifact, cropped by viewport. COMPLETED, three artifacts and three dispatches; no DOM or CSS rewriting. Unknown quota and pending human review remain visible. |

Both screenshots use synthetic local fixtures and clearly show DEMO. No model call or personal account was used. Generation is simulated; validation and persistence are real. Source capture script: [capture-docs.mjs](https://github.com/tty627/BeforeTibo/blob/master/scripts/capture-docs.mjs).

To recreate screenshots after explicitly preparing the documented browser and sandbox dependencies:

```sh
node dist/cli.js demo --recipe test-me-to-death --state-dir .local/delivery-demo
node dist/cli.js demo --recipe toolsmith-csv --state-dir .local/delivery-demo
node scripts/capture-docs.mjs .local/delivery-demo
```

The capture script checks DEMO provenance, artifact hashes, the actual CSV download and visible text before writing these two PNGs. Review the images before publishing. It is only intended for the project's synthetic demonstrations.

## Hero generation prompt

Mode: text-to-image. No reference image or real-person likeness was used. Final image was copied into this directory unchanged.

```text
Use case: illustration-story.
Asset type: wide GitHub README hero illustration for an independent open-source developer CLI called BeforeTibo.
Primary request: a witty, beautiful, instantly understandable editorial illustration showing spare AI coding capacity becoming tangible useful work. This is original branding artwork, NOT a screenshot or a claim about actual software metrics.
Composition: very wide landscape banner, approximately 1800x900, readable at 900px wide. Warm off-white paper, midnight navy linework, bold warm orange, a little muted mint. Upper left: large excellent editorial typography reading exactly "BeforeTibo", underneath a small readable line "Spend the quota. Keep the work." Leave generous breathing room. Bottom-left: a relaxed little anonymous robot operator wearing work gloves drops a few glowing abstract square tokens into a compact whimsical desktop workshop machine. The machine has a friendly analog timer with NO numbers or percentages, a conspicuous red stop button, and three tidy output trays to the right: a small open book with code-like line marks, a shield holding a checkmark next to test cards, and a neat miniature grid/table representing a CSV diff tool. A tiny orange inspection stamp/checkpoint between machine and trays visually communicates checking the output. The result should feel like a print designer's charming developer zine: flat screen-print texture, crisp silhouettes, carefully composed 2D shapes, subtle hand-drawn imperfect ink edges, mature restrained humor, no glossy gradients, no generic AI sparkle explosion.
Text constraints: Only the exact title "BeforeTibo" and exact tagline "Spend the quota. Keep the work."; no other letters, labels or numbers. Do not show real people, portraits, a celebrity, any company logo, OpenAI mark, a claimed endorsement, a currency price, a balance, a reset schedule, or a fake interface screenshot. Original fictional robot only. No stock watermark. Make the book / validated tests / CSV grid visually distinct and clear.
```
