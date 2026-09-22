# BeforeTibo v0.1.0-alpha.1 — release readiness

This is an **authorized public prerelease candidate; publication checks are in progress**. Last reviewed 2026-09-22. Detailed evidence: [implementation history](docs/implementation-status.md), [AC-01–AC-92 matrix](docs/acceptance-results.md), [verified environments](docs/supported-environments.md).

## Release decision

**Ready to tag the public alpha after the final documentation commit passes CI.** The maintainer authorized **tty627/BeforeTibo**, **public**, **MIT © 2026 tty627**, reviewed project-only scope and **v0.1.0-alpha.1**. The repository exists and the normal push to `master` was verified.

The initial remote package-install failure was reproduced and fixed. [Both Linux and macOS GitHub jobs passed](https://github.com/tty627/BeforeTibo/actions/runs/35699251338) on commit `1d53d0a2472ca8611c55e535b5ed8f6c111e57b8`, including package installation and full-history secret scanning. macOS required actual sandbox/browser execution; Linux verified its documented offline/blocked behavior. This was a push workflow, not a fork-PR test. Tag/Release creation is the remaining step; npm publishing is not authorized.

## Required commands

All commands use genuine Node 24.21.0. The system Node 25 path is not used as supported-line evidence. The earlier independent clean-directory gate passed; results below were repeated after final changes in the development checkout, including its saved synthetic DEMO state; see [machine-readable results](docs/verification-results.json).

| Gate | Result | Evidence |
|---|---|---|
| npm ci | PASS | Clean dependency installation from the lockfile; earlier independent clean-directory gate also passed |
| npm run lint | PASS | ESLint: exit 0 |
| npm run typecheck | PASS | TypeScript strict check: exit 0 |
| npm test | PASS | 297 PASS, 25 files; actual sandbox/browser required |
| npm run test:contracts | PASS | 140 PASS, 2 files |
| npm run test:integration | PASS | 40 PASS, 5 files |
| npm run build | PASS | TypeScript compilation: exit 0 |
| npm run demo:smoke | PASS | Offline DEMO and harvest with no Codex PATH |
| npm run test:pack | PASS | 111-file tarball installed and executed outside source; packaged Markdown/image links verified |
| Secret scan and content review | PASS | Working/index/history scan and manual staged/package review; see docs/publication-review.md |

## Execution evidence and limits

- Repo Book: synthetic generation with actual source-reference checks, immutable promotion and offline HTML/JSON/Markdown harvest. Real model execution **NOT RUN**. Recorded DEMO: COMPLETED, 1 dispatch, 1 artifact.
- Test Me to Death: real isolated Vitest 4.1.11 / Vite 7.3.6 baseline, new tests, patch application checks and reproduction cases on synthetic fixtures. Real model generation **NOT RUN**. Recorded DEMO: COMPLETED, 3 dispatches, 3 artifacts.
- Toolsmith CSV: actual Playwright 1.63.0 / Chromium 153 fixed functional/browser validation under macOS Seatbelt, with temporary data included in the run disk budget. DEMO accepted 1 tool, then stopped for no progress after 3 dispatches. Real model generation **NOT RUN**.
- Codex 0.154.0: actual help, generated public protocol, effective extension isolation and native sandbox probes. Account/model/real quota integration **NOT RUN**. This is not a claim that any account can execute successfully.
- Quota: synthetic read-only observer, identity, multiple-window, stale/reset/reserve and failure checks. Runtime preflight must prove account/config/bucket matching. No purchases, reset redemption or API-key fallback.
- macOS 26.5.2 arm64 is the local tested executable platform. Linux executable sandbox backend is not implemented; unsupported execution is blocked. Linux/macOS push CI passed; [actual run](https://github.com/tty627/BeforeTibo/actions/runs/35699251338). Fork-PR event behavior remains NOT RUN.
- npm advisory audit after the upgrade: **PASS, zero known vulnerabilities** (193 dependency entries). Earlier TLS failures remain recorded in the implementation history; this is an advisory database check, not a guarantee of absence of vulnerabilities.
- No hard service-side zero-incremental-charge guarantee. Local dispatch/time/disk limits do not cap service billing.

## Authorized public content

Publish only the authored implementation (`src/`), synthetic tests and public upstream protocol/help fixtures (`tests/`), contracts, built-in Recipe instructions, CSV template/fixtures, handoff/specification documents, project documentation, lockfile/build configuration and CI files. The Git history begins with this reviewed project snapshot. Original documentation artwork and screenshots of the synthetic DEMOs are included; no raw runtime state or log is included.

Exclude `.local/`, all run/harvest directories, `node_modules/`, generated `dist/`, tarballs, auth/config secrets, actual account responses, personal quota history, host paths, raw execution logs and all user repository snapshots. The public package file allowlist is separately checked with `npm pack`.

LICENSE is now standard MIT with **Copyright (c) 2026 tty627**; package metadata agrees. User inputs and generated third-party code keep their own licensing obligations.

## Remaining publication gates

Finish the documentation-only commit recording the actual CI results, verify its remote checks, create the v0.1.0-alpha.1 tag at that checked commit and create/query the GitHub prerelease. The release tarball is project-only, inspected and install-tested; it is not an npm registry publication.

Real-account smoke requires separate authorization to read account context and consume usage. It remains NOT RUN. npm publication also requires separate authorization and is outside this GitHub release.
