---
name: before-tibo-toolsmith-csv
description: Build or improve one complete offline CSV comparison tool using the fixed BeforeTibo behavior specification. Do not start unrelated applications, use a backend, or load external resources.
---

# Toolsmith: CSV Diff

## Goal

Produce one useful local webpage under `out/csv-diff/`. First deliver the complete import → key selection → compare → inspect → JSON export flow; later units improve edge cases and usability without regressing the accepted version.

## Data behavior

Support UTF-8 with optional BOM, comma delimiters, double-quoted fields, embedded commas/newlines and LF/CRLF. Treat the first row as headers. Reject empty or duplicate headers. Require the user to select one unique, nonempty primary-key column in each file.

Header order may differ, but both files must have the same header set. Compare values as strings, preserving whitespace and leading zeros. Do not infer numeric types or silently merge duplicate keys. Limit each file to 5 MiB or 20,000 data rows, whichever comes first.

Classify rows into added, removed, changed and unchanged. Changed rows include before/after values and changed column names. Export JSON according to `csv-diff-result.schema.json`, using the first input's column order and deterministic row order. Do not implement CSV export or automatic encoding detection in v1.

## Interface and privacy

Use explicit file inputs and a key selector. Show validation errors clearly without losing the selected data. Provide keyboard-accessible controls and visible focus. Display user-provided text safely, never as executable HTML.

Use no remote CDN, analytics, fonts, API, backend or external image. Do not upload file contents. Treat unusual header names such as `__proto__` as ordinary data, not object-prototype operations. Do not read unrelated local files.

## Fixed validation interface

The runner supplies an editable complete initial tool at `out/csv-diff/`. Improve the assigned unit from that starting point. Preserve this public compatibility interface because independent browser tests exercise it:

- File inputs: `#before-file` and `#after-file`; choose files through these real inputs, not prompt text.
- Key selector: `#key-column`, with an initial empty option and exact header names as option values. Never choose a key automatically.
- Controls: `#compare` and `#export`; export downloads JSON as `csv-diff.json`.
- Feedback: `#error` for validation errors, `#status` for the four category counts in `N added · N removed · N changed · N unchanged` form, and `#results` for inert-text tables and changes.
- `globalThis.BeforeTiboCsv.parseCsv(text)` synchronously returns `{columns: string[], rows: Record<string,string>[]}` or throws an Error for invalid input. It preserves string values.
- `globalThis.BeforeTiboCsv.diffCsv(beforeText, afterText, keyColumn)` synchronously returns the `csv-diff-result` contract or throws an Error for invalid input.
- `globalThis.BeforeTiboCsv.limits` exposes `maxBytes: 5242880` and `maxRows: 20000`.

Use meaningful errors containing `primary key` when the key is missing. Retain network-denying CSP and local scripts/styles. The implementation may be improved, but do not special-case test samples, change expected values or remove error behavior. The runner's fixed suite, fixtures and validation evidence are outside worker control. `out/csv-diff/validation.json` is reserved for runner-generated evidence; do not write it.

## Output

Provide index.html, app.js, styles.css, README.md and clearly labeled synthetic examples. The tool should work from local resources without an account or deployment. The runner supplies fixed independent functional tests; do not change them or their expected output.

## Finish

Return the candidate paths and known limitations using the agent-result contract. Do not self-certify functional success when browser checks were unavailable. Stop after the assigned unit.
