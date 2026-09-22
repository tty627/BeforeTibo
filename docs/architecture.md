# Architecture

The CLI parses a strict RunConfig, performs read-only preflight and obtains invocation-specific consent. The deterministic planner creates finite units from the built-in recipe. The runner persists a dispatch intent before every worker start. Both the synthetic worker and real exec wrapper implement the same Worker interface.

Workers return untrusted agent-result JSON. Structural validators check scope, protected source hashes, required files and recipe-specific evidence. Executable validators use a fresh copy and the verified sandbox backend. The runner alone writes manifests, journal, budgets and reports. Required skipped checks cannot pass.

Artifacts are copied into runner-owned staging, hashed, validated against the artifact contract and atomically renamed. Promotion identity includes run, unit, attempt and file hashes. Journal replay and immutable manifests are recovery authorities; state.json is a cache. A single writer lock and serialized append protect state transitions.

An ambiguous dispatch is never automatically replayed. Resume keeps the original deadline and budget. Offline harvest renders a structured receipt, Markdown summary and script-free HTML. The terminal reads the same state. Export uses a public-field allowlist and omits private artifact content.

Modules: core/contracts + state + runner + budget; storage/journal + artifacts; workspace; sandbox; adapters/codex and mock; validators; harvest; ui.
