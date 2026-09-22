import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecipe } from '../../src/core/contracts.js';
import type { AgentResult, EvidenceIndex } from '../../src/core/types.js';
import { MockWorker } from '../../src/adapters/mock.js';
import { hash } from '../../src/storage/artifacts.js';
import { validateStructural } from '../../src/validators/structural.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'before-tibo-reference-')); roots.push(workspace);
  await mkdir(join(workspace, 'project'));
  const content = 'export function add(a, b) { return a + b; }\n';
  await writeFile(join(workspace, 'project/sum.js'), content);
  const source = { source_commit: hash(content).slice(0, 40), files: [{ path: 'sum.js', sha256: hash(content), size_bytes: Buffer.byteLength(content) }], excluded: [], total_bytes: Buffer.byteLength(content) };
  const recipe = loadRecipe('repo-book'); const stage = recipe.stages[0]!;
  const result = await new MockWorker().execute({ workspace, recipe, stage, source, origin: 'demo', unitId: 'overview-1', attemptId: 'attempt-fixture', timeoutMs: 1000, previousFailure: null }, new AbortController().signal, async () => {});
  const evidencePath = join(workspace, 'out/repo-book/evidence.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as EvidenceIndex;
  return { workspace, recipe, stage, source, result: result.result as AgentResult, evidencePath, evidence };
}

describe('runner-owned source reference verification', () => {
  it.each(['missing-path', 'wrong-hash', 'out-of-range', 'wrong-snapshot', 'missing-symbol', 'unexecuted-check'] as const)('AC-35 AC-36 rejects %s without accepting exit-zero prose', async kind => {
    const f = await fixture(); const claim = f.evidence.claims[0]!;
    if (kind === 'missing-path') claim.source_path = 'invented.js';
    if (kind === 'wrong-hash') claim.source_blob_sha256 = '0'.repeat(64);
    if (kind === 'out-of-range') claim.line_end = 100;
    if (kind === 'wrong-snapshot') f.evidence.source_commit = '0'.repeat(40);
    if (kind === 'missing-symbol') { claim.line_start = null; claim.line_end = null; claim.symbol = 'inventedSymbol'; }
    if (kind === 'unexecuted-check') claim.evidence_kind = 'executed_check';
    await writeFile(f.evidencePath, JSON.stringify(f.evidence));
    const validations = await validateStructural(f.workspace, f.result, f.recipe, f.stage, f.source);
    expect(validations.find(check => check.id === 'source-references')?.status).toBe('failed');
  });

  it('AC-34 a matching immutable snapshot and real line reference passes', async () => {
    const f = await fixture();
    const validations = await validateStructural(f.workspace, f.result, f.recipe, f.stage, f.source);
    expect(validations.every(check => check.status === 'passed')).toBe(true);
  });
});
