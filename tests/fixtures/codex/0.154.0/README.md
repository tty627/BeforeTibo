# Codex 0.154.0 fixture provenance

- `exec-help.txt`: actual local `codex exec --help` output, captured 2026-09-22; no model or account read.
- `GetAccountResponse.json`, `GetAccountRateLimitsResponse.json`, `GetAccountParams.json`, `InitializeParams.json`: unmodified public protocol schemas emitted by local `codex app-server generate-json-schema --out <temporary-directory>`, version 0.154.0. They contain schema definitions, not account responses or credentials.
- `ConfigReadParams.json`, `ConfigReadResponse.json`, `ConfigRequirementsReadResponse.json`, `SkillsListParams.json`, `SkillsListResponse.json`: actual generated public protocol schemas from the same CLI version, captured 2026-09-22 for metadata-only isolation preflight. No real configuration values, skill paths or server definitions are included.
- `synthetic-exec.jsonl`: hand-authored DEMO stream modeled on official exec documentation. Token values and thread IDs are synthetic. This is not real model integration evidence.
- Unit tests use synthetic account identifiers, models, windows and usage. No real balance or authentication material is included.
