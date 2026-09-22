import { mkdir, readFile, realpath, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { RunHooks } from '../core/runner.js';
import type { SourceManifest } from '../core/worker.js';
import type { ValidationResult } from '../core/types.js';
import { executeSandboxed, probeSandbox, type ProcessResult } from '../sandbox/index.js';
import { assertSafeRelativePath, captureProtectedFiles, resolveSafePath, verifyProtectedFiles } from '../workspace/index.js';
import { check, walkFiles } from './structural.js';

export interface VitestProject { version: string; dependencyRoot: string; executable: string; config: string }
export interface TestAssertion { name: string; status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo'; failure_hash?: string }
export interface TestSuite { path: string; assertions: TestAssertion[] }
export interface VitestRun {
  version: string;
  exit_code: number | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  suites: TestSuite[];
  completed: boolean;
  passed_checks: boolean;
  reason: string;
  network: 'denied';
}
export class VitestBlockedError extends Error {
  constructor(message: string) { super(`BLOCKED_VITEST: ${message}`); this.name = 'VitestBlockedError'; }
}
async function exists(filename: string) { try { await lstat(filename); return true; } catch { return false; } }
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export async function inspectVitestProject(source: string): Promise<VitestProject> {
  const root = await realpath(source);
  const file = await resolveSafePath(root, 'package.json', { mustExist: true });
  const pkg: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new VitestBlockedError('Invalid package.json');
  const manifest = pkg as Record<string, unknown>;
  if (manifest.workspaces || (typeof manifest.packageManager === 'string' && !manifest.packageManager.startsWith('npm@'))) throw new VitestBlockedError('Only a single npm package is supported');
  for (const marker of ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'lerna.json', 'vitest.workspace.ts', 'vitest.workspace.js']) if (await exists(path.join(root, marker))) throw new VitestBlockedError('Monorepos and alternate package managers are unsupported');
  if (!await exists(path.join(root, 'package-lock.json'))) throw new VitestBlockedError('A committed npm package-lock.json is required');
  const configs = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cts', 'vitest.config.cjs'];
  const config = (await Promise.all(configs.map(async (name) => await exists(path.join(root, name)) ? name : null))).find((name) => name !== null);
  if (!config) throw new VitestBlockedError('An existing dedicated Vitest configuration is required');
  const dependencyRoot = await realpath(path.join(root, 'node_modules')).catch(() => { throw new VitestBlockedError('Local dependencies are missing; no installation was attempted'); });
  const vitestManifest: unknown = JSON.parse(await readFile(path.join(dependencyRoot, 'vitest/package.json'), 'utf8').catch(() => { throw new VitestBlockedError('Local Vitest dependency is missing'); }));
  const version = (vitestManifest as Record<string, unknown>).version;
  if (version !== '4.1.11') throw new VitestBlockedError('This alpha validates only the Vitest 4.1.11 CLI protocol');
  const viteManifest = JSON.parse(await readFile(path.join(dependencyRoot, 'vite/package.json'), 'utf8')) as { version?: unknown };
  if (typeof viteManifest.version !== 'string' || !/^(?:6\.(?:[1-9]\d*)\.|7\.)/u.test(viteManifest.version)) throw new VitestBlockedError('Vite 6.1+ or 7.x is required for the config runner');
  return { version, dependencyRoot, executable: await realpath(path.join(dependencyRoot, 'vitest/vitest.mjs')), config };
}

/** Parse and cross-check reporter counters instead of trusting a green process exit. */
export function parseVitestReport(stdout: string, processResult: Pick<ProcessResult, 'exitCode' | 'timedOut' | 'cancelled' | 'outputTruncated'>, version: string, projectRoot: string): VitestRun {
  const empty = (reason: string): VitestRun => ({ version, exit_code: processResult.exitCode, total: 0, passed: 0, failed: 0, skipped: 0, suites: [], completed: false, passed_checks: false, reason, network: 'denied' });
  if (processResult.timedOut || processResult.cancelled || processResult.outputTruncated) return empty('Execution was interrupted, timed out, or exceeded bounded output');
  let raw: unknown;
  try { raw = JSON.parse(stdout.trim()); } catch { return empty('Missing or invalid structured Vitest report'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty('Invalid Vitest report');
  const report = raw as Record<string, unknown>;
  if (!Array.isArray(report.testResults)) return empty('Vitest report has no test suites');
  const suites: TestSuite[] = [];
  for (const value of report.testResults) {
    if (!value || typeof value !== 'object') return empty('Invalid test suite');
    const suite = value as Record<string, unknown>;
    if (typeof suite.name !== 'string' || !Array.isArray(suite.assertionResults)) return empty('Invalid assertion list');
    const relative = path.relative(projectRoot, suite.name).split(path.sep).join('/');
    try { assertSafeRelativePath(relative); } catch { return empty('Test suite escaped the isolated project'); }
    const assertions: TestAssertion[] = [];
    for (const item of suite.assertionResults) {
      if (!item || typeof item !== 'object') return empty('Invalid assertion');
      const assertion = item as Record<string, unknown>;
      if (typeof assertion.fullName !== 'string' || typeof assertion.status !== 'string' || !['passed', 'failed', 'pending', 'skipped', 'todo'].includes(assertion.status)) return empty('Unrecognized assertion result');
      const failures = Array.isArray(assertion.failureMessages) ? assertion.failureMessages.filter((message): message is string => typeof message === 'string') : [];
      assertions.push({ name: assertion.fullName.slice(0, 500), status: assertion.status as TestAssertion['status'], ...(failures.length ? { failure_hash: sha256(failures.join('\n').replaceAll(projectRoot, '<project>')) } : {}) });
    }
    suites.push({ path: relative, assertions });
  }
  const assertions = suites.flatMap((suite) => suite.assertions);
  const passed = assertions.filter((test) => test.status === 'passed').length;
  const failed = assertions.filter((test) => test.status === 'failed').length;
  const skipped = assertions.length - passed - failed;
  if (report.numTotalTests !== assertions.length || report.numPassedTests !== passed || report.numFailedTests !== failed || typeof report.success !== 'boolean') return empty('Reporter counters do not match actual listed tests');
  const okay = processResult.exitCode === 0 && report.success && assertions.length > 0 && passed > 0 && failed === 0;
  return { version, exit_code: processResult.exitCode, total: assertions.length, passed, failed, skipped, suites, completed: true, passed_checks: okay, reason: okay ? 'Tests executed and passed the listed checks' : 'Nonzero exit, failing tests, or no executed passing tests', network: 'denied' };
}

async function copyBaseline(sourceRoot: string, output: string, source: SourceManifest): Promise<void> {
  await mkdir(output, { mode: 0o700 });
  for (const file of source.files) {
    const bytes = await readFile(await resolveSafePath(sourceRoot, file.path, { mustExist: true }));
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.size_bytes) throw new VitestBlockedError('Protected baseline hash mismatch');
    const destination = await resolveSafePath(output, file.path);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 }); await writeFile(destination, bytes, { flag: 'wx', mode: 0o400 });
  }
}

