import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RealWorker } from '../../src/adapters/real.js';
import { CodexExecAdapter, UsageAccumulator, type ExecOptions } from '../../src/adapters/codex/index.js';
import { loadRecipe } from '../../src/core/contracts.js';
import { candidate, type PreparedJob } from '../../src/core/worker.js';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it('seeds CSV resources before dispatch and documents the fixed interface without overwriting inherited improvements', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'beforetibo-real-worker-test-')); roots.push(workspace);
  await mkdir(join(workspace, 'out/csv-diff'), { recursive: true });
  await writeFile(join(workspace, 'out/csv-diff/app.js'), '// inherited accepted improvement');
  const recipe = loadRecipe('toolsmith-csv');
  const job: PreparedJob = { attemptId: 'synthetic-attempt', unitId: 'synthetic-unit', recipe, stage: recipe.stages[0]!, workspace, source: { files: [], excluded: [], total_bytes: 0, source_commit: null }, origin: 'real', timeoutMs: 1000, previousFailure: null };
  const execute = vi.spyOn(CodexExecAdapter.prototype, 'execute').mockImplementationOnce(async options => {
    expect(await readFile(join(workspace, 'out/csv-diff/index.html'), 'utf8')).toContain('id="before-file"');
    expect(await readFile(join(workspace, 'out/csv-diff/app.js'), 'utf8')).toBe('// inherited accepted improvement');
    expect(options.prompt).toContain('globalThis.BeforeTiboCsv.diffCsv');
    expect(options.prompt).toContain('The runner seeded');
    expect(options.prompt).toContain('do not write that file');
    return { status: 'candidate', candidate: candidate('Synthetic mock of real transport', ['out/csv-diff/index.html'], 'csv-diff', 'CSV Diff', 'tool'), usage: new UsageAccumulator().report(), exitCode: 0, diagnostics: [] };
  });
  // The transport is mocked: this test never probes auth or calls a model.
  const worker = new RealWorker({} as Omit<ExecOptions, 'cwd'|'prompt'|'schemaPath'|'resultPath'|'timeoutMs'|'signal'|'validateCandidate'>);
  const result = await worker.execute(job, new AbortController().signal, async () => undefined);
  expect(execute).toHaveBeenCalledOnce(); expect(result.exitCode).toBe(0);
});
