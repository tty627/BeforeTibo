# Security model

BeforeTibo is intended for repositories the local user owns or is authorized to process. It is not a hostile multi-tenant code hosting platform.

- The original repository is not modified. Input is bounded committed Git content, filtered before reading blobs. Untracked files are excluded. Tracked changes, submodules and symlinks are rejected.
- Source control-plane files, credentials, private keys, generated/vendor trees and environment files are excluded. Git metadata, hooks and remotes are not copied.
- Relative paths undergo portable syntax, symlink and realpath boundary checks. Prefix matching is insufficient. Candidate paths are rechecked during promotion and integrity reads.
- A snapshot is not a sandbox. Executable validators require actual successful inside-write/outside-write/private-read/network denial probes. macOS Seatbelt is currently implemented; unsupported platforms block executable validators. No full-access fallback.
- Generated tests and browser tools run in fresh disposable validation copies. Runner-owned expectations and manifests are not writable by the worker. No arbitrary recipe validator commands.
- CLI subprocesses use argument arrays, shell:false, bounded output, finite timeout, restricted environment and owned process-group cancellation. Persisted stale PIDs are never killed on resume.
- Raw model reasoning, complete upstream streams and credential contents are not collected. Runtime summaries are redacted before journal writes. Public exports use an allowlist, not an optional regex switch.
- Report HTML uses escaped text and a restrictive CSP. It never embeds generated tool HTML. Tool files are separate and require user review.

Limits: semantic explanations and test relevance still require human review. Secret detection is heuristic and cannot prove arbitrary source is free of secrets. Local macOS sandbox machinery and browser versions can change; runtime probes must continue to pass. A verified local policy is not a service-side billing guarantee. Real exec context isolation remains separately gated; see codex-compatibility.md.
