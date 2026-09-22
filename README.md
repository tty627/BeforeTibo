# BeforeTibo

**Spend the quota. Keep the work.**

A local CLI that gives one Codex worker a bounded job, independently checks what it makes, and saves the useful results with an offline report.

![BeforeTibo — turn a bounded work session into artifacts worth keeping](docs/assets/beforetibo-hero.png)

[中文](README.zh-CN.md) · [Quick start](#the-30-second-tour) · [Three recipes](#pick-something-worth-keeping) · [Safety](docs/security-model.md) · [Acceptance evidence](https://github.com/tty627/BeforeTibo/blob/master/docs/acceptance-results.md)

The name is a wink at the community’s [“Tibo, when reset?”](https://www.reddit.com/r/codex/comments/1venbdj/tibo_when_reset/) jokes. BeforeTibo has no inside information about resets. It does have a stop button, a work budget, and a place to put the results.

> **v0.1.0-alpha.1:** the local runner, synthetic demos and executable validators have been tested. Real Codex model tasks, account binding and live quota integration are **NOT RUN**. DEMO never calls Codex. This project has **not been published to npm**.

## The 30-second tour

First, install from source with **Node.js 24.x** and npm. Dependency installation needs registry access; it is separate from the tour.

```sh
git clone https://github.com/tty627/BeforeTibo.git
cd BeforeTibo
npm ci
npm run build
```

Then try the smallest complete loop. No Codex installation, login, model call or network connection is needed for this Repo Book demo:

```sh
node dist/cli.js demo
```

It creates a synthetic repository, produces a guide, runs the fixed checks, saves the accepted artifact, and prints the path to `harvest/index.html`. Open that file locally to see what passed and what was saved. The report is clearly marked **DEMO**.

The “30-second tour” is a quick introduction after setup, not a runtime guarantee. For the full command list:

```sh
node dist/cli.js --help
node dist/cli.js recipes list
```

## Pick something worth keeping

A **Recipe** is a scoped job with fixed permissions, expected files and acceptance checks. This alpha ships three:

| Recipe | Give it | Keep | What gets checked |
|---|---|---|---|
| **Repo Book** · `repo-book` | A clean, committed Git repository | A guide with source references to its modules, lifecycles and debugging paths | Source hashes, file and line references, protected inputs and safe report rendering |
| **Test Me to Death** · `test-me-to-death` | A supported single-package npm/Vitest project | A patch of new behavior tests, or a separately classified reproduction | A passing baseline, discovered assertion-bearing tests, actual isolated execution and unchanged production files |
| **Toolsmith: CSV Diff** · `toolsmith-csv` | An output parent directory | A complete offline tool for comparing two CSV files and exporting their differences | Fixed CSV expectations, actual browser interactions and denied external network access |

Repo Book references are checked; explanations still need human review. Test Me to Death adds tests without fixing production code or installing dependencies. CSV Diff is deliberately small: UTF-8 comma-separated files, headers, one unique key, matching columns, string comparisons, and limits of 5 MiB or 20,000 rows per input.

![Actual CSV Diff demo comparing the repository’s synthetic CSV fixtures](docs/assets/csv-demo.png)

*An actual browser screenshot of the accepted CSV DEMO tool, using this repository’s synthetic fixtures. No personal CSV data or live account values.*

### Try the other demos

On a [verified execution platform](docs/supported-environments.md), the source checkout already includes the test libraries. Prepare Chromium explicitly for the browser checks:

```sh
npx --no-install playwright install chromium
node dist/cli.js demo --recipe test-me-to-death
node dist/cli.js demo --recipe toolsmith-csv
```

Generation is synthetic; the test and browser validators really execute. A missing sandbox or browser blocks functional acceptance. The CSV demo keeps its accepted tool, then may stop with `no_progress` when the synthetic worker has no further improvement to make. That is an honest stopping point.

## The agent does not grade its own homework

![Workflow: plan, isolated snapshot, one bounded worker, fixed validation, saved artifacts and an offline harvest report; stop and resume preserve the budget](docs/assets/workflow.svg)

The worker proposes a candidate. The runner applies fixed checks and promotes only passing artifacts into protected storage. A required check that was skipped does not pass. Failed attempts and unfinished work remain visible in the report.

The **harvest** is a local HTML report and machine-readable receipt: what was accepted, which checks ran, what failed, what remains unfinished, and what the run used. It can be regenerated without another model request.

<details>
<summary>See an actual DEMO harvest report</summary>

![Actual local harvest report from the synthetic Test Me to Death demo](docs/assets/harvest-demo.png)

The data comes from a synthetic fixture run with real local validation. “Accepted” means the listed checks passed; it is not a claim of human approval or universal correctness.

</details>

## Run against your own project

Start with the compatibility check and a deterministic plan. Neither command starts a model task:

```sh
node dist/cli.js doctor --json
node dist/cli.js plan /path/to/repo --recipe repo-book
```

A real run uses **ChatGPT-managed Codex authentication**, sends approved context to Codex’s model service, and may consume credits. The CLI asks for execution and spending consent. Account identity, version compatibility, extension isolation and sandbox boundaries must also pass the runtime checks.

```sh
node dist/cli.js run /path/to/repo --recipe repo-book --preset gentle
node dist/cli.js run /path/to/repo --recipe test-me-to-death
node dist/cli.js run /path/to/output-parent --recipe toolsmith-csv
```

For non-interactive use, both `--ack-spend-risk` and `--ack-execution-risk` are required for that invocation. A configuration file cannot grant consent. A blocked real run never silently becomes a demo or switches to an API key. Read the [Codex compatibility matrix](docs/codex-compatibility.md) before attempting real execution; end-to-end model and live quota integration remain unverified.

### A budget, and an exit

The default `gentle` preset allows **4 dispatches over at most 20 minutes**, with one worker, a 600-second attempt timeout, up to two repairs and a 500 MiB disk stop threshold (periodic checks, not a filesystem hard quota). Each attempt and repair consumes a dispatch before the worker starts. `hard` and `tibo` increase the bounded work allowance; `tibo` is a preset, not a prophecy.

Press **Ctrl+C once** to stop scheduling and let current work drain within its limits. Press it **twice** to cancel immediately. From another terminal, replace `run-ID` with the ID printed by your run:

```sh
node dist/cli.js status run-ID --json
node dist/cli.js stop run-ID
node dist/cli.js stop run-ID --immediate
node dist/cli.js resume run-ID
node dist/cli.js harvest run-ID
node dist/cli.js open run-ID
```

`open` prints the local report path. Use the same `--state-dir` on every command if you chose a custom state directory. Resume preserves the original budget and deadline, recovers saved candidates locally, and never silently replays an uncertain dispatch. An expired run can still be recovered and harvested.

## Boundaries that matter

- **Your checkout stays yours.** Work happens in isolated snapshots of approved committed files. Dirty tracked files, symlinks and submodules are blocked; untracked files, known credential paths and auto-loaded agent configuration are excluded. The original checkout is not modified.
- **A copied folder is not a sandbox.** Required filesystem and task-network restrictions must be verified. Missing protection blocks execution. Generated code and repository validators are not run with unrestricted host access.
- **Local limits are not billing caps.** Dispatch counts, usage tokens and account quota are different quantities. Unknown is not zero. Quota scheduling requires verified account/worker binding and bucket mapping; stale or unverifiable data cannot silently fall back to bounded mode.
- **There is no quota magic.** No API-key fallback, credit purchase, reset redemption, account rotation or promise of zero extra charges. Other sessions can change the same account’s balance.
- **Private by default is still worth checking.** Runs live under `~/.before-tibo/runs/`. BeforeTibo uploads no telemetry, but real model execution sends approved context to Codex. Keep run directories out of Git, and review generated code before opening it.

To share a summary, export into a new directory:

```sh
node dist/cli.js export run-ID --output /path/to/new-export-directory
```

The export is a sanitized summary. It excludes source-bearing guides, patches, raw logs, identities and quota history. Generated tools stay separate from the script-free harvest report.

## What is verified in this alpha?

| Area | Current evidence |
|---|---|
| Local runner, persistence, stop/resume, reports and package installation | Exercised with synthetic fixtures and fault-injection tests |
| Executable validators | Verified on macOS 26.5.2 arm64 with Node 24.21.0 and the documented sandbox/browser versions |
| Codex CLI 0.154.0 | Help, generated protocol, effective configuration and harmless sandbox probes verified |
| Real Codex model tasks, account binding and live quota | **NOT RUN**; conditional runtime gates do not substitute for end-to-end evidence |
| Linux | Structural/offline checks; executable sandbox backend not implemented |
| Windows / WSL2 | Not validated; no support claim |

See the [full environment matrix](docs/supported-environments.md), [acceptance results](https://github.com/tty627/BeforeTibo/blob/master/docs/acceptance-results.md), [implementation log](https://github.com/tty627/BeforeTibo/blob/master/docs/implementation-status.md) and [release readiness](https://github.com/tty627/BeforeTibo/blob/master/RELEASE_READINESS.md). Required skipped checks are reported as such.

Test Recipe inputs currently require a single npm package, a committed lockfile, a dedicated Vitest config, and prepared **Vitest 4.1.11 / Vite 7.x** dependencies. CSV validation uses **Playwright 1.63.0** and its Chromium. Setup is explicit; task runs never install these for you. Other Node major versions are rejected, and new Codex versions need fresh verification.

## Develop or package locally

```sh
npm run lint
npm run typecheck
npm test
npm run test:contracts
npm run test:integration
npm run build
npm run demo:smoke
npm run test:pack
npm run scan:secrets
```

Normal CI uses synthetic fixtures without personal credentials or model calls. To build an installable local tarball:

```sh
npm pack
# In a separate project:
npm install /absolute/path/to/before-tibo-0.1.0-alpha.1.tgz
```

Tarball users who need CSV checks must explicitly install `playwright@1.63.0` in that project and run `npx --no-install playwright install chromium`. The installed Repo Book demo and offline harvest do not need those browser dependencies.

Contributions that improve verified behavior are welcome. This alpha is scoped to three recipes and one worker; SaaS hosting, arbitrary remote execution, unlimited loops and automatic publication are outside its scope.

[Architecture](docs/architecture.md) · [Security model](docs/security-model.md) · [Troubleshooting](docs/troubleshooting.md) · [Contributing](CONTRIBUTING.md) · [Release process](docs/releasing.md)

---

[MIT](LICENSE) © 2026 tty627. User inputs and third-party code retain their own licenses.

BeforeTibo is an independent community project, not affiliated with or endorsed by OpenAI or any individual.
