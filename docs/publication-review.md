# Public content review

Recorded 2026-09-22 for the local v0.1.0-alpha.1 candidate. The review itself grants no publication permission; the maintainer subsequently authorized the exact public target and scope recorded below.

Current Git branch is `master`, with no existing commit or remote. The staged snapshot was inspected by category: application/adapter/validator code, contracts and synthetic tests, upstream public protocol/help captures, CSV template and fixtures, documentation and handoff specifications, package metadata/lockfile, CI and development scripts. The execution/admission paths, report/export boundaries, package allowlist, ignore rules, CI permissions and release notes received explicit diff review.

- Heuristic secret scanning covers current candidate files, the **actual staged blobs**, and all existing Git commits. A temporary synthetic regression confirmed that a staged-only match is found even when the working file is clean, and that a removed historical match is still found. The synthetic repository was deleted after the check.
- The actual project has no commits or remotes; its historical scan is correctly an empty-history check. The first commit and all later-to-push history must be checked again before publication.
- Search/review found no personal filesystem roots, real email addresses, real account responses, tokens, user snapshots or private logs among public candidate content. Synthetic emails use `example.invalid`; source fixtures describe synthetic examples. This is a bounded review, not a proof that arbitrary secrets are impossible.
- `npm pack --dry-run` was reviewed: 99 files, limited to compiled CLI/library, declarations, contracts, built-in Recipes, template/synthetic CSV resources, package metadata, READMEs and draft LICENSE. It contains no node_modules, run state, credentials, execution logs or real source snapshots.
- `.local/` holds the toolchain, test output, synthetic demonstration results and the locally built tarball and is excluded from Git. Runtime reports are never included just because they were used as development evidence.
- Initial `git diff --cached --check` reported only inherited trailing spaces in handoff Markdown and public CLI help capture; these were normalized. No specification statements or CLI options were removed. Recheck passed.
- CI has ordinary `pull_request`, `contents: read`, no secrets and verified full Action SHAs. macOS explicitly installs the declared browser dependency and requires executable validation; Linux tests unsupported-execution behavior. Remote CI results are **NOT RUN**.

LICENSE is an explicit local MIT draft pending attribution. GitHub owner/repository, public visibility/content scope and the prerelease target still require maintainer confirmation. After those inputs are supplied, inspect the final staged diff again, commit the approved content, scan that real commit history, and follow GITHUB_RELEASE.md. No npm publish, remote creation, push, tag or Release has occurred.

## Confirmed public candidate — 2026-09-22

Maintainer authorized **tty627/BeforeTibo**, public visibility, **MIT © 2026 tty627**, reviewed project-only content and v0.1.0-alpha.1. LICENSE and package metadata are finalized. Prior paragraphs describe the earlier pre-authorization checkpoint, not a current blocker.

Additional public content is restricted to the bilingual documentation, original hero/workflow artwork, image provenance and screenshots of the synthetic DEMOs. Image content was visually reviewed: DEMO labels remain visible; no user paths, private source, account data, personal quota or raw run logs appear. The CSV screenshot capture performed real file selection, comparison and JSON export, with exact expected-result verification. The harvest screenshot preserves unknown quota and pending human review.

Package Markdown links and images are now checked from the package file manifest; publishing evidence that is not in the package uses GitHub links. CI checks out full history for scanning. Before pushing, recheck final staged blobs, real commit history and the final package manifest. npm publication and actual account/model smoke remain outside the authorization.

Final post-documentation gate: nine commands PASS, package **111 files**; local Markdown/image destinations and installed repository/license metadata checked. Source scope remains the reviewed application and synthetic fixtures. The test configuration now prevents project test discovery from searching private local DEMO state. Initial scanning found **161 candidate files**, with no known secret matches.

Public repository and first two commits have been published only after staged/history scans. Both GitHub-hosted jobs in [run 35699251338](https://github.com/tty627/BeforeTibo/actions/runs/35699251338) passed complete-history scanning, package boundaries and the installation smoke. Remote README HTML references and asset existence were verified through GitHub's API; live browser visual inspection was unavailable and is not claimed.
