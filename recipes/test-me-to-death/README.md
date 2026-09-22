# Test Me to Death

This alpha supports one npm JavaScript/TypeScript package with a committed lockfile, a dedicated Vitest configuration, locally prepared Vitest 4.1.11 dependencies and Vite 6.1+ or 7.x. Monorepos, other package managers, missing dependencies and configurations that exclude `tests/before-tibo/` are blocked. BeforeTibo does not install dependencies or invoke npm lifecycle scripts.

The runner executes the original baseline in a new read-only source copy, under a probed sandbox with network access denied. A fixed synthetic discovery test checks that the approved output directory is discovered by the existing configuration. The worker can then add tests and scenario notes. Source files, original tests, package metadata and configuration remain protected by hashes and sandbox write rules.

Validation starts from another fresh copy. It executes the full suite, requires real assertions, rejects skipped added tests, checks that the original passing cases remain, and creates the Git patch itself. The patch is never applied to the user's project. A green exit code alone is insufficient. Broad mocking, dynamic code construction and explicit process termination in added tests are outside this alpha's supported scope.

The generated artifact contains new tests, `scenarios.md`, `tests.patch` and `validation.json`. Checks establish only the reported behavior; human review remains necessary. Repeated failures are classified separately as reproduced behavior differences, not automatically as bugs or fixes. No real Codex generation result is implied by offline fixture validation.

On platforms without a verified sandbox backend, executable validation is blocked. Structural checks and other recipes remain available. Native Windows and Linux execution support are not claimed by this alpha.
