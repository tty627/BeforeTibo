import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { builtinRecipeIds, contractNames, intersectCapabilities, isSafeRelativePath, pathMatchesScope, validateContract, validateRecipe, validateRunConfig, type ContractName } from '../../src/core/contracts.js';
import { resourcePath } from '../../src/core/resources.js';
import type { ArtifactManifest, CsvDiffResult, EvidenceIndex, Recipe, RunConfig } from '../../src/core/types.js';

function example(path: string): unknown { return JSON.parse(readFileSync(resourcePath('examples', path), 'utf8')) as unknown; }
function recipe(): Recipe { return structuredClone(example('recipes/repo-book/recipe.json')) as Recipe; }
function config(): RunConfig { return structuredClone(example('run-config.bounded.json')) as RunConfig; }
const fixtures: Record<ContractName, string> = {
  recipe: 'recipes/repo-book/recipe.json', 'run-config': 'run-config.bounded.json',
  'agent-result': 'agent-result.example.json', artifact: 'artifact.example.json', event: 'event.example.json',
  evidence: 'evidence.example.json', 'csv-diff-result': 'csv-fixture/expected-diff.json',
};
describe('AC-05 all shipped JSON contracts', () => {
  for (const name of contractNames) {
    it(`${name}: accepts the supplied positive fixture`, () => { expect(validateContract(name, example(fixtures[name]))).toBeDefined(); });
    it(`${name}: rejects unknown envelope fields`, () => { expect(() => validateContract(name, { ...(example(fixtures[name]) as object), injected: true })).toThrow(); });
    it(`${name}: rejects missing required fields`, () => { const value = example(fixtures[name]) as Record<string, unknown>; delete value.schema_version; expect(() => validateContract(name, value)).toThrow(); });
  }
  it.each(builtinRecipeIds)('accepts the entire %s recipe', (id) => { expect(validateRecipe(example(`recipes/${id}/recipe.json`)).id).toBe(id); });
  it('accepts the quota configuration shape without asserting a real bucket mapping', () => { expect(validateRunConfig(example('run-config.quota.json')).mode).toBe('quota'); });
  it('agent output cannot promote itself or invent usage', () => {
    for (const injected of [{ status: 'accepted' }, { usage: 500 }, { verified: true }]) expect(() => validateContract('agent-result', { ...(example(fixtures['agent-result']) as object), ...injected })).toThrow();
  });
});
describe('AC-06 validator allowlist and empty params', () => {
  it('rejects an arbitrary command validator', () => { const value = recipe(); (value.stages[0]!.validators[0] as { id: string }).id = 'run-shell'; expect(() => validateRecipe(value)).toThrow(); });
  it('rejects command parameters even for an allowed validator', () => { const value = recipe(); (value.stages[0]!.validators[0] as { params: object }).params = { command: 'anything' }; expect(() => validateRecipe(value)).toThrow(/params/); });
  it('rejects repeated validator declarations', () => { const value = recipe(); value.stages[0]!.validators.push(value.stages[0]!.validators[0]!); expect(() => validateRecipe(value)).toThrow(/unique/); });
});
describe('AC-07 finite dependency graph', () => {
  it('rejects duplicate stage IDs', () => { const value = recipe(); value.stages[1]!.id = value.stages[0]!.id; expect(() => validateRecipe(value)).toThrow(/unique/); });
  it('rejects missing stage dependencies', () => { const value = recipe(); value.stages[0]!.depends_on = ['missing']; expect(() => validateRecipe(value)).toThrow(/exist/); });
  it('rejects cycles across multiple stages', () => { const value = recipe(); value.stages[0]!.depends_on = [value.stages[1]!.id]; expect(() => validateRecipe(value)).toThrow(/cycle/); });
  it('rejects a self-cycle', () => { const value = recipe(); value.stages[0]!.depends_on = [value.stages[0]!.id]; expect(() => validateRecipe(value)).toThrow(/cycle/); });
});
describe('AC-08 permissions are an intersection', () => {
  it.each([0, -1, 11, Infinity])('rejects invalid max_units %s', (value) => { const candidate = recipe(); candidate.stages[0]!.max_units = value; expect(() => validateRecipe(candidate)).toThrow(); });
  it.each(['**', 'project/**', 'out/**', 'journal.jsonl', '../out/**', '/tmp/**', 'C:/out/**', 'out/repo-book/../../**'])('rejects broad or escaping write scope %s', (scope) => { const candidate = recipe(); candidate.permissions.writes = [scope]; expect(() => validateRecipe(candidate)).toThrow(); });
  it('rejects required output outside declared writes', () => { const value = recipe(); value.stages[0]!.expected_paths.push('out/other/result.md'); expect(() => validateRecipe(value)).toThrow(/scope/); });
  it('rejects unavailable capabilities before dispatch', () => { expect(() => validateRecipe(recipe(), { capabilities: ['snapshot'], writes: ['out/repo-book/**'], execute_project_code: false, task_network: 'deny' })).toThrow(/capabilities/); });
  it('rejects unauthorized write roots', () => { expect(() => validateRecipe(recipe(), { capabilities: ['snapshot', 'sandbox-exec'], writes: ['out/other/**'], execute_project_code: false, task_network: 'deny' })).toThrow(/scope/); });
  it('never adds capabilities to the intersection', () => { expect(intersectCapabilities(['snapshot', 'sandbox-exec'], ['snapshot'], ['snapshot', 'sandbox-exec'])).toEqual(['snapshot']); });
  it('matches a complete path boundary rather than a string prefix', () => { expect(pathMatchesScope('out/repo-book/file.md', ['out/repo-book/**'])).toBe(true); expect(pathMatchesScope('out/repo-book-escape/file.md', ['out/repo-book/**'])).toBe(false); });
});
describe('AC-20 contract path normalization', () => {
  it.each(['../secret', '/etc/passwd', 'C:/secret', 'C:\\secret', '\\\\host\\share', 'out/../secret', 'out//file', './file', 'out/%2e%2e/file', 'out/%252e%252e/file', 'out/a\u0000b', 'out/a\nb', 'out/./file', 'out/file?x', 'out/~user/file'])('rejects %s before filesystem resolution', (path) => { expect(isSafeRelativePath(path)).toBe(false); });
  it('permits normal relative files and explicitly requested globs', () => { expect(isSafeRelativePath('out/repo-book/index.md')).toBe(true); expect(isSafeRelativePath('out/repo-book/*.md', true)).toBe(true); expect(isSafeRelativePath('out/repo-book/*.md')).toBe(false); });
});
describe('runtime config semantics', () => {
  it('rejects stale interval shorter than polling', () => { const value = config(); value.quota.stale_seconds = 10; value.quota.poll_seconds = 15; expect(() => validateRunConfig(value)).toThrow(/stale/); });
  it('requires a relevant bucket in quota mode', () => { const value = config(); value.mode = 'quota'; expect(() => validateRunConfig(value)).toThrow(); });
  it('does not allow an all-finalization run', () => { const value = config(); value.budget.max_run_minutes = 1; value.budget.finalization_reserve_seconds = 60; expect(() => validateRunConfig(value)).toThrow(/finalization/); });
});
describe('accepted artifact cannot skip required checks', () => {
  function accepted(): ArtifactManifest {
    const value = example(fixtures.artifact) as ArtifactManifest; value.status = 'accepted'; value.files[0]!.sha256 = 'a'.repeat(64);
    value.validations = ['output-scope', 'protected-inputs', 'required-files', 'source-references', 'safe-markdown'].map((id) => ({ id, version: '1.0.0', required: true, status: 'passed', summary: 'Actual fixture validation', evidence_paths: [] })); return value;
  }
  it('accepts all kind-specific checks', () => { expect(validateContract('artifact', accepted())).toBeDefined(); });
  it.each(['skipped', 'failed', 'error'] as const)('rejects required %s checks', (status) => { const value = accepted(); value.validations[0]!.status = status; expect(() => validateContract('artifact', value)).toThrow(/required/); });
  it('rejects omission of required checks', () => { const value = accepted(); value.validations.splice(3, 1); expect(() => validateContract('artifact', value)).toThrow(/missing/); });
  it('rejects downgraded required checks', () => { const value = accepted(); value.validations[0]!.required = false; expect(() => validateContract('artifact', value)).toThrow(/missing/); });
  it('rejects placeholder hashes on acceptance', () => { const value = accepted(); value.files[0]!.sha256 = '0'.repeat(64); expect(() => validateContract('artifact', value)).toThrow(/placeholder/); });
});
describe('AC-35/36 evidence semantics', () => {
  it('rejects an invented source reference without source metadata', () => { const value = example(fixtures.evidence) as EvidenceIndex; value.claims[0]!.evidence_kind = 'source_reference'; expect(() => validateContract('evidence', value)).toThrow(/reference/); });
  it('rejects backward line ranges', () => { const value = example(fixtures.evidence) as EvidenceIndex; value.claims[0]!.line_start = 3; value.claims[0]!.line_end = 2; expect(() => validateContract('evidence', value)).toThrow(/range/); });
  it('requires evidence for an executed check', () => { const value = example(fixtures.evidence) as EvidenceIndex; value.claims[0]!.evidence_kind = 'executed_check'; expect(() => validateContract('evidence', value)).toThrow(/runner evidence/); });
  it('requires limitations on inference', () => { const value = example(fixtures.evidence) as EvidenceIndex; value.claims[0]!.limitations = []; expect(() => validateContract('evidence', value)).toThrow(/limitations/); });
});
describe('AC-56 CSV export conservation and actual differences', () => {
  function csv(): CsvDiffResult { return example(fixtures['csv-diff-result']) as CsvDiffResult; }
  it('rejects made-up row totals', () => { const value = csv(); value.summary.after_rows++; expect(() => validateContract('csv-diff-result', value)).toThrow(/conservation/); });
  it('rejects made-up category counts', () => { const value = csv(); value.summary.added++; expect(() => validateContract('csv-diff-result', value)).toThrow(/arrays/); });
  it('rejects differing row column sets', () => { const value = csv(); delete value.added[0]!.role; expect(() => validateContract('csv-diff-result', value)).toThrow(/column set/); });
  it('rejects mismatched changed keys', () => { const value = csv(); value.changed[0]!.after.id = 'other'; expect(() => validateContract('csv-diff-result', value)).toThrow(/key mismatch/); });
  it('rejects missing actual changed columns', () => { const value = csv(); value.changed[0]!.changed_columns = ['name']; expect(() => validateContract('csv-diff-result', value)).toThrow(/actual values/); });
  it('rejects duplicate keys across categories', () => { const value = csv(); value.added[0]!.id = value.removed[0]!.id!; expect(() => validateContract('csv-diff-result', value)).toThrow(/unique/); });
  it('rejects non-deterministic row ordering', () => { const value = csv(); value.added.push({ id: '000', name: 'B', role: 'R' }); value.summary.added++; value.summary.after_rows++; expect(() => validateContract('csv-diff-result', value)).toThrow(/sorted/); });
  it('preserves dangerous-looking headers as data', () => { const value = JSON.parse('{"schema_version":"1.0","key_column":"__proto__","columns":["__proto__"],"summary":{"before_rows":0,"after_rows":1,"added":1,"removed":0,"changed":0,"unchanged":0},"added":[{"__proto__":"safe"}],"removed":[],"changed":[]}') as unknown; expect(validateContract('csv-diff-result', value)).toBeDefined(); });
});
