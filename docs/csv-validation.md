# CSV Diff implementation and validation

## Delivered behavior

`templates/csv-diff/` is a complete standalone local tool, including file import, an explicit primary-key selector, four result categories, before/after changed values, stable JSON export, help, styles and synthetic samples. It has no server, account, dependency CDN or telemetry. Open `index.html` only after reviewing the generated files. DEMO output carries a visible DEMO banner.

The parser supports UTF-8 BOM, quoted commas/newlines, escaped quotes and LF/CRLF. It rejects empty/duplicate headers, malformed rows, empty/duplicate keys, mismatched column sets and inputs over 5 MiB or 20,000 data rows. Values preserve whitespace and leading zeros. Column order may differ; changed columns follow the first input's order. Keys sort by JavaScript code-unit order. Prototype-shaped column names are ordinary data. The UI uses text nodes for values and previews at most 500 rows per category; export retains all differences.

The real worker receives the editable initial template before model dispatch. Both the shipped and example Recipe skills document the fixed DOM IDs and `BeforeTiboCsv` parser/diff interface. Existing inherited improvements are preserved when missing template resources are supplied.

## Required acceptance

`validateCsvTool(job, candidateResult)` runs a runner-owned fixed Playwright suite located outside the candidate directory. The candidate cannot replace the fixtures, expected result or test script. Validation runs against a fresh read-only copy. The runner hashes the original and copied files before/after execution, rejects changes to bytes or the file set, and writes its own `validation.json` with the independently verified file hashes. That evidence is included in the artifact. A successful process exit is insufficient: the runner validates the downloaded JSON against its contract and immutable fixture.

The suite checks real file inputs, missing-key feedback, key selection, result counts, actual JSON download, 14 additional CSV edge cases and HTML values that must remain inert text. It blocks browser external requests and verifies CSP network rejection. Driver and browser private reads, plus driver writes outside its dedicated execution directory, must be rejected under the exact invocation. The host also checks that the forbidden output was never written. Independent sandbox probes check external-network, external-write and private-read denial before execution.

A missing browser or unsupported sandbox returns **required skipped**, which blocks acceptance. A failing browser/function check returns **failed**. Neither becomes a passing functional claim. The tool is not accepted merely because a page opens.

## Verified combination

- Date: 2026-09-22.
- Node.js 24.21.0; macOS arm64.
- Playwright 1.63.0, Chromium 153.0.8010.12 (bundled revision 1243).
- 18 trusted-template unit tests, 4 browser integration tests and a real-worker preparation regression passed. The positive integration ran the complete browser suite; the negative integration replaced `app.js` with a broken tool and verified rejection.
- No model call, account access or real user CSV data was involved. The real-worker preparation test mocks its transport and does not claim real model integration.

The validation backend is a development/verification dependency. After installing the supported Playwright version, install its Chromium with `npx playwright install chromium`. Public CI never accesses accounts. The macOS CI job explicitly prepares Chromium and requires the executable browser suite; unsupported platforms verify required skipped/blocked outcomes.

## Process boundary and compatibility details

On the verified macOS combination, the driver, browser and all descendants execute inside a mandatory OS Seatbelt sandbox. Only a dedicated ephemeral directory is writable. Candidate files, fixed fixtures, runtime libraries and the browser bundle are narrowly readable. External IP connections remain denied. Local Unix IPC is limited to the writable directory; Mach registration is limited to Chromium's required rendezvous/crashpad name prefixes. Process-group cleanup belongs to the common runner executor.

The browser uses `chromiumSandbox:false` because Chromium's nested sandbox initialization fails inside the already-active Seatbelt sandbox. This does **not** remove the outer OS sandbox or introduce a host execution fallback. That exact combination passed the private-read, outside-write and network denial checks. Codex execution policies and approval flags are unrelated and unchanged. Unsupported platforms remain blocked for executable validation until an equivalent backend is implemented and probed.

Two macOS environment controls point Foundation home and Chromium temporary storage into the dedicated directory: `CFFIXED_USER_HOME` and `MAC_CHROMIUM_TMPDIR`. Their behavior was checked against [Apple CoreFoundation source](https://github.com/apple-oss-distributions/CF/blob/main/CFPlatform.c) and [Chromium file utility source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/files/file_util_apple.mm). They grant no extra filesystem permissions.

## Failures resolved during implementation

Initial browser checks failed before candidate execution: Chromium used a macOS-native temp/home path despite ordinary HOME/TMPDIR overrides, required narrowly scoped IPC registration, and could not initialize its nested sandbox. Those runs were recorded as failures; no acceptance was inferred from them. After the isolated path and IPC corrections, the complete browser suite and the negative regression were rerun successfully.

## Temporary storage budget

All validation data, copied candidates, driver scratch, browser profiles and downloads reside under the runner-owned `validation-scratch` directory and count toward the run disk budget. Missing this trusted root blocks functional validation. On macOS a private short-path symlink alias points Chromium at those same bytes to respect the Unix socket path-length limit; the alias contains no browser data and grants no new permissions. Browser profile links/sockets are measured without following their targets, only inside this controlled scratch tree. Worker symlinks remain rejected. Tests exercised long paths, cleanup, and a real isolated 51 MiB write cancelled by a 50 MiB run budget.

The final private-read regression also places validation scratch inside the application checkout. Read access is limited to the CSV fixtures directory rather than the entire application root. A fixed runner-owned CommonJS package boundary next to the trusted check script prevents Node from reading an enclosing project package.json. Both checkout-local and separate home-directory CLI runs accepted the tool with all mandatory checks and empty scratch after cleanup.
