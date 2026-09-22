import { describe, expect, it } from 'vitest';
import { normalizeQuota, quotaGate, rateLimitDecision, type IdentityContext, type QuotaMapping } from '../../src/adapters/codex/index.js';
const now = 1_000_000;
const identity: IdentityContext = { authType: 'chatgpt', contextId: 'approved-demo-context', accountIdHash: 'synthetic-account', verified: true };
const mapping: QuotaMapping = { verified: true, model: 'synthetic-demo-model', windows: [{ limitId: 'custom-bucket', name: 'primary' }, { limitId: 'custom-bucket', name: 'secondary' }] };
function raw(used = 30) { return { rateLimitsByLimitId: { 'custom-bucket': { limitId: 'custom-bucket', primary: { usedPercent: used, windowDurationMins: 37, resetsAt: 2000 }, secondary: { usedPercent: 40, windowDurationMins: 999, resetsAt: 3000 } }, extra: { primary: { usedPercent: 98 } } } }; }
const gate = (used = 30) => ({ snapshot: normalizeQuota(raw(used), identity, now), workerIdentity: identity, mapping, reservePercent: 10, now });
describe('AC-60..69 quota normalization and soft dispatch boundary', () => {
  it('uses actual bucket metadata, does not add window percentages or assume names', () => {
    expect(gate().snapshot.buckets[0]?.windows[0]).toEqual({ name: 'primary', usedPercent: 30, remainingPercent: 70, windowDurationMins: 37, resetsAt: 2000 });
    expect(quotaGate(gate()).dispatch).toBe(true);
    expect(gate().snapshot.attribution).toContain('other sessions');
  });
  it('rejects mismatched or unconfirmed identities and unverified mappings', () => {
    expect(quotaGate({ ...gate(), workerIdentity: { ...identity, accountIdHash: 'different' } }).dispatch).toBe(false);
    expect(quotaGate({ ...gate(), workerIdentity: { ...identity, verified: false } }).dispatch).toBe(false);
    expect(quotaGate({ ...gate(), mapping: { ...mapping, verified: false } }).reason).toBe('QUOTA_MAPPING_UNVERIFIED');
  });
  it('preserves null and invalid percentages as unavailable, never as zero', () => {
    for (const used of [null, -1, 101, '70', NaN]) {
      const snapshot = normalizeQuota({ rateLimitsByLimitId: { 'custom-bucket': { primary: { usedPercent: used } } } }, identity, now);
      expect(snapshot.buckets[0]?.windows[0]?.remainingPercent).toBeNull();
      expect(quotaGate({ ...gate(), snapshot }).dispatch).toBe(false);
    }
    expect(normalizeQuota({ rateLimitsByLimitId: [] }, identity).status).toBe('unavailable');
  });
  it('stops on any missing relevant window, stale snapshot or reached reserve', () => {
    expect(quotaGate(gate(90))).toMatchObject({ dispatch: false, cancelActive: true, reason: 'QUOTA_RESERVE_REACHED' });
    expect(quotaGate({ ...gate(), now: now + 60_001 }).reason).toBe('QUOTA_STALE');
    const data = raw(); delete (data.rateLimitsByLimitId['custom-bucket'] as { secondary?: unknown }).secondary;
    expect(quotaGate({ ...gate(), snapshot: normalizeQuota(data, identity, now) }).reason).toBe('QUOTA_WINDOW_UNAVAILABLE');
  });
  it('never auto-expands on increased balance, changed reset, mapping, identity or period', () => {
    const previous = gate(40).snapshot;
    expect(quotaGate({ ...gate(30), previous }).reason).toBe('QUOTA_BOUNDARY_POSSIBLY_CHANGED');
    for (const field of ['resetsAt', 'windowDurationMins'] as const) {
      const snapshot = gate(40).snapshot; snapshot.buckets[0]!.windows[0]![field] = 4500;
      expect(quotaGate({ ...gate(40), snapshot, previous }).dispatch).toBe(false);
    }
    const snapshot = gate(40).snapshot; snapshot.buckets.pop();
    expect(quotaGate({ ...gate(40), snapshot, previous }).dispatch).toBe(false);
  });
  it('honors explicit service denials even when percentages look usable', () => {
    const data = { ...raw(), ordinaryUsageAllowed: false };
    expect(quotaGate({ ...gate(), snapshot: normalizeQuota(data, identity, now) }).reason).toBe('QUOTA_SERVICE_LIMIT_REACHED');
  });
  it('respects service wait information and wall-clock deadline without dense retries', () => {
    expect(rateLimitDecision(now, 30_000, now + 60_000)).toEqual({ action: 'wait', retryAt: now + 30_000 });
    expect(rateLimitDecision(now, 60_000, now + 30_000).action).toBe('harvest');
    expect(rateLimitDecision(now, null, now + 30_000).action).toBe('harvest');
    expect(rateLimitDecision(now, 0, now + 30_000).retryAt).toBe(now + 1000);
  });
});
