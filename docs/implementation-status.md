# Implementation status

Current milestone summary: M0–M4 implemented; M5 local checks and release preparation completed on the documented macOS environment. Real-account smoke (B22) remains NOT RUN/BLOCKED pending explicit execution/spending authorization. Public release (B24) is authorized for tty627/BeforeTibo (public, MIT © 2026 tty627); documentation/package and GitHub publication checks are in progress. Historical checkpoints and failures below are retained.

## Environment — 2026-09-22

- Initial workspace: empty Git repository, branch master, no commits or remote changes.
- Handoff read in full: START_HERE, CODEX_BUILD_PROMPT, AGENTS, SPEC, TASKS, ACCEPTANCE, GITHUB_RELEASE; all contracts and examples inspected.
- Host: macOS 26.5.2 (25F84), arm64; Git 2.51.0; Codex CLI 0.154.0.
- Default Node: 25.8.0, npm 11.11.0. Node 24 toolchain verification in progress.

## M0 — in progress

- B01: preserved existing .git; imported handoff documents and schemas into the empty workspace; docs/spec.md retains the specification.
- B02–B05: implementation in progress. No passing application tests claimed yet.
- Parallel bounded work: filesystem/sandbox boundaries, Codex protocol and quota adapters, contract validation.

## Commands actually run

- git status --short --branch: clean, no commits.
- node --version, npm --version, git --version, codex --version, sw_vers: successful.
- codex exec --help / codex app-server --help: successful, non-inference capability inspection.

## Not run / publication

- All real model tasks: NOT RUN; account and spending consent not provided.
- Real quota read / identity binding: NOT RUN.
- Git commit, remote creation, push, Release, npm publish: not performed.
- Publication awaits confirmed owner/repository, copyright attribution and public scope after local checks.

## M0 / M1 evidence — 2026-09-22

- Installed an isolated Node 24.21.0 under ignored `.local/toolchain`; the host's `node@24` symlink actually resolves to Node 25, so it was not used as evidence.
- B03: all seven contracts, strict TypeScript types, package-relative resource loading, semantic checks and negative cases implemented. `npm run test:contracts`: 88 PASS (agent-run).
- B04/B06/B10/B11: journal, reducer, single-writer lock, committed snapshot module, structural/source-reference validators, immutable hash manifests and offline harvest implemented.
- First complete Repo Book unit runs through the same worker/runner interface with an explicit synthetic DEMO worker. It is not a real Codex integration result.
- `npm run test:integration` under Node 24.21.0: 4 PASS. Includes end-to-end receipt/HTML/export, ambiguous intent recovery, candidate-save crash and post-promotion crash recovery without another dispatch.
- Global typecheck initially found one in-progress snapshot tuple typing error; repair in progress. CLI and full release checks have not yet run.
- Next: complete CLI, cancellation/resume edge cases, test Recipe and CSV Recipe, quota integration and release checks.

## M2 / M3 progress — 2026-09-22

- Journal hardened with typed payload checks, duplicate-event identity validation, immutable accepted states, serialized writes, conservative stale-lock recovery and truncated-tail handling. Contract + storage checks: 108 PASS in the agent's recorded run.
- `npm run test:integration`: 8 PASS under Node 24.21.0, including bad exit-zero candidate rejection, repair/no-progress bounds, protected-source quarantine and immediate stop cancellation.
- `npm run build`: passed after fixing the journal event type. `npm run demo:smoke`: PASS with Codex absent from PATH; offline harvest also passed.
- Workspace/sandbox tests: 16 PASS. Actual macOS Seatbelt probes passed inside write, outside write denial, private read denial and external network denial.
- Codex JSONL/RPC/usage/quota tests: 21 PASS under actual Node 24.21.0; public CLI/schema probes only, no real inference/account quota smoke.
- Vitest baseline/added-test validator and CSV template/browser validator are in implementation/testing. Browser functional execution initially failed under Seatbelt; this remains a failure until a confined working configuration is demonstrated.
- npm audit through the host's default mirror failed (unsupported audit endpoint). Official registry audit succeeded and reported two moderate Vitest 3-related vulnerabilities. Upgrade to fixed Vitest 4.1.11 is in progress; no clean audit claimed yet.
- CI Action SHAs were verified through GitHub's API. CI has not run remotely. License attribution remains an explicit local draft pending confirmation.

