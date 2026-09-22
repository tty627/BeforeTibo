import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createVitestHooks, inspectVitestProject } from '../../src/validators/vitest.js';
import { captureProtectedFiles } from '../../src/workspace/index.js';
import { executeProcess, probeSandbox } from '../../src/sandbox/index.js';
import type { RunMetadata } from '../../src/harvest/report.js';
import type { PreparedJob, SourceManifest } from '../../src/core/worker.js';
import { candidate } from '../../src/core/worker.js';
import { loadRecipe } from '../../src/core/contracts.js';
import { demo } from '../../src/core/demo.js';
import { readRun } from '../../src/core/runner.js';

const roots: string[] = [];
async function fixture(baseline = 'expect(add(1, 2)).toBe(3);', include = 'tests/**/*.test.mjs') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'before-tibo-vitest-test-')); roots.push(root); const original = path.join(root, 'original'); await mkdir(original);
  const files: Record<string, string> = {
    'package.json': '{"name":"synthetic-vitest-fixture","type":"module","devDependencies":{"vitest":"4.1.11"}}\n',
    'package-lock.json': '{"name":"synthetic-vitest-fixture","lockfileVersion":3,"packages":{}}\n',
    'vitest.config.mjs': `export default {test:{include:[${JSON.stringify(include)}]}};\n`,
    'src/add.mjs': 'export function add(a,b) { return a+b; }\n',
    'tests/original.test.mjs': `import {test,expect} from 'vitest';import {add} from '../src/add.mjs';test('original addition',()=>{${baseline}});\n`,
  };
  for (const [name, content] of Object.entries(files)) { await mkdir(path.dirname(path.join(original, name)), { recursive: true }); await writeFile(path.join(original, name), content); }
  const source: SourceManifest = { source_commit: '0'.repeat(40), files: await captureProtectedFiles(original, Object.keys(files)), total_bytes: 0, excluded: [] };
  await symlink(path.join(process.cwd(), 'node_modules'), path.join(original, 'node_modules'));
  const runDir = path.join(root, 'run'); await mkdir(runDir); await mkdir(path.join(runDir, 'source'));
  for (const [name, content] of Object.entries(files)) { await mkdir(path.dirname(path.join(runDir, 'source', name)), { recursive: true }); await writeFile(path.join(runDir, 'source', name), content); }
  return { root, original, source, runDir, files };
}
async function attempt(data: Awaited<ReturnType<typeof fixture>>, testCode: string) {
  const workspace = path.join(data.root, 'workspace'); await mkdir(workspace); await cp(path.join(data.runDir, 'source'), path.join(workspace, 'project'), { recursive: true });
  await mkdir(path.join(workspace, 'project/tests/before-tibo'), { recursive: true }); await mkdir(path.join(workspace, 'out/test-me-to-death'), { recursive: true });
  await writeFile(path.join(workspace, 'project/tests/before-tibo/boundary.test.mjs'), testCode);
  await writeFile(path.join(workspace, 'out/test-me-to-death/scenarios.md'), '# Boundary behavior\nAdding a zero preserves the original value. Unrelated behavior is not covered.\n');
  const recipe = loadRecipe('test-me-to-death');
  const job: PreparedJob = { workspace, source: data.source, attemptId: 'attempt-fixture', unitId: 'boundary-tests-1', stage: recipe.stages[0]!, recipe, origin: 'demo', timeoutMs: 10_000, previousFailure: null };
  const result = candidate('DEMO synthetic boundary tests', ['project/tests/before-tibo/boundary.test.mjs', 'out/test-me-to-death/scenarios.md'], 'boundary', 'DEMO boundary tests', 'test_patch');
  return { job, result };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('isolated Vitest workflow', () => {
  it('AC-51 AC-54 the full DEMO completes all three stages while disk monitoring remains enabled',async()=>{
    if(!(await probeSandbox()).available)return;
    const root=await mkdtemp(path.join(os.tmpdir(),'before-tibo-test-demo-'));roots.push(root);
    const run=await demo('test-me-to-death',root);expect(run.status).toBe('COMPLETED');expect(run.dispatches).toBe(3);const {journal}=await readRun(root,run.runId);expect(journal.state.artifacts).toHaveLength(3);
  },30_000);
  it('AC-51 blocks missing dependencies and unsupported monorepos without installing anything', async () => {
    const data = await fixture(); await rm(path.join(data.original, 'node_modules'));
    await expect(inspectVitestProject(data.original)).rejects.toThrow('dependencies are missing');
    await writeFile(path.join(data.original, 'package.json'), '{"workspaces":["packages/*"]}'); await expect(inspectVitestProject(data.original)).rejects.toThrow('single npm');
  });
  it('AC-52 AC-53 AC-54 runs a real isolated baseline and new tests, then emits an applicable patch', async () => {
    const data = await fixture(); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    const probe = await probeSandbox();
    if (!probe.available) { await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow('BLOCKED'); return; }
    await hooks.prepare!(data.runDir, {} as RunMetadata, data.source);
    const { job, result } = await attempt(data, "import {test,expect} from 'vitest';import {add} from '../../src/add.mjs';test('zero preserves the value',()=>{expect(add(3,0)).toBe(3)});\n");
    const checks = await hooks.validate!(job, result); expect(checks.map((check) => [check.id, check.status, check.summary])).toEqual(expect.arrayContaining([expect.arrayContaining(['vitest-added-tests', 'passed'])]));
    const patchFile = path.join(job.workspace, 'out/test-me-to-death/tests.patch');
    const patch = await readFile(patchFile, 'utf8'); expect(patch).toContain('new file mode 100644');
    // Fixed infrastructure command only: --check never executes user code or changes source.
    const apply = await executeProcess({ command: 'git', args: ['apply', '--check', patchFile], cwd: data.original, timeoutMs: 5000 }); expect(apply.exitCode, apply.stderr).toBe(0);
    expect(await readFile(path.join(data.original, 'src/add.mjs'), 'utf8')).toBe(data.files['src/add.mjs']);
  }, 45_000);
  it('AC-52 blocks a failing baseline before candidate generation', async () => {
    const data = await fixture('expect(add(1,2)).toBe(100);'); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow('BLOCKED');
  }, 30_000);
  it('AC-52 blocks configurations that cannot discover the permitted new tests', async () => {
    const data = await fixture('expect(add(1,2)).toBe(3);', 'tests/original.test.mjs'); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    if (!(await probeSandbox()).available) { await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow(); return; }
    await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow('discovery excludes');
  }, 45_000);
  it('AC-54 rejects tests that are skipped or have no assertions', async () => {
    const data = await fixture(); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    if (!(await probeSandbox()).available) { await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow(); return; }
    await hooks.prepare!(data.runDir, {} as RunMetadata, data.source);
    const { job, result } = await attempt(data, "import {test,expect} from 'vitest';test.skip('unexecuted',()=>{expect(1).toBe(1)});\n");
    expect((await hooks.validate!(job, result)).find((check) => check.id === 'vitest-added-tests')?.status).toBe('failed');
    await writeFile(path.join(job.workspace, 'project/tests/before-tibo/boundary.test.mjs'), "import {test,expect} from 'vitest';test('no executed assertions',()=>{if(false)expect(1).toBe(1)});\n");
    expect((await hooks.validate!(job, result)).find((check) => check.id === 'vitest-added-tests')?.status).toBe('failed');
  }, 45_000);
  it('AC-53 rejects changes to production source before running the candidate', async () => {
    const data = await fixture(); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    if (!(await probeSandbox()).available) { await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow(); return; }
    await hooks.prepare!(data.runDir, {} as RunMetadata, data.source);
    const { job, result } = await attempt(data, "import {test,expect} from 'vitest';test('test',()=>expect(1).toBe(1));\n");
    await writeFile(path.join(job.workspace, 'project/src/add.mjs'), 'export const add = ()=>999;');
    const check = (await hooks.validate!(job, result)).find((check) => check.id === 'vitest-added-tests'); expect(check?.status).toBe('failed'); expect(check?.summary).toContain('protected baseline');
  }, 45_000);
  it('AC-55 retains a stable reproduced difference without calling failing tests a success', async () => {
    const data = await fixture(); const hooks = createVitestHooks({ sourcePath: data.original, timeoutMs: 15_000 });
    if (!(await probeSandbox()).available) { await expect(hooks.prepare!(data.runDir, {} as RunMetadata, data.source)).rejects.toThrow(); return; }
    await hooks.prepare!(data.runDir, {} as RunMetadata, data.source);
    const { job, result } = await attempt(data, "import {test,expect} from 'vitest';import {add} from '../../src/add.mjs';test('documented integer result',()=>{expect(add(0.1,0.2)).toBe(0.3)});\n");
    const output = result.artifact_candidates[0]!; output.kind = 'reproduction'; output.paths.push('out/test-me-to-death/expectation.json');
    const sourceFile = data.source.files.find((file) => file.path === 'src/add.mjs')!;
    await writeFile(path.join(job.workspace, 'out/test-me-to-death/expectation.json'), JSON.stringify({ source_path: sourceFile.path, source_sha256: sourceFile.sha256, line_start: 1, line_end: 1, basis_excerpt: data.files['src/add.mjs']!.trim(), expected_behavior: 'This proposed expectation assumes decimal inputs sum to an exact decimal; its validity needs human review.' }));
    const validations = await hooks.validate!(job, result);
    expect(validations.find((check) => check.id === 'reproduction-check')?.status, JSON.stringify(validations)).toBe('passed');
    expect(validations.find((check) => check.id === 'vitest-added-tests')).toMatchObject({ status: 'failed', required: false });
    const report = JSON.parse(await readFile(path.join(job.workspace, 'out/test-me-to-death/reproduction.json'), 'utf8')) as { classification: string; runs: unknown[] };
    expect(report.classification).toBe('reproduced_difference'); expect(report.runs).toHaveLength(2);
  }, 60_000);
});
