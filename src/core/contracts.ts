import { Ajv2020 } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import type { AgentResult, ArtifactManifest, Capability, CsvDiffResult, EvidenceIndex, Recipe, RunConfig, ValidatorId } from './types.js';
import { readResourceJson } from './resources.js';

export const contractNames = ['recipe', 'run-config', 'agent-result', 'artifact', 'event', 'evidence', 'csv-diff-result'] as const;
export type ContractName = typeof contractNames[number];
export const builtinRecipeIds = ['repo-book', 'test-me-to-death', 'toolsmith-csv'] as const;
export const validatorIds: readonly ValidatorId[] = ['output-scope', 'protected-inputs', 'required-files', 'source-references', 'safe-markdown', 'vitest-baseline', 'vitest-added-tests', 'reproduction-check', 'csv-tool-functional', 'no-external-network'];
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
const addFormats = formats as unknown as (instance: Ajv2020) => void;
addFormats(ajv);
const validators = new Map<ContractName, ValidateFunction>();
export class ContractError extends Error {
  constructor(public readonly contract: string, message: string) { super(`Invalid ${contract}: ${message}`); this.name = 'ContractError'; }
}
function requireCondition(condition: unknown, name: string, message: string): asserts condition {
  if (!condition) throw new ContractError(name, message);
}
function unique(values: readonly string[], name: string, label: string): void {
  requireCondition(new Set(values).size === values.length, name, `${label} must be unique`);
}

/** Structural and value-level semantic validation. Filesystem provenance remains runner-owned. */
export function validateContract<T>(name: ContractName, value: unknown): T {
  let validate = validators.get(name);
  if (!validate) { validate = ajv.compile(readResourceJson(`contracts/${name}.schema.json`) as object); validators.set(name, validate); }
  if (!validate(value)) throw new ContractError(name, ajv.errorsText(validate.errors, { separator: '; ' }));
  switch (name) {
    case 'recipe': recipeSemantics(value as Recipe); break;
    case 'run-config': configSemantics(value as RunConfig); break;
    case 'agent-result': agentSemantics(value as AgentResult); break;
    case 'artifact': artifactSemantics(value as ArtifactManifest); break;
    case 'evidence': evidenceSemantics(value as EvidenceIndex); break;
    case 'csv-diff-result': csvSemantics(value as CsvDiffResult); break;
  }
  return value as T;
}

