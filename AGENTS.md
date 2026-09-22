# BeforeTibo implementation rules

## Read first

Read `SPEC.md`, `TASKS.md`, `ACCEPTANCE.md` and the schemas in `contracts/` before changing behavior. This repository starts as an implementation handoff, not a finished application. Keep schema, examples, tests and docs consistent.

## Product boundary

Build a local, bounded, single-worker Codex workflow runner. Ship three scoped recipes: repo-book, test-me-to-death, toolsmith-csv. Do not build a SaaS, arbitrary remote executor, unlimited agent loop or automatic publisher of user artifacts.

## Truth and billing

Never fabricate quota values, usage, test results, benchmark outcomes or publishing status. Mark all mock output as DEMO. Unknown is not zero. Local stop thresholds are not server-side billing caps. Do not add API-key fallbacks, auto-reset redemption, credit purchases, account rotation or rate-limit evasion.

Real runs require the user's approved account and spending/execution consent. Never read or copy credential file contents into the project. Public CI must work without personal Codex credentials or model calls.

## Files and execution

Preserve the user's original repository, commits, worktree and unrelated files. Use isolated snapshots for recipe work. A copy or Git worktree is not a process sandbox. If required sandbox protections are unavailable, block execution rather than granting full access.

Use argument arrays, explicit cwd, bounded subprocess output and timeouts. Never interpolate user paths into shell strings. Do not execute arbitrary validators or repository lifecycle scripts on the host. Restrict network and nonessential extensions according to verified platform capabilities.

## Validation and persistence

Agents propose candidates; the runner validates and promotes artifacts. Agents cannot edit policy, budgets, journals, fixed validators, baseline expectations or accepted artifacts. Required skipped checks do not pass.

Persist dispatch intent before starting a worker. Resume must not reset budgets or replay ambiguous dispatches. Harvesting, receipts and recovery must not depend on another model request. Deduplicate events and promotions.

## Engineering

Use TypeScript strict, Node.js 24, npm and a committed lockfile. Prefer small modules and explicit state transitions. Validate external JSON at runtime. Maintain offline mocks, fixtures and fault-injection tests. Do not replace meaningful tests with snapshots that only freeze accidental output.

Use a version compatibility matrix for Codex. Probe actual CLI capabilities and verify official docs; do not invent flags, methods, model IDs or action SHAs. Avoid deprecated automation shortcuts when explicit supported controls exist.

## Progress and completion

Maintain `docs/implementation-status.md` with completed work, commands actually run, failed or not-run checks and next actions. Keep useful code even if optional external integration is unavailable. Never claim “done” when only scaffolding or mock support exists.

Before declaring a milestone complete, run the relevant acceptance checks. Before release, run lint, typecheck, tests, contract tests, integration tests, build, demo smoke and package-install smoke.

## Publishing

Building-agent GitHub publishing authority is separate from product-worker permissions. Public publishing requires the confirmed owner/repository, visibility and copyright attribution. Never force-push, overwrite an existing remote, upload private source/logs/credentials or publish an npm package without authorization.

If public release conditions are missing, finish the local implementation and prepare a release draft. Report precise remaining blockers instead of claiming a successful upload.
