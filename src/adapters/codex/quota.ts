import { isRecord } from './jsonl.js';

export interface IdentityContext {
  authType: 'chatgpt' | 'apiKey' | 'amazonBedrock' | 'unknown';
  /** Opaque hashes from explicitly approved contexts; never emails or credentials. */
  accountIdHash: string | null;
  contextId: string | null;
  verified: boolean;
}
export interface QuotaWindow {
  name: 'primary' | 'secondary'; usedPercent: number | null; remainingPercent: number | null;
  windowDurationMins: number | null; resetsAt: number | null;
}
export interface QuotaBucket { limitId: string; limitName: string | null; windows: QuotaWindow[]; }
export interface QuotaObservation {
  status: 'ready' | 'unavailable' | 'stale' | 'error'; source: 'codex-app-server';
  observedAt: number; identity: IdentityContext; buckets: QuotaBucket[];
  reason: string | null;
  serviceBlocked: boolean;
  attribution: 'Account-wide observation; changes may include other sessions.';
}
export interface QuotaMapping { verified: boolean; model: string | null; windows: Array<{ limitId: string; name: 'primary' | 'secondary' }>; }
const validNumber = (x: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | null => typeof x === 'number' && Number.isFinite(x) && x >= minimum && x <= maximum ? x : null;
export function sameIdentity(a: IdentityContext, b: IdentityContext): boolean {
  return a.verified && b.verified && a.authType === 'chatgpt' && b.authType === 'chatgpt' && a.contextId !== null && a.contextId === b.contextId && a.accountIdHash !== null && a.accountIdHash === b.accountIdHash;
}
export function normalizeQuota(raw: unknown, identity: IdentityContext, observedAt = Date.now()): QuotaObservation {
  const observation: QuotaObservation = { status: 'unavailable', source: 'codex-app-server', observedAt, identity, buckets: [], reason: 'No usable rate limits', serviceBlocked: false, attribution: 'Account-wide observation; changes may include other sessions.' };
  if (!isRecord(raw)) return observation;
  observation.serviceBlocked = raw.ordinaryUsageAllowed === false;
  const multi = raw.rateLimitsByLimitId;
  let entries: [string, unknown][];
  if (isRecord(multi)) entries = Object.entries(multi);
  else if (multi !== null && multi !== undefined) { observation.reason = 'Unsupported bucket representation'; return observation; }
  else if (isRecord(raw.rateLimits) && typeof raw.rateLimits.limitId === 'string') entries = [[raw.rateLimits.limitId, raw.rateLimits]];
  else return observation;
  for (const [key, value] of entries.slice(0, 128)) {
    if (!isRecord(value) || !key || key.length > 200 || (typeof value.limitId === 'string' && value.limitId !== key)) continue;
    if (value.spendControlReached === true || (typeof value.rateLimitReachedType === 'string' && value.rateLimitReachedType !== '')) observation.serviceBlocked = true;
    const windows: QuotaWindow[] = [];
    for (const name of ['primary', 'secondary'] as const) {
      const window = value[name];
      const used = isRecord(window) ? validNumber(window.usedPercent, 0, 100) : null;
      windows.push({ name, usedPercent: used, remainingPercent: used === null ? null : 100 - used, windowDurationMins: isRecord(window) ? validNumber(window.windowDurationMins, 1) : null, resetsAt: isRecord(window) ? validNumber(window.resetsAt, 1) : null });
    }
    observation.buckets.push({ limitId: key, limitName: typeof value.limitName === 'string' ? value.limitName.slice(0, 200) : null, windows });
  }
  if (observation.buckets.some(b => b.windows.some(w => w.remainingPercent !== null))) { observation.status = 'ready'; observation.reason = null; }
  return observation;
}
export function refreshQuotaStatus(snapshot: QuotaObservation, now: number, staleMs: number): QuotaObservation {
  if (!Number.isFinite(now) || !Number.isFinite(staleMs) || staleMs < 1 || !Number.isFinite(snapshot.observedAt) || snapshot.observedAt > now + 5000 || now - snapshot.observedAt > staleMs) return { ...snapshot, status: 'stale', reason: 'Rate limit observation is stale or has an invalid timestamp' };
  return snapshot;
}
export interface QuotaDecision { dispatch: boolean; cancelActive: boolean; reason: string; }
export function quotaGate(options: { snapshot: QuotaObservation | null; previous?: QuotaObservation | null; workerIdentity: IdentityContext; mapping: QuotaMapping; reservePercent: number; now?: number; staleMs?: number }): QuotaDecision {
  const stop = (reason: string): QuotaDecision => ({ dispatch: false, cancelActive: true, reason });
  if (!validNumber(options.reservePercent, 0, 99) && options.reservePercent !== 0) return stop('INVALID_RESERVE_PERCENT');
  if (!options.mapping.verified || !options.mapping.model || !options.mapping.windows.length) return stop('QUOTA_MAPPING_UNVERIFIED');
  if (!options.snapshot) return stop('QUOTA_UNAVAILABLE');
  const snapshot = refreshQuotaStatus(options.snapshot, options.now ?? Date.now(), options.staleMs ?? 60_000);
  if (!sameIdentity(snapshot.identity, options.workerIdentity)) return stop('QUOTA_IDENTITY_UNVERIFIED_OR_CHANGED');
  if (snapshot.status !== 'ready') return stop(`QUOTA_${snapshot.status.toUpperCase()}`);
  if (snapshot.serviceBlocked) return stop('QUOTA_SERVICE_LIMIT_REACHED');
  if (options.previous && !sameIdentity(options.previous.identity, snapshot.identity)) return stop('QUOTA_BOUNDARY_POSSIBLY_CHANGED');
  const previousKeys = options.previous?.buckets.map(b => b.limitId).sort().join('\0');
  if (previousKeys !== undefined && previousKeys !== snapshot.buckets.map(b => b.limitId).sort().join('\0')) return stop('QUOTA_BOUNDARY_POSSIBLY_CHANGED');
  for (const key of options.mapping.windows) {
    const window = snapshot.buckets.find(b => b.limitId === key.limitId)?.windows.find(w => w.name === key.name);
    if (!window || window.remainingPercent === null || window.usedPercent === null || window.resetsAt === null || window.windowDurationMins === null) return stop('QUOTA_WINDOW_UNAVAILABLE');
    if (window.resetsAt * 1000 <= (options.now ?? Date.now())) return stop('QUOTA_BOUNDARY_POSSIBLY_CHANGED');
    const previous = options.previous?.buckets.find(b => b.limitId === key.limitId)?.windows.find(w => w.name === key.name);
    if (options.previous && (!previous || previous.remainingPercent === null || window.remainingPercent > previous.remainingPercent || window.resetsAt !== previous.resetsAt || window.windowDurationMins !== previous.windowDurationMins)) return stop('QUOTA_BOUNDARY_POSSIBLY_CHANGED');
    if (window.remainingPercent <= options.reservePercent) return stop('QUOTA_RESERVE_REACHED');
  }
  return { dispatch: true, cancelActive: false, reason: 'QUOTA_SOFT_BOUNDARY_OK' };
}
export function rateLimitDecision(now: number, retryAfterMs: number | null, deadline: number): { action: 'wait' | 'harvest'; retryAt: number | null } {
  if (retryAfterMs === null || !Number.isFinite(retryAfterMs) || retryAfterMs < 0 || !Number.isFinite(now) || !Number.isFinite(deadline)) return { action: 'harvest', retryAt: null };
  const retryAt = now + Math.max(1000, retryAfterMs);
  return retryAt >= deadline ? { action: 'harvest', retryAt: null } : { action: 'wait', retryAt };
}
