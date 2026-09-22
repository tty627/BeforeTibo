# Recipe protocol

Only the three packaged recipes are executable in this release. Adding an arbitrary local recipe is not an extension permission mechanism.

Each recipe has recipe.json and SKILL.md. JSON schema validation is followed by semantic checks: unique stages, existent and acyclic dependencies, finite unit caps, declared output scope, known validators, empty v1 validator parameters and capability intersection. A dependency requires at least one accepted unit in that stage.

The agent-result contract contains proposals only. The runner supplies the current unit, baseline and fixed expectations. Production source, existing tests/config/lockfile, budgets, journal and validators are protected. Never accept generated test results as runner evidence.

Required validators must execute and pass. Structural validation and executable validation are distinct. Reproductions require repeated fresh-copy execution and an independently supported expected behavior; failing tests alone are not confirmed bugs.

When changing a contract, synchronize TypeScript types, examples, recipes and positive/negative contract tests. Preserve docs/spec.md traceability. New executable validator types require a separate trust design and are outside v0.1.
