# Contributing

Use Node 24 and npm ci. Run lint, typecheck, tests, contract/integration tests, build, demo smoke and package smoke before submitting changes. Normal tests must use synthetic fixtures and must not call a real model. Label DEMO data clearly.

Read AGENTS.md, docs/spec.md and ACCEPTANCE.md. Add behavioral tests for state, recovery, budgets and security changes. Update contracts, examples, recipes and docs together. Record actual commands and limitations in docs/implementation-status.md. Do not replace a required skipped validator with a passing result.

Never include credentials, private source, raw run logs, account history or local state directories. Explain the concrete change, relevant tests and support limitations in your PR. A real smoke test requires separate account/spending consent and sanitized evidence.