## M3 test iteration — 2026-09-22

- Upgraded to Vitest 4.1.11, Vite 7.3.6 and ESLint 10.11.0. Earlier npm attempts hit stale registry metadata and were terminated/retried; fetching fresh @standard-schema/spec metadata resolved installation.
- First complete suite on the upgraded stack: **182 PASS, 6 FAIL**. Five failures were the new Vitest sandbox baseline path; one was CSV browser context startup. These were real failures, not skipped successes. Investigating the narrow OS permissions required without enabling external task networking.
- Shared source lint/typecheck passed at this checkpoint.
- Heuristic secret scan: 128 candidate files, 0 commits, PASS. Manual staged/history review remains pending until final implementation stabilizes.

## M3 executable checks resolved — 2026-09-22

- Vitest validator: actual Node 24.21.0 / Vitest 4.1.11 / Vite 7.3.6 sandbox execution passed. The system hosts/services files needed narrow read access for localhost resolution; IP networking stayed denied. The selected test extension is now used for the discovery probe.
- Agent's focused filesystem/sandbox/Vitest run: **28 PASS** across four files, including valid added tests, git apply --check, failed baseline, excluded discovery, all skipped/no assertions, source mutation and repeated reproduction.
- CSV focused suite: **20 PASS**, including actual Playwright 1.63.0 / Chromium 153 functional browser checks under outer macOS Seatbelt. Chromium's nested sandbox conflicts with the enclosing sandbox; the browser remains inside enforced Seatbelt, including renderer descendants. No host fallback was used.
- Earlier six failures remain documented above; full merged regression is still pending.

## M4 / M5 merged implementation — 2026-09-22

- Completed real-run wiring with per-invocation consent, effective configuration isolation, metadata-only doctor, account/workspace/member binding and model bucket gates. Public Codex 0.154.0 help/protocol and native sandbox probes passed for all three Recipe profiles; they started **zero model calls** and did not read account quota. Real account inference remains NOT RUN.
- Quota observer only permits read methods; exec and observer own isolated process groups. Quota polling is independent of deadline/cancellation checks; typed state carries observed windows into terminal/report without summing percentages.
- Stop/resume, candidate pinning before/after validators, promotion hash checks, stale locks, symlink/path traversal, protected files and storage failures have dedicated regression coverage.
- Package installation smoke initially failed because npm registry access exceeded the test timeout. The test now installs the packed artifact offline using dependencies cached by npm ci. It subsequently passed outside this source tree (99 packaged files).
- Merged full suite checkpoint: **246 PASS, 1 FAIL**. The failure was a real disk-usage/atomic-rename race that could stop a healthy run with storage_error. A concurrent rename regression and ENOENT-only tolerance were added; final full-suite verification is pending below.
- A first Test Recipe CLI demo accepted one real validated patch but stopped with storage_error; this is not recorded as a fully successful demo. Retesting after the race fix.
- Post-upgrade npm audit could not complete because the official registry TLS connection reset. The earlier Vitest advisory's fixed version is installed; a clean post-upgrade advisory audit is **NOT RUN**, not PASS.
- One focused test command referenced a nonexistent file and returned “No test files”; corrected Codex unit paths then passed 17 tests. This did not establish coverage for the nonexistent path.
- CI macOS job explicitly prepares Chromium and requires actual sandbox/browser execution; other platforms still exercise fail-closed behavior. Remote CI remains NOT RUN.

## M5 final fault review — 2026-09-22

