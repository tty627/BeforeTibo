# BeforeTibo v0.1.0-alpha.1

Prepared for a public GitHub prerelease at [tty627/BeforeTibo](https://github.com/tty627/BeforeTibo). These notes do not assert that publication has completed. Licensed under MIT, copyright © 2026 tty627.

BeforeTibo runs finite, single-worker Codex workflows and keeps independently checked artifacts with offline harvest reports. This first alpha implements three built-in Recipes:

- **Repo Book:** source-referenced repository guides with fixed structural and protected-input checks.
- **Test Me to Death:** isolated Vitest baselines, new test patches and independently reproduced differences. Production code and existing assertions remain protected.
- **Toolsmith CSV:** a complete offline CSV Diff tool, checked against fixed expected data and actual isolated browser interactions.

Dispatch intentions are persisted before execution. Stop and recovery preserve the original budget/deadline; ambiguous execution is never silently repeated. The runner owns validation and immutable promotion. DEMO uses synthetic input and the same orchestration interface, and is labeled throughout terminal output and receipts.

## Verification and limits

The recorded clean-directory verification passed nine commands: `npm ci`, lint, typecheck, the full test suite, contract tests, integration tests, build, offline demo smoke and package-install smoke. The full suite contains **297 passing tests**, including **140 contract tests** and **40 integration tests**. The contract and integration totals are subsets of the full suite, not additional tests. Source-to-tarball installation and execution were checked outside the source tree. See the repository's [verification record](https://github.com/tty627/BeforeTibo/blob/master/docs/verification-results.json) and [release readiness](https://github.com/tty627/BeforeTibo/blob/master/RELEASE_READINESS.md) for the exact commands, public-content review and remaining checks.

The Codex 0.154.0 adapter includes JSONL/protocol fixtures, verified local configuration and extension controls, read-only account/quota observation, and conservative admission rules. Synthetic local sandbox probes, baseline/test execution and browser acceptance were exercised. **Real Codex model generation, real account/worker quota binding, and each Recipe's real model integration are NOT RUN.** Local tests do not establish real account-level behavior. GitHub-hosted CI results must be verified separately; a prepared workflow is not evidence that remote CI passed.

Use **Node.js 24.x**. The tested executable environment is **macOS 26.5.2 arm64**, with Node **24.21.0**. The test Recipe supports the documented single-package **Vitest 4.1.11 / Vite 7.x** combination. CSV executable validation requires **Playwright 1.63.0** and its explicitly prepared Chromium. Unsupported or missing backends block execution or required validation. Linux supports offline structural checks; Linux executable task support and native Windows support are not claimed.

Local limits are not service billing caps. There is no API-key fallback, automatic purchase, reset redemption, account rotation, multi-worker mode, remote executor or automatic publication of user artifacts. Sanitized export excludes private source-bearing artifacts, credentials and raw run logs. Human review remains required after automated acceptance.

## Installation

Build from the source checkout with `npm ci` and `npm run build`, then run `node dist/cli.js demo`. Alternatively, build a tarball with `npm pack` and install that local file into another directory. Dependency installation requires registry access; the installed Repo Book demo and harvest work without Codex or network access.

**No npm package is published as part of this release preparation.** Do not assume a same-named registry package belongs to this project. See the [README](https://github.com/tty627/BeforeTibo#readme) for installation, explicit real-run consent, stop/resume commands and validator setup.

BeforeTibo is an independent community project. It is not affiliated with or endorsed by OpenAI or any individual. Its MIT license does not change the licenses of user inputs, generated patches or third-party code.
