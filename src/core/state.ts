import { createHash } from 'node:crypto';
import { validateContract } from './contracts.js';
import type { EventEnvelope, EventType } from './types.js';

export type RunStatus = 'CREATED' | 'PREFLIGHT' | 'READY' | 'RUNNING' | 'DRAINING' | 'HARVESTING' | 'COMPLETED' | 'PARTIAL' | 'STOPPED' | 'FAILED' | 'BLOCKED' | 'INTERRUPTED';
export type StoredEvent = EventEnvelope;
export interface AttemptState { id: string; unit: string; stage: string; status: 'intent' | 'running' | 'candidate' | 'accepted' | 'rejected' | 'quarantined' | 'interrupted'; artifact?: string }
export interface RunState {
  runId: string; origin: 'real' | 'demo'; status: RunStatus; endedAt: string | null; seq: number; eventIds: string[];
  eventRecords: Record<string, { seq: number; fingerprint: string }>;
  dispatches: number; startedWorkers: number; attempts: Record<string, AttemptState>;
  quota:Record<string,unknown>|null; quotaStatus:string; artifacts: string[]; stopReason: string | null; noProgress: number; usage: Record<string, unknown>[];
}
const transitions: Record<RunStatus, RunStatus[]> = {
  CREATED: ['PREFLIGHT'], PREFLIGHT: ['READY', 'RUNNING', 'BLOCKED', 'HARVESTING'], READY: ['RUNNING', 'BLOCKED'],
  RUNNING: ['DRAINING', 'INTERRUPTED'], DRAINING: ['HARVESTING', 'INTERRUPTED'],
  HARVESTING: ['COMPLETED', 'PARTIAL', 'STOPPED', 'FAILED'], INTERRUPTED: ['PREFLIGHT', 'HARVESTING'],
  COMPLETED: [], PARTIAL: [], STOPPED: ['PREFLIGHT'], FAILED: [], BLOCKED: [],
};
const identifier = (value: unknown): boolean => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
const text = (value: unknown): boolean => typeof value === 'string' && value.length > 0 && value.length <= 16_384;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): boolean => value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
const status = (value: unknown): boolean => typeof value === 'string' && Object.hasOwn(transitions, value);
const optionalText = (value: unknown): boolean => value === null || text(value);
type Rule = (value: unknown) => boolean;
interface PayloadDefinition { required: Record<string, Rule>; optional?: Record<string, Rule> }
const diagnostic: PayloadDefinition = { required: {}, optional: { reason: text, summary: text, message: text } };
const attempt: PayloadDefinition = { required: { attempt: identifier }, optional: { reason: text, summary: text } };
const payloadDefinitions: Record<EventType, PayloadDefinition> = {
  'run.created': { required: { recipe_id: identifier }, optional: { message: text } },
  'run.preflight': diagnostic, 'run.ready': diagnostic, 'run.started': diagnostic,
  'run.state_changed': { required: { status }, optional: { reason: text } },
  'dispatch.intent': { required: { attempt: identifier, unit: identifier, stage: identifier } },
  'worker.started': attempt,
  'worker.progress': { required: { summary: text }, optional: { attempt: identifier } },
  'worker.exited': { required: { attempt: identifier, exit_code: value => Number.isSafeInteger(value) }, optional: { summary: text } },
  'worker.interrupted': attempt,
  'usage.observed': {
    required: { id: identifier }, optional: {
      attempt: identifier, input_tokens: count, cached_input_tokens: count, output_tokens: count, reasoning_output_tokens: count,
      completeness: value => value === 'complete' || value === 'partial', usage_completeness: value => value === 'complete' || value === 'partial',
      data_origin: value => value === 'real' || value === 'demo', coverage: value => ['completed_turns', 'thread_cumulative', 'unavailable'].includes(String(value)),
      thread_id: optionalText, turn_ids: value => Array.isArray(value) && value.every(text),
    },
  },
  'quota.observed': { required: { snapshot: record }, optional: { source: text, observed_at: value => typeof value === 'string' && Number.isFinite(Date.parse(value)) } },
  'quota.unavailable': diagnostic, 'quota.stale': diagnostic, 'quota.boundary_changed': diagnostic,
  'candidate.received': attempt,
  'validation.completed': { required: { attempt: identifier, checks: value => Array.isArray(value) && value.every(item => record(item) && Object.keys(item).every(k => ['id', 'status', 'summary'].includes(k)) && identifier(item.id) && ['passed', 'failed', 'skipped', 'error'].includes(String(item.status)) && text(item.summary)) } },
  'artifact.promoted': { required: { attempt: identifier, artifact: identifier }, optional: { logical_key: identifier } },
  'artifact.rejected': attempt, 'artifact.quarantined': attempt,
  'stop.requested': { required: {}, optional: { reason: text, immediate: value => typeof value === 'boolean' } },
  'harvest.generated': { required: { path: value => value === 'harvest/index.html' }, optional: { summary: text } },
  'adapter.unknown': { required: {}, optional: { reason: text, summary: text, type: text } },
  'log.truncated': diagnostic, 'storage.error': diagnostic,
  'run.finished': { required: { status }, optional: { reason: text } },
};
/** The public envelope permits payload objects; persisted events require event-specific fields. */
export function validateStoredEvent(value: unknown): StoredEvent {
  const event = validateContract<StoredEvent>('event', value);
  const definition = payloadDefinitions[event.type];
  const rules = { ...definition.optional, ...definition.required };
  for (const key of Object.keys(event.payload)) if (!Object.hasOwn(rules, key) || !rules[key]!(event.payload[key])) throw new Error(`Invalid ${event.type} payload field: ${key}`);
  for (const key of Object.keys(definition.required)) if (!Object.hasOwn(event.payload, key)) throw new Error(`Missing ${event.type} payload field: ${key}`);
  if (event.type === 'usage.observed' && event.payload.data_origin !== undefined && event.payload.data_origin !== event.data_origin) throw new Error('Usage origin mismatch');
  return event;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(event: StoredEvent): string { return createHash('sha256').update(canonical({ type: event.type, payload: event.payload })).digest('hex'); }
export function initialState(runId: string, origin: 'real' | 'demo'): RunState {
  return { runId, origin, status: 'CREATED', endedAt: null, seq: 0, eventIds: [], eventRecords: {}, dispatches: 0, startedWorkers: 0, attempts: {}, quota:null, quotaStatus:'unavailable', artifacts: [], stopReason: null, noProgress: 0, usage: [] };
}
export function reduce(state: RunState, raw: StoredEvent): RunState {
  const event = validateStoredEvent(raw);
  if (event.run_id !== state.runId || event.data_origin !== state.origin) throw new Error('Invalid event identity');
  const digest = fingerprint(event);
  if (Object.hasOwn(state.eventRecords, event.event_id)) {
    const existing = state.eventRecords[event.event_id]!;
    if (existing.fingerprint !== digest || (event.seq !== existing.seq && event.seq !== state.seq + 1)) throw new Error('Conflicting duplicate event');
    return state;
  }
  if (event.seq !== state.seq + 1) throw new Error('Invalid event sequence');
  const next = structuredClone(state); const p = event.payload;
  if (event.type === 'run.state_changed') {
    const target = p.status as RunStatus;
    if (!transitions[state.status].includes(target)) throw new Error(`Illegal state transition ${state.status} -> ${target}`);
    next.status = target;
    if (['COMPLETED', 'PARTIAL', 'STOPPED', 'FAILED', 'BLOCKED', 'INTERRUPTED'].includes(target)) next.endedAt = event.occurred_at;
    else if (target === 'PREFLIGHT' || target === 'RUNNING') next.endedAt = null;
    if (typeof p.reason === 'string') next.stopReason = p.reason;
  } else if (event.type === 'dispatch.intent') {
    const id = p.attempt as string;
    if (state.status !== 'RUNNING') throw new Error('Invalid dispatch intent');
    if (Object.hasOwn(state.attempts, id) || Object.values(state.attempts).some(a => ['intent', 'running', 'candidate'].includes(a.status))) throw new Error('Duplicate active attempt: single worker required');
    next.attempts[id] = { id, unit: p.unit as string, stage: p.stage as string, status: 'intent' }; next.dispatches++;
  } else if (['worker.started', 'worker.exited', 'candidate.received', 'worker.interrupted', 'validation.completed', 'artifact.rejected', 'artifact.quarantined', 'artifact.promoted'].includes(event.type)) {
    const id = p.attempt as string;
    const a = Object.hasOwn(next.attempts, id) ? next.attempts[id] : undefined;
    if (!a) throw new Error('Unknown attempt');
    if (event.type === 'worker.started') { if (a.status !== 'intent') throw new Error('Worker already started'); a.status = 'running'; next.startedWorkers++; }
    if (event.type === 'worker.exited' && a.status !== 'running') throw new Error('Invalid worker exit transition');
    if (event.type === 'candidate.received') { if (!['intent', 'running', 'interrupted'].includes(a.status)) throw new Error('Invalid candidate transition'); a.status = 'candidate'; }
    if (event.type === 'worker.interrupted') { if (!['intent', 'running', 'candidate'].includes(a.status)) throw new Error('Invalid interrupt'); a.status = 'interrupted'; }
    if (event.type === 'validation.completed' && a.status !== 'candidate') throw new Error('Invalid validation transition');
    if (event.type === 'artifact.rejected' || event.type === 'artifact.quarantined') {
      if (a.status !== 'candidate') throw new Error('Invalid rejection transition; accepted artifacts are immutable');
      a.status = event.type === 'artifact.rejected' ? 'rejected' : 'quarantined'; next.noProgress++;
    }
    if (event.type === 'artifact.promoted') {
      if (!['candidate', 'accepted'].includes(a.status) || (a.status === 'accepted' && a.artifact !== p.artifact)) throw new Error('Invalid promotion');
      const artifact = p.artifact as string;
      if (a.status !== 'accepted' && next.artifacts.includes(artifact)) throw new Error('Artifact already belongs to another attempt');
      a.status = 'accepted'; a.artifact = artifact;
      if (!next.artifacts.includes(artifact)) next.artifacts.push(artifact);
      next.noProgress = 0;
    }
  } else if(event.type==='quota.observed'){next.quota=p.snapshot as Record<string,unknown>;next.quotaStatus=typeof next.quota.status==='string'?next.quota.status:'unavailable';
  } else if(['quota.unavailable','quota.stale','quota.boundary_changed'].includes(event.type)){next.quotaStatus=event.type.slice(6);
  } else if (event.type === 'usage.observed') {
    const existing = next.usage.find(u => u.id === p.id);
    if (existing && canonical(existing) !== canonical(p)) throw new Error('Conflicting usage ID');
    if (!existing) next.usage.push(p);
  } else if (event.type === 'stop.requested') { next.stopReason = typeof p.reason === 'string' ? p.reason : 'user_stop'; }
  if (event.type === 'run.finished' && p.status !== state.status) throw new Error('Run finished status does not match state');
  next.seq = event.seq; next.eventIds.push(event.event_id); next.eventRecords[event.event_id] = { seq: event.seq, fingerprint: digest }; return next;
}