- The Test Recipe CLI storage_error was a second, distinct defect: temporary validator copies contain a runner-created read-only dependency symlink. Fixed by an exact trusted-link mapping; arbitrary worker symlinks still fail and temporary validation files remain counted. The complete three-stage test DEMO subsequently finished COMPLETED with three dispatches.
- Found and repaired missing cancellation propagation from runner to executable validators; active timeout/immediate stop now reaches their owned process trees. Saved candidates interrupted during validation retain local recovery eligibility.
- Added direct invalid-reference tests (7 PASS), independent input-total-size and Git metadata preservation checks (workspace 11 PASS), missing-sandbox fault injection, and default-stop/two-interrupt/partial-report regressions. A newly added repair-limit test initially used an out-of-contract no-progress value of 10 and correctly failed before work; corrected to the allowed value 5 for an independent repair-limit test.
- Independent clean-directory `npm ci`: exit 0, 143 packages installed from the lockfile under Node 24.21.0.
- Retried official `npm audit --json --fetch-timeout=10000 --fetch-retries=0`: **exit 0, zero known vulnerabilities**, 193 dependency entries. This supersedes the earlier unavailable audit result; earlier failures are retained above.
- Verified safe GitHub identity lookup and local Git state: one active authenticated account, no remote, no commits. No token values or account response logs enter public files. Owner selection still awaits confirmation.

## M5 final path and disk checks — 2026-09-22

- CSV temporary browser data originally lived outside the run disk counter. It now lives in runner-owned validation-scratch; a short private macOS socket alias points to the same budgeted data. A real isolated 51 MiB write triggers a 50 MiB run budget and accepts no artifact. Ordinary worker links remain rejected.
- The resulting clean-directory checkpoint passed all nine commands: 296 tests / 25 files, 140 contract tests, 39 integration tests, build, offline smoke and 99-file package installation. Secret scanner now inspects actual staged blobs as well as the working tree and history; staged-only and historical synthetic-secret regressions passed.
- A subsequent delivery CSV DEMO using a state directory inside the source checkout failed its mandatory private-read probe at browser-context setup and correctly accepted **zero artifacts**. Earlier system-temp-directory checks had passed. Investigation identified an overly broad application-root readable permission which also exposed the nested validation probe. Narrowing that permission and adding a path-specific browser regression are in progress; this failed delivery run is not presented as a successful sample.

- Root-cause isolation for the checkout-local CSV failure: the validator allowed reading the entire application resource root; when state lived below that root, its private sentinel became readable. The mandatory sentinel check rejected the run before executing the candidate tool. The fix narrows this permission to the exact synthetic CSV fixtures directory, runtime dependencies and the browser bundle. A regression now exercises scratch nested inside the application checkout, in addition to long temporary paths.

## Final local release gate — 2026-09-22 06:05 UTC

- The checkout-local CSV boundary regression is resolved. The trusted validation script has its own fixed CommonJS package boundary; readable roots include only necessary fixture/runtime paths. Actual CLI runs with state inside the application checkout and in a separate user-home directory both accepted one tool, stopped normally for no_progress after three dispatches, passed every mandatory check and removed browser scratch.
- **All nine required commands PASS**, from an independent clean installation using the unchanged pinned lockfile: npm ci; npm run lint; npm run typecheck; npm test (**297/297**, 25 files); npm run test:contracts (**140/140**); npm run test:integration (**40/40**); npm run build; npm run demo:smoke; npm run test:pack (**99 packaged files**, installed and run outside source). Contract/integration counts are subsets/repeated commands, not extra independent cases to sum with 297.
- Final whole-suite execution required actual macOS sandbox and browser validation; it did not count a missing backend as functional success. Machine-readable sanitized results: verification-results.json. Command output is retained only in ignored local release-checks, not public logs.
- Final DEMO outcomes: Repo Book COMPLETED / 1 dispatch / 1 artifact; Test Me to Death COMPLETED / 3 dispatches / 3 artifacts; Toolsmith CSV STOPPED(no_progress) / 3 dispatches / 1 accepted complete tool. All are synthetic generation with real runner validation. The ignored local delivery-demo/index.html links their reports and CSV tool.
- Public documentation: English/Chinese README, security/contribution guides, architecture/compatibility/quota/Recipe docs, all 92 acceptance outcomes, RELEASE_READINESS.md and release-notes.md completed. Acceptance matrix: 83 PASS, 7 NOT RUN, 2 BLOCKED, 0 unresolved implementation FAIL. Its per-row limits remain authoritative.

