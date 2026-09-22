import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeSandboxed, probeSandbox } from '../../src/sandbox/index.js';
import { validateCsvTool } from '../../src/validators/csv.js';
import { loadRecipe } from '../../src/core/contracts.js';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const roots: string[] = [];
afterEach(async () => {
  Object.defineProperty(process, 'platform', originalPlatform);
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
describe('unavailable backend fault injection; not a Linux support claim', () => {
  it('AC-22 refuses execution instead of falling back to the host', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'before-tibo-no-sandbox-')); roots.push(workspace);
    const marker = join(workspace, 'must-not-exist');
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'before-tibo-unsupported-fixture' });
    expect((await probeSandbox()).available).toBe(false);
    await expect(executeSandboxed({ command: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1],"unsafe fallback")', marker], cwd: workspace, writableRoots: [workspace], timeoutMs: 1000 })).rejects.toThrow('blocked');
    await expect(access(marker)).rejects.toThrow();
  });
  it('AC-59 required CSV browser checks remain skipped when confinement is unavailable', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'before-tibo-no-csv-backend-')); roots.push(workspace);
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'before-tibo-unsupported-fixture' });
    const recipe = loadRecipe('toolsmith-csv');
    const checks = await validateCsvTool({ workspace, recipe, stage: recipe.stages[0]!, origin: 'demo', attemptId: 'synthetic-attempt', unitId: 'synthetic-unit', source: { files: [], excluded: [], source_commit: null, total_bytes: 0 }, timeoutMs: 1000, previousFailure: null });
    expect(checks).toHaveLength(2);
    expect(checks.every(check => check.required && check.status === 'skipped')).toBe(true);
  });
});
