# Supported environments and observed evidence

Recorded 2026-09-22. This matrix distinguishes non-model integration from a real model task.

| Component | Actual version/environment | Evidence / status |
|---|---|---|
| Node | 24.21.0, arm64 | Build, unit/contracts/integration, CLI demo and package installation executed |
| Host | macOS 26.5.2 (25F84), arm64 | Manual local execution |
| Git | 2.51.0 | Temporary committed fixtures, snapshots and patch apply checks |
| Codex CLI | 0.154.0 | Actual help, public generated protocol, effective config and native sandbox harmless probes verified |
| Codex model tasks | No actual model selected/dispatched during development | NOT RUN, requires separate account and spending authorization |
| Real account / quota | No personal account quota used as a test fixture | NOT RUN; supported only when runtime binding/mapping gates pass |
| Validator sandbox | macOS Seatbelt | Actual inside-write, outside-write denial, private-read denial and external network denial probes passed |
| Test Recipe | Vitest 4.1.11 / Vite 7.3.6 / single npm package | Real synthetic baseline/addition/reproduction executions inside sandbox passed |
| CSV browser | Playwright 1.63.0 / Chromium 153 | Actual isolated functional browser suite passed; see csv-validation.md |
| Linux | Offline structural implementation; CI configured | Remote CI NOT RUN. Executable sandbox backend not implemented; execution is BLOCKED |
| Windows / WSL2 | Not validated | No support claim |

The `node@24` Homebrew path on the development host resolved to Node 25.8.0; an isolated genuine Node 24.21.0 was used for supported-line tests. Other Node majors are explicitly rejected.

Do not interpret Codex 0.154.0 protocol/config probes as a successful real worker or billing integration. New upstream versions are blocked until their capabilities and fixtures are verified. No broad `codex >= x` guarantee is made.

A missing browser or sandbox produces a required skipped/blocked validation, never functional acceptance. Package users must explicitly prepare optional validation dependencies. Ordinary CI never uses a logged-in account.