| Milestone/task | Final local state | Evidence / remaining scope |
|---|---|---|
| M0, B01–B05 | Implemented and locally verified | Bootstrap/contracts/state/journal/mock; original workspace preserved |
| M1, B06–B11 | Implemented and locally verified | Input snapshot through references/validation/immutable artifact/offline report |
| M2, B12–B13 | Implemented and locally verified | Bounded dispatch/time/disk, drain/cancel, crash/candidate recovery |
| M3, B14–B15 | Implemented and locally verified | Actual synthetic Vitest and fixed Chromium suites; real model generation NOT RUN |
| M4, B16–B18 | Implemented and locally verified | Read-only protocol/quota policy, identity/config gates, terminal/JSON/export; real account integration NOT RUN |
| M5, B19–B21 | Implemented and locally verified | Fault/security checks, installed tarball, docs and CI configuration; remote CI NOT RUN |
| B22 | BLOCKED / real smokes NOT RUN | Explicit account/execution/spending authorization not given |
| B23 | Local preparation complete | Pack contents, working/staged/history scan, reviewed diff and release drafts |
| B24 | BLOCKED | Owner/repository, MIT attribution and public scope require confirmation |

Publication facts: project files explicitly staged and reviewed, no local commit yet, branch master (unborn), no remote, no push/tag/Release. npm publication was never attempted. The draft LICENSE attribution must be finalized before the first public commit. Existing history is empty; after creating that commit its actual history must be scanned again before pushing.

## Public release authorization and documentation — 2026-09-22

- Maintainer confirmed exact repository name BeforeTibo, public visibility and recommended remaining choices: owner tty627, MIT © 2026 tty627, reviewed project-only scope, v0.1.0-alpha.1. No npm publishing or real-account/model authorization was inferred.
- GitHub read confirmed tty627/BeforeTibo does not exist; local master remains the intended default branch, with no conflicting remote.
- Rewrote both READMEs around a short DEMO-first path, three concrete Recipe outcomes, the verifiable community “Tibo, when reset?” reference, stop/recovery and honest alpha boundaries.
- Added original AI-generated hero illustration, authored workflow SVG and actual screenshots of synthetic CSV and Test Recipe results. Inspected images for readability, DEMO labels and absence of private paths. CSV capture uploaded real synthetic fixtures and verified the downloaded JSON against the committed expected result. Capture script ESLint passed; no DOM/data manipulation.
- Finalized MIT attribution and GitHub package metadata. Package allowlist includes the user guides and image provenance. Added package-link checks; the first run correctly failed on an old README relative evidence link, then links were corrected to the public GitHub source where appropriate. Final pack rerun is pending at this checkpoint.
- CI now checks out full history so secret scanning sees the actual commit history. Public CI/model-free behavior and required macOS sandbox/browser checks are unchanged.
- Commit/push/remote CI/tag/Release: not yet executed at this checkpoint. Real Codex/account/quota: NOT RUN. npm publish: NOT RUN / outside authorization.

## Documentation review and terminal usability fix — 2026-09-22

- Cross-checked both READMEs against the implementation. Clarified that secret filtering is heuristic, Repo Book's independent validators do not run repository scripts, and the disk threshold is periodically enforced rather than a filesystem hard quota.
- Found the live terminal omitted the Run ID needed by a second terminal's stop command. Added the ID to the human display only; JSON output is unchanged. Existing terminal regression now asserts the ID. Focused tests: 14 PASS; relevant ESLint and full typecheck PASS.
- The corrected package-link/install check passed: **111 packaged files**, including documentation images/guides and finalized MIT. Full post-documentation publication checks are now running, with executable validation required.

## Publication regression: test discovery — 2026-09-22

