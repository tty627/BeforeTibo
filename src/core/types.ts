/** Types describe validated contracts; untrusted JSON must cross validateContract first. */
export type DataOrigin = 'real' | 'demo';
export type ArtifactKind = 'document' | 'test_patch' | 'tool' | 'reproduction' | 'experiment';
export type Capability = 'snapshot' | 'sandbox-exec' | 'vitest' | 'browser-validation';
export type ValidatorId = 'output-scope' | 'protected-inputs' | 'required-files' | 'source-references' | 'safe-markdown' | 'vitest-baseline' | 'vitest-added-tests' | 'reproduction-check' | 'csv-tool-functional' | 'no-external-network';
export interface ValidatorSpec { id: ValidatorId; required: boolean; params: Record<string, never> }
export interface RecipeStage { id: string; title: string; max_units: number; depends_on: string[]; expected_paths: string[]; validators: ValidatorSpec[] }
export interface Recipe {
  schema_version: '1.0'; id: string; version: string; title: string; mode: 'learn' | 'harden' | 'build'; goal: string;
  input: { kind: 'repository' | 'new-project'; languages: string[]; package_manager: 'npm' | null; test_framework: 'vitest' | null };
  capabilities: Capability[];
  permissions: { source: 'baseline-read-only'; writes: string[]; task_network: 'deny'; execute_project_code: boolean };
  artifact_kinds: ArtifactKind[]; stages: RecipeStage[]; known_limitations: string[];
}
export interface RunConfig {
  schema_version: '1.0'; recipe_id: string; mode: 'bounded' | 'quota'; target_path: string; state_dir: string;
  budget: { max_dispatches: number; max_run_minutes: number; job_timeout_seconds: number; max_repairs_per_unit: number; max_consecutive_no_progress: number; finalization_reserve_seconds: number; max_run_disk_mb: number };
  quota: { required_buckets: string[]; reserve_percent: number; poll_seconds: number; stale_seconds: number };
  execution: { auth: 'chatgpt'; max_workers: 1; sandbox: 'required'; task_network: 'deny' };
  billing: { require_zero_incremental_charge: boolean; require_user_acknowledgement: true };
}
export interface ArtifactCandidate { logical_key: string; title: string; kind: ArtifactKind; paths: string[]; limitations: string[] }
export interface AgentResult {
  schema_version: '1.0'; outcome: 'candidate' | 'blocked' | 'no_progress'; summary: string;
  artifact_candidates: ArtifactCandidate[];
  observations: { kind: 'source_read' | 'check_attempted' | 'unverified'; summary: string; relative_paths: string[] }[];
  blockers: string[]; proposed_next_unit: string | null;
}
export interface ValidationResult { id: string; version: string; required: boolean; status: 'passed' | 'failed' | 'skipped' | 'error'; summary: string; evidence_paths: string[] }
export interface ArtifactManifest {
  schema_version: '1.0'; artifact_id: string; run_id: string; unit_id: string; attempt_id: string; logical_key: string; supersedes: string | null;
  title: string; kind: ArtifactKind; data_origin: DataOrigin; status: 'candidate' | 'accepted' | 'rejected' | 'quarantined'; adoption: 'unreviewed' | 'kept' | 'discarded';
  recipe_id: string; recipe_version: string; source_commit: string | null; created_at: string;
  files: { path: string; sha256: string; size_bytes: number }[]; validations: ValidationResult[]; limitations: string[];
}
export type Artifact = ArtifactManifest;
export interface EvidenceClaim {
  claim_id: string; claim: string; evidence_kind: 'source_reference' | 'executed_check' | 'inference';
  source_path: string | null; source_blob_sha256: string | null; line_start: number | null; line_end: number | null; symbol: string | null; check_evidence_path: string | null; limitations: string[];
}
export interface EvidenceIndex { schema_version: '1.0'; data_origin: DataOrigin; source_commit: string; claims: EvidenceClaim[] }
export type Evidence = EvidenceIndex;
export type EventType = 'run.created' | 'run.preflight' | 'run.ready' | 'run.started' | 'run.state_changed' | 'dispatch.intent' | 'worker.started' | 'worker.progress' | 'worker.exited' | 'worker.interrupted' | 'usage.observed' | 'quota.observed' | 'quota.unavailable' | 'quota.stale' | 'quota.boundary_changed' | 'candidate.received' | 'validation.completed' | 'artifact.promoted' | 'artifact.rejected' | 'artifact.quarantined' | 'stop.requested' | 'harvest.generated' | 'adapter.unknown' | 'log.truncated' | 'storage.error' | 'run.finished';
export interface EventEnvelope { schema_version: '1.0'; event_id: string; run_id: string; seq: number; occurred_at: string; type: EventType; data_origin: DataOrigin; payload: Record<string, unknown> }
export interface CsvDiffResult {
  schema_version: '1.0'; key_column: string; columns: string[];
  summary: { before_rows: number; after_rows: number; added: number; removed: number; changed: number; unchanged: number };
  added: Record<string, string>[]; removed: Record<string, string>[];
  changed: { key: string; before: Record<string, string>; after: Record<string, string>; changed_columns: string[] }[];
}
