import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRealExecution, type RealExecution } from '../../src/adapters/codex/preflight.js';
import { normalizeQuota } from '../../src/adapters/codex/quota.js';
import { defaults } from '../../src/core/config.js';
import { realRunOptions } from '../../src/core/real-run.js';
import { Journal, JournalClosedError } from '../../src/storage/journal.js';
import { quotaReceipt } from '../../src/harvest/report.js';
import { renderState } from '../../src/ui/terminal.js';
import { initialState } from '../../src/core/state.js';
vi.mock('../../src/adapters/codex/preflight.js', () => ({ prepareRealExecution: vi.fn() }));

const directories: string[] = [];
const journals: Journal[] = [];
async function journal(fault?: () => void): Promise<Journal> {
  const dir = await mkdtemp(join(tmpdir(), 'before-tibo-real-options-test-')); directories.push(dir);
  const writer = new Journal(dir, 'run-synthetic', 'real', { fault: point => { if (point === 'before-append-write') fault?.(); } });
  await writer.lock(); journals.push(writer); return writer;
}
function setup() {
  const config = defaults('/synthetic/source'); config.mode = 'quota'; config.quota.poll_seconds = 15;
  const identity = { authType: 'chatgpt' as const, accountIdHash: 'synthetic-account-hash', contextId: 'synthetic-member-context', verified: true };
  const preDispatch = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
  const real = {
    execution: { model: 'synthetic-model' }, identity, configHash: 'synthetic-effective-config-hash',
    mapping: { verified: true, model: 'synthetic-model', windows: [{ limitId: 'synthetic', name: 'primary' }] },
    observation: normalizeQuota({ rateLimitsByLimitId: { synthetic: { primary: { usedPercent: 63, windowDurationMins: 90, resetsAt: 2000000000 }, secondary: null } } }, identity, 1000),
    capabilities: { version: '0.154.0' }, sandbox: { backend: 'synthetic' }, preDispatch,
  } as unknown as RealExecution;
  vi.mocked(prepareRealExecution).mockResolvedValue(real);
  return { config, real, preDispatch };
}
afterEach(async () => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  for (const writer of journals.splice(0)) await writer.unlock();
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('AC-60 AC-66 AC-75 real CLI options safety', () => {
  it('binds the effective execution config to the resume identity', async () => {
    const { config } = setup(); const options = await realRunOptions(config);
    expect(options.identity).toBe('synthetic-account-hash:synthetic-member-context:synthetic-effective-config-hash');
  });
  it('propagates and latches journal disk failures for both dispatch and active monitor', async () => {
    const { config, preDispatch } = setup(); const options = await realRunOptions(config);
    const error = Object.assign(new Error('synthetic disk full'), { code: 'ENOSPC' });
    options.onEvent!(await journal(() => { throw error; }));
    await expect(options.hooks!.preDispatch!()).rejects.toBe(error);
    await expect(options.hooks!.monitor!()).rejects.toBe(error);
    await expect(options.hooks!.preDispatch!()).rejects.toBe(error);
    expect(preDispatch).toHaveBeenCalledTimes(1);
  });
  it('only ignores a closed writer for a late asynchronous observation', async () => {
    const { config, preDispatch } = setup(); let finish!: (reason: string | null) => void;
    preDispatch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const options = await realRunOptions(config); const writer = await journal(); options.onEvent!(writer);
    const pending = options.hooks!.monitor!(); await writer.unlock(); finish(null);
    await expect(pending).resolves.toEqual({ stop: false, cancel: false, reason: '' });
    await expect(options.hooks!.preDispatch!()).rejects.toBeInstanceOf(JournalClosedError);
  });
  it('polls on monotonic elapsed time despite forward and backward wall-clock changes', async () => {
    const { config, preDispatch } = setup(); let monotonic = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(10000);
    const options = await realRunOptions(config); options.onEvent!(await journal());
    await options.hooks!.preDispatch!(); wall.mockReturnValue(10 ** 12);
    await options.hooks!.monitor!(); expect(preDispatch).toHaveBeenCalledTimes(1);
    monotonic += 15000; wall.mockReturnValue(1);
    await options.hooks!.monitor!(); expect(preDispatch).toHaveBeenCalledTimes(2);
  });
  it('shares in-flight checks without dispatching duplicate observations', async () => {
    const { config, preDispatch } = setup(); let finish!: (reason: string | null) => void;
    preDispatch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const options = await realRunOptions(config); const writer = await journal(); options.onEvent!(writer);
    const first = options.hooks!.preDispatch!(); const second = options.hooks!.monitor!(); finish(null);
    await Promise.all([first, second]); expect(preDispatch).toHaveBeenCalledTimes(1); expect(writer.state.seq).toBe(1);
  });
  it('preserves the newest percentages when the reserve is reached and renders the report values', async () => {
    const { config, real, preDispatch } = setup(); const notify = vi.fn(); const options = await realRunOptions(config, notify);
    real.observation.buckets[0]!.windows[0]!.remainingPercent = 9;
    real.observation.buckets[0]!.windows[0]!.usedPercent = 91;
    preDispatch.mockResolvedValue('QUOTA_RESERVE_REACHED');
    const writer = await journal(); options.onEvent!(writer);
    await expect(options.hooks!.preDispatch!()).resolves.toBe('QUOTA_RESERVE_REACHED');
    const receipt = quotaReceipt(writer.state); const terminal = renderState(writer.state);
    expect(receipt.status).toBe('ready'); expect(receipt.buckets[0]!.windows[0]!.remaining_percent).toBe(9);
    expect(terminal).toContain('9% remaining'); expect(terminal).toContain('window 90 min'); expect(terminal).toContain('2000000000 Unix s');
    expect(terminal).toContain('secondary: unavailable'); expect(terminal).not.toContain('synthetic-account-hash'); expect(notify).toHaveBeenCalledTimes(2);
  });
  it('retains the latest snapshot but marks unavailable and changed boundaries explicitly', async () => {
    const { config, preDispatch } = setup(); const options = await realRunOptions(config); const writer = await journal(); options.onEvent!(writer);
    preDispatch.mockResolvedValueOnce('QUOTA_BOUNDARY_POSSIBLY_CHANGED'); await options.hooks!.preDispatch!();
    expect(quotaReceipt(writer.state).status).toBe('boundary_changed'); expect(writer.state.quota?.buckets).toBeDefined();
    preDispatch.mockResolvedValueOnce('execution_context_unavailable_or_changed'); await options.hooks!.preDispatch!();
    expect(quotaReceipt(writer.state).status).toBe('unavailable');
  });
  it('does not emit terminal control characters from untrusted quota labels', async () => {
    const { config, real } = setup(); real.observation.buckets[0]!.limitId = '\u001b[2Jsynthetic';
    const options = await realRunOptions(config); const writer = await journal(); options.onEvent!(writer); await options.hooks!.preDispatch!();
    expect(renderState(writer.state)).not.toContain('\u001b');
  });
  it('AC-70 distinguishes candidate and quarantined attempts from accepted artifacts', () => {
    const state=initialState('run-synthetic','demo');
    const statuses=['rejected','accepted','candidate','quarantined'] as const;
    for(const [index,status] of statuses.entries())state.attempts[`attempt-${index}`]={id:`attempt-${index}`,unit:`unit-${index}`,stage:'synthetic-stage',status};
    const terminal=renderState(state);
    expect(terminal).toContain('\nRun ID: run-synthetic\n');
    expect(terminal).toContain('accepted: 1 | candidate: 1 | quarantined: 1 | rejected: 1');
    expect(terminal).toContain('Recent: unit-1: accepted · unit-2: candidate · unit-3: quarantined');
    expect(terminal).toContain('Artifacts: 0 accepted');
  });
});