- Re-running the full suite in the actively used development checkout exposed a test-discovery defect: Vitest's default search included saved synthetic DEMO test files under ignored local state. The run reported **314 passing tests and 7 failed suites**, because standalone artifact patches do not contain their original fixture source. The earlier clean-directory 297-test result remains valid but did not exercise this layout.
- No saved result was deleted to hide the failure. The fix will explicitly scope this project's test discovery to `tests/**/*.test.ts`; isolated Recipe validators keep their own configuration and execution checks. Remaining release commands paused after the failed full-suite gate; the failed logs remain private.

- Fixed discovery with an explicit `vitest.config.ts` include of `tests/**/*.test.ts`, and included the config in strict TypeScript checking. All project tests remain included. Development checkout rerun: **25 files / 297 tests PASS**; configuration ESLint and full typecheck PASS. A complete post-fix nine-command publication gate is now running.

## Final publication candidate checks — 2026-09-22

- All nine required commands passed again after the discovery fix and terminal/README changes: clean npm ci, lint, strict typecheck, **297 tests / 25 files**, **140 contracts / 2 files**, **40 integrations / 5 files**, build, offline demo smoke, and installed-package smoke (**111 files**).
- Execution-required checks ran on the documented macOS host. The test discovery regression no longer includes saved DEMO artifacts; those files were preserved. Earlier failing attempt logs remain private and are not part of the release.
- Heuristic content scan passed for **161 candidate files** before final staging; image content and source/metadata changes were manually reviewed. The final staged blobs and first actual commit history must still be scanned before push.
- Remote publication and remote CI remain pending at this exact checkpoint. No npm publish or real model/account task was run.

## Public repository created and first remote CI — 2026-09-22

- Reviewed and committed **161 files** as `3566070b7d1ed84a886489785d97bea607e22ce3`, using the verified maintainer's GitHub noreply identity. Actual staged blobs plus the first real commit history passed secret scanning. No user runtime state, credentials or raw logs were included.
- Created **https://github.com/tty627/BeforeTibo**, visibility **PUBLIC**, default branch **master**; normal push succeeded. GitHub and `git ls-remote origin HEAD` both matched the local commit. No remote was replaced and no force push was used.
- Added repository topics and enabled GitHub private vulnerability reporting; a subsequent API read confirmed `enabled: true`.
- First actual GitHub Actions run: [35698635470](https://github.com/tty627/BeforeTibo/actions/runs/35698635470). Linux passed installation, lint, typecheck, unit/contracts/integration, build and offline DEMO, but **package-install smoke FAILED**. macOS executable tests and integration also passed, then the matrix fail-fast policy cancelled its remaining steps after Linux failed. Tag and Release are withheld until the failure is fixed and required remote checks pass.
- The in-app browser did not connect during two bounded attempts to inspect the live GitHub rendering. This visual check is NOT RUN; local image inspection and actual package-link validation passed. No GitHub screenshot is claimed.

- Remote failure root cause confirmed from the actual Linux job log: npm `ENOTCACHED` for registry package metadata during `npm install --offline` in package smoke. `npm ci` cached dependency archives but did not guarantee the package-index cache that a new consumer installation requires. Installation is allowed to access the registry; the installed runtime DEMO and harvest remain model-free/offline. The fix changes only the installation cache preference, with post-install runtime checks retained.
- GitHub's README rendering API returned the four expected image references, and its repository content API confirmed all four image assets exist. This verifies uploaded content/HTML structure, not live browser visual rendering.

## Remote package-install regression fixed — 2026-09-22

- Reproduced the exact `ENOTCACHED` error locally after a cold-cache npm ci. Fixed package-smoke installation to prefer cached dependencies while allowing documented setup-time registry access.
- Preserved actual external-directory tarball installation, CLI symlink, Recipe/resource/metadata and Markdown/image checks. Added installed DEMO and harvest invocations with no Codex PATH and a temporary home; harvest reported zero model calls.
- Corrected package smoke passed both with the normal cache and with a completely empty npm cache: **111 files**. Relevant ESLint and diff checks passed. No required check was skipped. Second remote CI is next.
