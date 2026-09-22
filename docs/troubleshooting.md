# Troubleshooting

- **Node rejected:** select an actual Node 24 binary and verify node --version. A directory named node@24 is not evidence of its runtime version.
- **Codex unavailable:** demo, plan, status, harvest and export continue without Codex. Real run is blocked; it never switches to DEMO.
- **BLOCKED_CODEX_CONTEXT_UNVERIFIED:** the adapter cannot yet establish effective identity/extension isolation for your installed combination. Do not bypass the gate; consult codex-compatibility.md.
- **Sandbox unavailable:** generated code is not executed on the host. Check doctor output. Linux executable validators are not currently supported.
- **Dirty or uncommitted source:** commit/resolve changes yourself or select another clean committed repository. The tool does not stash, reset or make commits for you. Untracked files are excluded.
- **Vitest baseline missing/failing:** prepare supported local dependencies yourself, inspect baseline results and resolve existing failures before running. BeforeTibo does not install dependencies or edit configuration to make a green baseline.
- **Browser unavailable:** install the documented Playwright browser outside a task run. Required functional validation remains skipped until the backend works; it does not become accepted.
- **Interrupted run:** use resume. Saved candidates are validated without another generation. An ambiguous dispatch stays interrupted. Harvest always remains local.
- **Writer lock:** another live or uncertain owner prevents a second runner. Proven dead owners can be recovered conservatively. Do not blindly delete locks while a runner may still be active.
- **Journal corruption:** a truncated final record can be isolated during locked recovery. Corruption in the middle blocks replay. Preserve the run directory for inspection.
- **Expired budget:** resume cannot extend the original deadline or refund a dispatch. Harvest existing work and explicitly begin a new run if desired.
- **Export lacks files:** this is intentional. Generated guides and patches may contain private source; the public export contains only sanitized summary fields.