async function executeTests(projectRoot: string, project: VitestProject, timeoutMs: number, requireAssertions: boolean, readonlyDependencyLinks:Map<string,string>, signal?:AbortSignal): Promise<VitestRun> {
  signal?.throwIfAborted();
  const deps = path.join(projectRoot, 'node_modules');
  if (await exists(deps)) throw new VitestBlockedError('Baseline must not include node_modules');
  readonlyDependencyLinks.set(path.resolve(deps),project.dependencyRoot);
  await symlink(project.dependencyRoot, deps, 'dir');
  const scratch = path.join(projectRoot, '.before-tibo-validator-tmp'); await mkdir(scratch, { mode: 0o700 });
  try {
    const args = [project.executable, 'run', '--config', project.config, '--configLoader=runner', '--reporter=json', '--no-cache', '--pool=threads', '--maxWorkers=1', '--no-file-parallelism', ...(requireAssertions ? ['--expect.requireAssertions'] : [])];
    const result = await executeSandboxed({ command: process.execPath, args, cwd: projectRoot, readableRoots: [project.dependencyRoot], writableRoots: [scratch], timeoutMs, maxOutputBytes: 1024 * 1024, signal, env: { CI: '1', NO_COLOR: '1', TMPDIR: scratch } });
    signal?.throwIfAborted();
    return parseVitestReport(result.stdout, result, project.version, await realpath(projectRoot));
  // Keep the exact trusted link identity until this run's hooks are released: a disk poll may have
  // observed it immediately before unlink. Unique validation directory names prevent path reuse.
  } finally { await rm(deps); await rm(scratch, { recursive: true, force: true }); }
}

