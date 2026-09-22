# Codex compatibility

Checked 2026-09-22. This matrix separates non-billing protocol verification, offline tests and real account integration.

| Codex | Environment | Evidence | Real exec / recipes | Real quota |
|---|---|---|---|---|
| 0.154.0 | macOS arm64, local CLI | Actual help and generated protocol; actual metadata-only isolation checks; all three Recipe sandbox probes passed; synthetic JSONL/RPC, identity, usage and quota tests | Model execution NOT RUN; real invocation is conditionally available after explicit consent, account binding and repeatable preflight | Real quota NOT RUN; enabled only when backend metadata confirms the selected model and required buckets |
| Other versions | Any | No verified fixture | BLOCKED until capability and protocol tests are added | BLOCKED |

## Implemented boundary

`probeCodex` runs version/help checks without reading credential files or starting a model. A successful help probe is not execution authorization. `CodexExecAdapter` uses argument arrays, an explicit working directory, a stdin prompt, JSONL, an output schema and an ephemeral session. The production preflight supplies a named permission profile, `approval_policy="never"`, disabled task network access, and an allowlist of three fixed shell environment values. It does not use approval bypass, automatic reviewers, API-key fallbacks, full-access sandboxing, account resets or automatic credit purchase.

`prepareRealExecution` requires both execution/spending acknowledgements and rejects a zero-incremental-charge requirement. It forces ChatGPT authentication and the built-in OpenAI provider, rejects ambient provider credential variables without reading their values, and retains the user's existing authentication context. It never reads, copies or writes credential files. API authentication, alternate endpoints, custom OpenAI providers, unknown identity and non-null managed requirements fail closed. Managed requirements need a separately verified implementation rather than being silently overridden.

Isolation is established through fresh metadata-only App Server processes. They permit only initialization, `config/read`, `configRequirements/read`, `skills/list`, and, for explicitly acknowledged real execution, `account/read` with `refreshToken:false` and `account/rateLimits/read`. They never create a thread or turn. A first pass discovers MCP server names and skill paths; a fresh pass verifies explicit disables for every discovered entry and all unsupported tool/extension features. Raw configuration, account email and rate-limit responses are not persisted. Owned process groups are terminated on close, errors or bounded timeouts.

Local inspection established that `features.skip_host_skill_discovery=true` still leaves local skills enabled and `mcp_servers={}` does not clear inherited MCP entries. Production therefore uses per-entry disables, then verifies effective configuration and skill metadata. On this installation, **8 skills and 3 MCP entries** were disabled and verified. MCP names containing unsupported dotted override syntax fail closed. The worker loads these controlled overrides using `--strict-config` and `--ignore-rules`; it does **not** use `--ignore-user-config`, because partial MCP overrides require the underlying server definitions. Project instructions are disabled with `project_doc_max_bytes=0` and empty developer instructions.

The named `before-tibo-v010` permission profile denies the filesystem by default, permits standard runtime reads, and grants writes only inside the isolated attempt. Its `project/` snapshot is read-only; only test-me-to-death can write the initially absent `project/tests/before-tibo/` directory. Legacy `sandbox_mode`, `sandbox_workspace_write` and the `--sandbox` flag can override named profiles, so the production path rejects inherited legacy settings and does not combine those controls. A real, non-model `codex sandbox --permission-profile ... --include-managed-config` probe verifies inside writes, denied outside writes and private-file reads, protected baseline files, the Recipe-specific test directory, and denied external network access. All three Recipe probes passed locally. A copy/worktree is not a process sandbox.

The account workspace ID and account member are bound to hashed execution identity. Configuration is also hashed; model, reasoning, service-tier or other effective configuration changes stop dispatches. Before each model process, preflight resolves configuration and skills at the **actual attempt directory** and rejects differences or newly enabled extensions. The runner's periodic check refreshes account/quota observations and stops on changes. These checks do not establish a server-side spend cap or prevent another application from consuming quota.

`doctorExecutionContext` separately checks configuration isolation and the synthetic sandbox probe. It requires no execution consent, does not read account metadata, and reports no account identity, raw configuration paths or credentials. A verified doctor result means these local boundaries passed; it is not a real-model integration result.

The adapter returns an untrusted **candidate** only after process success and candidate-schema validation. Runner-owned validators determine acceptance. The adapter discards raw stdout/stderr instead of saving reasoning, source snippets or shell arguments. Stream sizes, line sizes, duration and cancellation are bounded by the common process executor.

## Quota observer

The standalone stdio observer performs initialize/initialized handshake, then permits only `account/read` with `refreshToken:false` and `account/rateLimits/read`. Requests are correlated by ID and time out. Unknown server requests are rejected; no network listener is created. Observer startup requires an approved, isolated configuration context. The real CLI path performs these reads through the preflight metadata connection after verifying its explicit configuration controls.

Account responses are not persisted. Account IDs and member identities are hashed and must match the separately verified execution context. A quota mapping is accepted only when the requested bucket explicitly names the configured model through backend metadata or its exact identifier. Generic `codex` buckets are not assumed to cover arbitrary models; quota mode stays blocked when mapping is unknown. All relevant windows must contain valid percentages and duration/reset metadata; null values remain unavailable. Stale observations, changed cycles, balance increases, missing windows and reached reserves stop new dispatches and request active work cancellation. Other sessions can change account-wide observations. Thresholds are soft scheduling boundaries, never billing caps.

## Usage semantics

For this adapter, exec `turn.completed.usage` is a completed-turn total. Repeated turn/event IDs replace or deduplicate observations. App Server `thread/tokenUsage/updated.tokenUsage.total` is cumulative and takes precedence over turn totals; the two are never added. Cached input is included in input and reasoning output is not added to output. Missing fields remain null. Interrupted or missing terminal usage is partial.

## Sources and fixture provenance

- [Official non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode): explicit sandbox, stdin/JSONL/structured outputs, ignore flags and deprecated shortcut warning.
- [Official App Server documentation](https://learn.chatgpt.com/docs/app-server): handshake, stdio transport, account/rate-limit reads and generated protocol.
- [Official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference): approval policy, shell environment and workspace network policy.
- [Official permissions documentation](https://learn.chatgpt.com/docs/permissions): named filesystem/network permissions and the non-composable legacy sandbox controls.
- [Official skills documentation](https://learn.chatgpt.com/docs/build-skills): per-skill disable configuration.
- `tests/fixtures/codex/0.154.0/README.md`: each file is explicitly identified as actual non-billing help/schema output or synthetic DEMO data.

No real model, balance, account or credential data was collected for these fixtures. Non-billing doctor/configuration/sandbox probes were actually run; real account binding, model execution, worker-to-quota identity smoke and real-recipe smoke are **NOT RUN**. Windows and Linux execution boundaries remain **NOT VERIFIED**. No blanket `codex >= version` support claim is made.
