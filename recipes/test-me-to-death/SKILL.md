---
name: before-tibo-test-me-to-death
description: Add one meaningful, bounded set of tests to an approved single-package npm/Vitest snapshot after a passing baseline. Do not alter production code, existing tests, lockfiles or test configuration.
---

# Test Me to Death

## Goal

Strengthen one explicitly selected behavior with real assertions and a clear source for the expected behavior. Produce added tests and scenario documentation, not a self-declared success count.

## Required inputs

The runner provides a passing baseline report, supported project configuration, target module, stage/unit ID, allowed new-test paths, prior failure evidence and a finite attempt budget. If any requirement is missing, report a blocker instead of changing the project to bypass it.

## Work

For boundary-tests, choose relevant empty, malformed, extreme or repeated inputs. For state-tests, test explicit transitions such as retry after failure or cancellation. For property-tests, use only properties justified by the code's public contract and tools already approved by the runner.

Add tests only under `project/tests/before-tibo/` and put the behavior-to-test mapping in `out/test-me-to-death/scenarios.md`. Preserve existing source, tests, configuration, package files and expected values. Do not add skip/todo/focused-only shortcuts. Do not swallow exceptions, mock away the behavior under test or weaken expectations merely to get a green result.

The existing runner must actually discover and execute the new tests. Tests that cannot be discovered are not accepted. Do not install new dependencies or invoke unapproved commands to make them run.

## Failure

A failed test may indicate a bad test, disputed expectations, an unstable environment or a real behavior discrepancy. Distinguish these. Fix only the added test when the evidence supports the change. Never modify production code under this recipe.

For a possible behavior discrepancy, provide the minimal input, observed behavior, expected-behavior evidence and any limitations. Only the runner's separate reproduction checks can establish that it was reproduced. Do not call it a confirmed bug merely because a generated test is red.

## Finish

Return candidate test files and scenario documentation using the agent-result contract. The runner creates the patch from the actual diff, executes the fixed validation route and owns the final status. Do not edit validators or create fake test reports.