export function newFilesPatch(files: Readonly<Record<string, string>>): string {
  return Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([filename, content]) => {
    assertSafeRelativePath(filename);
    const lines = content.split('\n'); const newline = lines.at(-1) === ''; if (newline) lines.pop();
    return `diff --git ${JSON.stringify(`a/${filename}`)} ${JSON.stringify(`b/${filename}`)}\nnew file mode 100644\n--- /dev/null\n+++ ${JSON.stringify(`b/${filename}`)}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}\n`).join('')}${newline ? '' : '\\ No newline at end of file\n'}`;
  }).join('');
}

export function createVitestHooks(options: { sourcePath: string; timeoutMs?: number }): RunHooks {
  let runDirectory: string | undefined;
  let sourceManifest: SourceManifest | undefined;
  let project: VitestProject | undefined;
  let baseline: VitestRun | undefined;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const readonlyDependencyLinks=new Map<string,string>();
  return {
    readonlyDependencyLinks,
    async prepare(runDir, _meta, source,signal) {
      const probe = await probeSandbox(); if (!probe.available) throw new VitestBlockedError(probe.reason);
      project = await inspectVitestProject(options.sourcePath); runDirectory = runDir; sourceManifest = source;
      if (source.files.some((file) => file.path.startsWith('tests/before-tibo/'))) throw new VitestBlockedError('The reserved tests/before-tibo directory already exists in the baseline');
      const root = path.join(runDir, `baseline-check-${randomUUID()}`);
      await copyBaseline(path.join(runDir, 'source'), root, source);
      try { baseline = await executeTests(root, project, timeoutMs, false,readonlyDependencyLinks,signal); } finally { await rm(root, { recursive: true, force: true }); }
      await writeFile(path.join(runDir, 'baseline-vitest.json'), `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o600 });
      if (!baseline.passed_checks) throw new VitestBlockedError(`Baseline did not pass: ${baseline.reason}`);
      // A fixed synthetic test proves the authorized new directory is actually discovered.
      const discoveryRoot = path.join(runDir, `discovery-check-${randomUUID()}`);
      await copyBaseline(path.join(runDir, 'source'), discoveryRoot, source);
      await mkdir(path.join(discoveryRoot, 'tests/before-tibo'), { recursive: true });
      const testExtension = source.files.map((file) => /\.(?:test|spec)\.([cm]?[jt]sx?)$/u.exec(file.path)?.[1]).find(Boolean) ?? 'js';
      const sentinel = `tests/before-tibo/__before_tibo_discovery__.test.${testExtension}`;
      await writeFile(path.join(discoveryRoot, sentinel), 'import { test, expect } from "vitest"; test("BeforeTibo fixed discovery probe", () => { expect(1).toBe(1); });\n');
      let discovery: VitestRun;
      try { discovery = await executeTests(discoveryRoot, project, timeoutMs, false,readonlyDependencyLinks,signal); } finally { await rm(discoveryRoot, { recursive: true, force: true }); }
      if (!discovery.passed_checks || !discovery.suites.some((suite) => suite.path === sentinel && suite.assertions.some((test) => test.status === 'passed'))) throw new VitestBlockedError('Existing Vitest discovery excludes the authorized added-test directory');
    },
    async validate(job, result,signal): Promise<ValidationResult[]> {
      const baselineCheck = check('vitest-baseline', baseline?.passed_checks ? 'passed' : 'skipped', baseline?.passed_checks ? `${baseline.passed} baseline tests passed; ${baseline.skipped} skipped` : 'A verified baseline is required before executing candidates');
      if (!baseline?.passed_checks || !project || !runDirectory || !sourceManifest) return [baselineCheck, check('vitest-added-tests', 'skipped', 'Baseline preparation has not completed')];
      try {
        if (result.artifact_candidates.length !== 1 || !['test_patch', 'reproduction'].includes(result.artifact_candidates[0]?.kind ?? '')) throw new Error('One test_patch or reproduction candidate is required');
        const protectedCheck = await verifyProtectedFiles(path.join(job.workspace, 'project'), sourceManifest); if (!protectedCheck.passed) throw new Error('Candidate modified protected baseline files');
        const all = await walkFiles(job.workspace);
        const newPaths = all.filter((file) => /^project\/tests\/before-tibo\/.+\.test\.(?:[cm]?[jt]sx?)$/u.test(file));
        if (!newPaths.length || newPaths.length > 20) throw new Error('Candidate must contain between 1 and 20 new test files');
        const candidate = result.artifact_candidates[0]!;
        if (newPaths.some((file) => !candidate.paths.includes(file))) throw new Error('All added tests must be listed in the candidate');
        const scenarios = await readFile(await resolveSafePath(job.workspace, 'out/test-me-to-death/scenarios.md', { mustExist: true }), 'utf8');
        if (scenarios.trim().length < 30) throw new Error('Scenarios must explain behaviors, expected outcomes and limitations');
        const additions: Record<string, string> = {};
        for (const filename of newPaths) {
          const text = await readFile(await resolveSafePath(job.workspace, filename, { mustExist: true }), 'utf8');
          if (text.length > 256 * 1024 || !/\bexpect\s*(?:\(|\.)/u.test(text)) throw new Error('Every new test file needs explicit assertions and bounded size');
          if (/\b(?:vi|vitest)\.(?:mock|doMock|stubGlobal)\s*\(|\bprocess\.(?:exit|kill)\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/u.test(text)) throw new Error('Broad mocking, process termination and dynamic code construction are unsupported in added tests');
          additions[filename.slice('project/'.length)] = text;
        }
        const pinned = await captureProtectedFiles(job.workspace, newPaths);
        if(pinned.some(file=>sha256(additions[file.path.slice('project/'.length)]!)!==file.sha256))throw new Error('Candidate changed while constructing the stable validation copy');
        const validateFreshCopy = async (): Promise<VitestRun> => {
          const validationRoot = path.join(runDirectory!, `added-check-${randomUUID()}`);
          await copyBaseline(path.join(runDirectory!, 'source'), validationRoot, sourceManifest!);
          for (const [filename, text] of Object.entries(additions)) { const output = await resolveSafePath(validationRoot, filename); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, text, { flag: 'wx', mode: 0o400 }); }
          try { return await executeTests(validationRoot, project!, Math.min(timeoutMs,job.timeoutMs), true,readonlyDependencyLinks,signal); } finally { await rm(validationRoot, { recursive: true, force: true }); }
        };
        const incremental = await validateFreshCopy();
        if (!(await verifyProtectedFiles(job.workspace, pinned)).passed) throw new Error('Candidate changed during independent validation');
        const discovered = Object.keys(additions).every((file) => incremental.suites.some((suite) => suite.path === file && suite.assertions.length > 0 && suite.assertions.every((test) => test.status === 'passed')));
        const originalAssertions = baseline.suites.flatMap((suite) => suite.assertions.filter((test) => test.status === 'passed').map((test) => `${suite.path}\0${test.name}`));
        const current = new Set(incremental.suites.flatMap((suite) => suite.assertions.filter((test) => test.status === 'passed').map((test) => `${suite.path}\0${test.name}`)));
        if (candidate.kind === 'reproduction') {
          const expectationPath = 'out/test-me-to-death/expectation.json';
          if (!candidate.paths.includes(expectationPath)) throw new Error('Reproduction must include a source-grounded expectation.json');
          const expectation: unknown = JSON.parse(await readFile(await resolveSafePath(job.workspace, expectationPath, { mustExist: true }), 'utf8'));
          if (!expectation || typeof expectation !== 'object' || Array.isArray(expectation)) throw new Error('Invalid reproduction expectation');
          const basis = expectation as Record<string, unknown>;
          const sourceFile = sourceManifest.files.find((file) => file.path === basis.source_path);
          if (!sourceFile || basis.source_sha256 !== sourceFile.sha256 || typeof basis.expected_behavior !== 'string' || basis.expected_behavior.trim().length < 20 || typeof basis.line_start !== 'number' || !Number.isSafeInteger(basis.line_start) || typeof basis.line_end !== 'number' || !Number.isSafeInteger(basis.line_end)) throw new Error('Expectation must identify a source hash, valid line range and concrete expected behavior');
          const sourceText = await readFile(await resolveSafePath(path.join(runDirectory, 'source'), sourceFile.path, { mustExist: true }), 'utf8');
          const lines = sourceText.split('\n');
          if (basis.line_start < 1 || basis.line_end < basis.line_start || basis.line_end > lines.length) throw new Error('Expectation cites an invalid source line range');
          if (basis.basis_excerpt !== lines.slice(basis.line_start - 1, basis.line_end).join('\n')) throw new Error('Expectation excerpt does not match the cited source');
          const repeat = await validateFreshCopy();
          const repeatedPassing = new Set(repeat.suites.flatMap((suite) => suite.assertions.filter((test) => test.status === 'passed').map((test) => `${suite.path}\0${test.name}`)));
          const reproduced = assessReproduction(incremental, repeat, basis.expected_behavior);
          const allAddedDiscovered = [incremental, repeat].every((run) => Object.keys(additions).every((file) => run.suites.some((suite) => suite.path === file && suite.assertions.length > 0 && suite.assertions.every((test) => ['passed', 'failed'].includes(test.status)))));
          if (reproduced.status !== 'reproduced_difference' || !allAddedDiscovered || originalAssertions.some((test) => !current.has(test) || !repeatedPassing.has(test))) throw new Error('Behavior difference was not stably reproduced while preserving the original baseline');
          const evidencePath = 'out/test-me-to-death/reproduction.json'; const patchPath = 'out/test-me-to-death/tests.patch';
          await writeFile(await resolveSafePath(job.workspace, evidencePath), `${JSON.stringify({ schema_version: '1.0', origin: job.origin, classification: reproduced.status, expectation: basis, runs: [incremental, repeat], verified_files: pinned, limitation: 'A reproduced behavior difference is not automatically a bug. The expected behavior and cause require human review.' }, null, 2)}\n`, { mode: 0o600 });
          await writeFile(await resolveSafePath(job.workspace, patchPath), newFilesPatch(additions), { mode: 0o600 });
          candidate.paths = [...new Set([...candidate.paths, evidencePath, patchPath])];
          candidate.limitations.push('Reproduced behavior difference only; added tests fail and no production bug is declared fixed.');
          return [baselineCheck, { ...check('vitest-added-tests', 'failed', 'Added tests deliberately expose a stable behavior difference; this is not a passing test patch'), required: false }, { ...check('reproduction-check', 'passed', reproduced.reason), evidence_paths: [evidencePath] }];
        }
        if (!incremental.passed_checks || !discovered || originalAssertions.some((test) => !current.has(test))) throw new Error('Added tests did not all execute/pass with real assertions while preserving the baseline');
        const patchPath = 'out/test-me-to-death/tests.patch'; const evidencePath = 'out/test-me-to-death/validation.json';
        await writeFile(await resolveSafePath(job.workspace, patchPath), newFilesPatch(additions), { mode: 0o600 });
        await writeFile(await resolveSafePath(job.workspace, evidencePath), `${JSON.stringify({ schema_version: '1.0', origin: job.origin, baseline, incremental, verified_files: pinned, limitation: 'Passing checks do not prove all behavior correct. Human review is required.' }, null, 2)}\n`, { mode: 0o600 });
        candidate.paths = [...new Set([...candidate.paths, patchPath, evidencePath])];
        return [baselineCheck, { ...check('vitest-added-tests', 'passed', `${Object.keys(additions).length} new test files executed with required assertions; ${baseline.passed} baseline tests retained`), evidence_paths: [evidencePath] }];
      } catch (error) {
        if (result.artifact_candidates[0]?.kind === 'reproduction') return [baselineCheck, { ...check('vitest-added-tests', 'failed', 'No passing-test artifact is claimed'), required: false }, check('reproduction-check', 'failed', (error as Error).message)];
        return [baselineCheck, check('vitest-added-tests', 'failed', (error as Error).message)];
      }
    },
  };
}

/** A reproduction is research evidence, never a passing-test or fixed-bug claim. */
export function assessReproduction(first: VitestRun, second: VitestRun, expectedBasis: string): { status: 'reproduced_difference' | 'not_reproduced' | 'unverified_expectation'; reason: string } {
  if (expectedBasis.trim().length < 20) return { status: 'unverified_expectation', reason: 'A concrete requirement or invariant supporting the expectation is required' };
  const failures = (run: VitestRun) => run.suites.flatMap((suite) => suite.assertions.filter((test) => test.status === 'failed' && test.failure_hash).map((test) => `${suite.path}:${test.name}:${test.failure_hash}`)).sort();
  if (!first.completed || !second.completed || !failures(first).length || JSON.stringify(failures(first)) !== JSON.stringify(failures(second))) return { status: 'not_reproduced', reason: 'The same behavior difference was not observed in two completed isolated executions' };
  return { status: 'reproduced_difference', reason: 'The same test failures were observed twice; expectation and cause still require human review' };
}
