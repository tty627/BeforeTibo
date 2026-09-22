# CSV Diff

Open `index.html` locally in a modern browser. Choose two UTF-8 CSV files, select the unique primary-key column, then compare and export the JSON result. No installation, account, server, external assets or network request is needed. This is generated executable code; review the files before opening.

Supported: UTF-8 BOM, comma delimiter, headers, double-quoted fields, escaped quotes, quoted commas/newlines and LF/CRLF. Columns may be reordered but names must match. All values remain strings, including leading zeros and spaces. Keys must be nonempty and unique. Duplicate/empty headers, malformed quotes and different column sets are rejected.

Each file is limited to 5 MiB or 20,000 data rows. Preview tables show at most 500 rows per category; JSON export includes all differences. Outputs are stably sorted by primary-key strings in code-unit order. Changed columns follow the first input's header order. No CSV export is provided.

`sample-a.csv` and `sample-b.csv` are synthetic. Compare by `id`; the expected result is `expected-diff.json`. Local browser validation is reported by the BeforeTibo runner, not by this tool itself. A rendered page alone is not evidence of functional correctness.
