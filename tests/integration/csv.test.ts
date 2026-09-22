import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecipe } from '../../src/core/contracts.js';
import type { PreparedJob } from '../../src/core/worker.js';
import { validateCsvTool, writeCsvDemo } from '../../src/validators/csv.js';
import { probeSandbox } from '../../src/sandbox/index.js';
import { resourcePath } from '../../src/core/resources.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function job(): Promise<PreparedJob> {
  const workspace = await mkdtemp(join(tmpdir(), 'beforetibo-csv-integration-')); roots.push(workspace);
  const validationRoot = join(workspace, 'synthetic-run-with-a-long-identifier-for-socket-boundary-verification', 'validation-scratch');
  await mkdir(validationRoot, { recursive: true, mode: 0o700 });
  const recipe = loadRecipe('toolsmith-csv');
  return { attemptId: 'demo-attempt', unitId: 'demo-unit', workspace, validationRoot, recipe, stage: recipe.stages[0]!, source: { files: [], excluded: [], source_commit: null, total_bytes: 0 }, origin: 'demo', timeoutMs: 60_000, previousFailure: null };
}
describe('CSV fixed sandboxed browser validator', () => {
  it('AC-23 AC-59 preserves private-read denial when run state is inside the application checkout', async () => {
    const prepared = await job();
    const local = resourcePath('.local'); await mkdir(local, { recursive: true, mode: 0o700 });
    prepared.validationRoot = await mkdtemp(join(local, 'csv-sandbox-scope-regression-')); roots.push(prepared.validationRoot);
    const result = await writeCsvDemo(prepared.workspace);
    const validations = await validateCsvTool(prepared, result);
    if (!(await probeSandbox()).available || validations[0]?.status === 'skipped') {
      expect(process.env.BEFORE_TIBO_EXPECT_EXECUTION).not.toBe('1');
      expect(validations.every(check => check.required && check.status === 'skipped')).toBe(true);
    } else expect(validations.every(check => check.status === 'passed'), JSON.stringify(validations)).toBe(true);
    expect(await readdir(prepared.validationRoot)).toEqual([]);
  }, 60_000);
  it('AC-21 AC-59 refuses unbudgeted temporary execution when the runner root is missing', async () => {
    const prepared = await job(); delete prepared.validationRoot;
    const validations = await validateCsvTool(prepared);
    expect(validations.every(check => check.required && check.status === 'skipped')).toBe(true);
    if ((await probeSandbox()).available) expect(validations[0]?.summary).toContain('disk-budgeted validation root');
  });
  it('ships a complete tool and truthfully reports mandatory browser outcomes', async () => {
    const prepared = await job();
    const result = await writeCsvDemo(prepared.workspace);
    expect(result.artifact_candidates[0]?.paths).toHaveLength(7);
    expect(await readFile(join(prepared.workspace, 'out/csv-diff/index.html'), 'utf8')).toContain('DEMO');
    const validations = await validateCsvTool(prepared, result);
    expect(await readdir(prepared.validationRoot!)).toEqual([]);
    expect(validations.map(v => v.id)).toEqual(['csv-tool-functional', 'no-external-network']);
    const sandbox = await probeSandbox();
    if (process.env.BEFORE_TIBO_EXPECT_EXECUTION === '1') {
      expect(sandbox.available).toBe(true);
      expect(validations.every(v => v.status === 'passed'), JSON.stringify(validations)).toBe(true);
    }
    if (!sandbox.available) expect(validations.every(v => v.status === 'skipped')).toBe(true);
    else {
      // Missing optional browser backend is surfaced as required skipped, never fake success.
      const functional = validations[0]!;
      if (functional.status === 'skipped') expect(functional.summary).toContain('not run');
      else {
        expect(functional, JSON.stringify(validations)).toMatchObject({ status: 'passed', required: true });
        expect(result.artifact_candidates[0]?.paths).toContain('out/csv-diff/validation.json');
        const evidence = JSON.parse(await readFile(join(prepared.workspace, 'out/csv-diff/validation.json'), 'utf8')) as { verified_files: { path: string; sha256: string }[] };
        expect(evidence.verified_files).toHaveLength(7);
        expect(evidence.verified_files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
      }
    }
  }, 90_000);
  it('a broken generated tool cannot become functionally accepted', async () => {
    const prepared = await job(); await writeCsvDemo(prepared.workspace);
    await writeFile(join(prepared.workspace, 'out/csv-diff/app.js'), 'document.body.textContent = "Broken tool";');
    const validations = await validateCsvTool({ ...prepared, timeoutMs: 20_000 });
    expect(validations[0]?.status).not.toBe('passed');
    expect(validations[0]?.required).toBe(true);
  }, 30_000);
});