/** Lexical safety only: callers must additionally reject symlinks and verify realpath boundaries. */
export function isSafeRelativePath(value: string, allowGlob = false): boolean {
  if (!value || value.length > 512 || value.startsWith('/') || /^[a-z]:/i.test(value) || /[\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return false;
  if (/%(?:[0-9a-f]{2})/i.test(value)) return false; // no URL-decoding ambiguity across preview/export layers
  if (/[?\[\]{}!]/u.test(value) || (!allowGlob && value.includes('*'))) return false;
  return !value.includes('~') && !value.includes(':');
}
export function assertSafeRelativePath(value: string, allowGlob = false): string {
  requireCondition(isSafeRelativePath(value, allowGlob), 'path', 'expected a canonical, bounded relative path');
  return value;
}
function safePaths(paths: readonly string[], name: string, allowGlob = false): void {
  for (const path of paths) requireCondition(isSafeRelativePath(path, allowGlob), name, 'unsafe or ambiguous relative path');
}
function boundedWrite(pattern: string): boolean {
  return /^out\/[a-z0-9][a-z0-9._-]*(?:\/[a-zA-Z0-9._-]+)*(?:\/\*\*)?$/.test(pattern)
    || /^project\/tests\/before-tibo(?:\/[a-zA-Z0-9._-]+)*(?:\/\*\*)?$/.test(pattern);
}
export function pathMatchesScope(path: string, scopes: readonly string[]): boolean {
  if (!isSafeRelativePath(path)) return false;
  return scopes.some((scope) => scope.endsWith('/**') ? path.startsWith(scope.slice(0, -2)) : path === scope);
}
function scopeContains(outer: string, inner: string): boolean {
  return outer === inner || (outer.endsWith('/**') && inner.startsWith(outer.slice(0, -2)));
}
export interface RecipePolicy { capabilities: readonly Capability[]; writes: readonly string[]; execute_project_code: boolean; task_network: 'deny' }
export function intersectCapabilities(product: readonly Capability[], authorized: readonly Capability[], requested: readonly Capability[]): Capability[] {
  return [...new Set(requested)].filter((capability) => product.includes(capability) && authorized.includes(capability));
}
export function assertRecipePermissions(recipe: Recipe, policy: RecipePolicy, productCapabilities: readonly Capability[] = ['snapshot', 'sandbox-exec', 'vitest', 'browser-validation']): void {
  const allowed = intersectCapabilities(productCapabilities, policy.capabilities, recipe.capabilities);
  requireCondition(allowed.length === recipe.capabilities.length, 'recipe', 'required capabilities are not supported and authorized');
  requireCondition(!recipe.permissions.execute_project_code || policy.execute_project_code, 'recipe', 'project execution is not authorized');
  requireCondition(recipe.permissions.writes.every((scope) => policy.writes.some((allowedScope) => scopeContains(allowedScope, scope))), 'recipe', 'write scope exceeds user policy');
  requireCondition(recipe.permissions.task_network === policy.task_network, 'recipe', 'network policy mismatch');
}
export function validateRecipe(value: unknown, policy?: RecipePolicy): Recipe {
  const recipe = validateContract<Recipe>('recipe', value);
  if (policy) assertRecipePermissions(recipe, policy);
  return recipe;
}
export function validateRunConfig(value: unknown): RunConfig { return validateContract<RunConfig>('run-config', value); }
export function loadRecipe(id: string): Recipe {
  requireCondition(builtinRecipeIds.some((builtin) => builtin === id), 'recipe', 'unknown built-in recipe');
  return validateRecipe(readResourceJson(`recipes/${id}/recipe.json`));
}
function recipeSemantics(recipe: Recipe): void {
  const name = 'recipe';
  safePaths(recipe.permissions.writes, name, true);
  requireCondition(recipe.permissions.writes.every(boundedWrite), name, 'writes must be bounded output or added-test paths');
  unique(recipe.stages.map((stage) => stage.id), name, 'stage IDs');
  const stages = new Map(recipe.stages.map((stage) => [stage.id, stage]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(id: string): void {
    requireCondition(!visiting.has(id), name, 'stage dependencies contain a cycle');
    if (visited.has(id)) return;
    const stage = stages.get(id); requireCondition(stage, name, 'stage dependency does not exist');
    visiting.add(id);
    for (const dependency of stage.depends_on) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const stage of recipe.stages) {
    visit(stage.id); safePaths(stage.expected_paths, name, true);
    requireCondition(stage.expected_paths.every((path) => recipe.permissions.writes.some((scope) => scopeContains(scope, path))), name, 'expected path exceeds write scope');
    unique(stage.validators.map((validator) => validator.id), name, 'validator IDs per stage');
    for (const validator of stage.validators) requireCondition(Object.keys(validator.params).length === 0, name, 'v1 validator params must be empty');
  }
}
function configSemantics(config: RunConfig): void {
  requireCondition(config.quota.stale_seconds >= config.quota.poll_seconds, 'run-config', 'stale_seconds must be at least poll_seconds');
  requireCondition(config.budget.max_run_minutes * 60 > config.budget.finalization_reserve_seconds, 'run-config', 'run deadline must leave time for finalization');
  requireCondition(config.budget.job_timeout_seconds + config.budget.finalization_reserve_seconds <= config.budget.max_run_minutes * 60, 'run-config', 'job timeout plus finalization reserve exceeds run budget');
  requireCondition(!/[\u0000-\u001f\u007f]/u.test(config.target_path + config.state_dir), 'run-config', 'control characters in filesystem paths');
}
function agentSemantics(result: AgentResult): void {
  unique(result.artifact_candidates.map((candidate) => candidate.logical_key), 'agent-result', 'candidate logical keys');
  for (const candidate of result.artifact_candidates) { safePaths(candidate.paths, 'agent-result'); unique(candidate.paths, 'agent-result', 'candidate paths'); }
  for (const observation of result.observations) safePaths(observation.relative_paths, 'agent-result');
  requireCondition(result.outcome !== 'candidate' || result.artifact_candidates.length > 0, 'agent-result', 'candidate outcome requires a candidate');
}
export const requiredValidatorsByKind: Record<ArtifactManifest['kind'], readonly ValidatorId[]> = {
  document: ['output-scope', 'protected-inputs', 'required-files', 'source-references', 'safe-markdown'],
  test_patch: ['output-scope', 'protected-inputs', 'required-files', 'vitest-baseline', 'vitest-added-tests'],
  tool: ['output-scope', 'protected-inputs', 'required-files', 'csv-tool-functional', 'no-external-network'],
  reproduction: ['output-scope', 'protected-inputs', 'required-files', 'vitest-baseline', 'reproduction-check'],
  experiment: ['output-scope', 'protected-inputs', 'required-files'],
};
function artifactSemantics(artifact: ArtifactManifest): void {
  const name = 'artifact'; safePaths(artifact.files.map((file) => file.path), name);
  unique(artifact.files.map((file) => file.path), name, 'file paths'); unique(artifact.validations.map((validation) => validation.id), name, 'validation IDs');
  for (const validation of artifact.validations) safePaths(validation.evidence_paths, name);
  if (artifact.status !== 'accepted') return;
  requireCondition(artifact.validations.every((validation) => !validation.required || validation.status === 'passed'), name, 'required skipped, failed or errored validation cannot be accepted');
  requireCondition(requiredValidatorsByKind[artifact.kind].every((id) => artifact.validations.some((validation) => validation.id === id && validation.required && validation.status === 'passed')), name, 'accepted artifact is missing kind-specific required validations');
  requireCondition(artifact.files.every((file) => !/^0{64}$/.test(file.sha256)), name, 'placeholder file hashes cannot be accepted');
}
function evidenceSemantics(evidence: EvidenceIndex): void {
  const name = 'evidence'; unique(evidence.claims.map((claim) => claim.claim_id), name, 'claim IDs');
  for (const claim of evidence.claims) {
    if (claim.source_path !== null) safePaths([claim.source_path], name);
    if (claim.check_evidence_path !== null) safePaths([claim.check_evidence_path], name);
    requireCondition((claim.line_start === null && claim.line_end === null) || (claim.line_start !== null && claim.line_end !== null && claim.line_start <= claim.line_end), name, 'invalid source line range');
    if (claim.evidence_kind === 'source_reference') requireCondition(claim.source_path !== null && claim.source_blob_sha256 !== null && (claim.line_start !== null || (claim.symbol !== null && claim.symbol.trim().length > 0)), name, 'source reference requires path, hash and line range or symbol');
    if (claim.evidence_kind === 'executed_check') requireCondition(claim.check_evidence_path !== null, name, 'executed check requires runner evidence path');
    if (claim.evidence_kind === 'inference') requireCondition(claim.limitations.length > 0, name, 'inference must explicitly record limitations');
  }
}
function csvSemantics(result: CsvDiffResult): void {
  const name = 'csv-diff-result'; const { summary, key_column: keyColumn, columns } = result;
  requireCondition(columns.includes(keyColumn), name, 'key column must belong to columns');
  requireCondition(summary.added === result.added.length && summary.removed === result.removed.length && summary.changed === result.changed.length, name, 'summary counts differ from result arrays');
  requireCondition(summary.before_rows === summary.removed + summary.changed + summary.unchanged && summary.after_rows === summary.added + summary.changed + summary.unchanged, name, 'row conservation failed');
  const allKeys: string[] = [];
  function rowKey(row: Record<string, string>): string {
    requireCondition(Object.keys(row).length === columns.length && columns.every((column) => Object.hasOwn(row, column)), name, 'row column set differs');
    const key = row[keyColumn]; requireCondition(typeof key === 'string' && key.length > 0, name, 'row key is empty'); return key;
  }
  function sorted(keys: string[]): void { requireCondition(keys.every((key, index) => index === 0 || (keys[index - 1] as string) < key), name, 'rows must be unique and sorted in code-unit order'); allKeys.push(...keys); }
  sorted(result.added.map(rowKey)); sorted(result.removed.map(rowKey));
  sorted(result.changed.map((change) => {
    requireCondition(rowKey(change.before) === change.key && rowKey(change.after) === change.key, name, 'changed row key mismatch');
    const differences = columns.filter((column) => change.before[column] !== change.after[column]);
    requireCondition(JSON.stringify(differences) === JSON.stringify(change.changed_columns), name, 'changed columns differ from actual values or column order');
    return change.key;
  }));
  unique(allKeys, name, 'keys across added, removed and changed');
}
