import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  startRun: vi.fn(), readRun: vi.fn(), resumeRun: vi.fn(), stopRun: vi.fn(),
  realRunOptions: vi.fn(), recipeHooks: vi.fn(), probeCodex: vi.fn(), probeSandbox: vi.fn(), doctorExecutionContext: vi.fn(),
}));
vi.mock('../../src/core/runner.js', () => ({ startRun: mocks.startRun, readRun: mocks.readRun, resumeRun: mocks.resumeRun, stopRun: mocks.stopRun }));
vi.mock('../../src/core/real-run.js', () => ({ realRunOptions: mocks.realRunOptions, recipeHooks: mocks.recipeHooks }));
vi.mock('../../src/adapters/codex/index.js', () => ({ probeCodex: mocks.probeCodex }));
vi.mock('../../src/sandbox/index.js', () => ({ probeSandbox: mocks.probeSandbox }));
vi.mock('../../src/adapters/codex/preflight.js', () => ({ doctorExecutionContext: mocks.doctorExecutionContext }));
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let stdout = ''; let stderr = '';
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); stdout = ''; stderr = ''; process.exitCode = undefined;
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => { stdout += String(chunk); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => { stderr += String(chunk); return true; });
  mocks.realRunOptions.mockResolvedValue({ origin: 'real', worker: { execute: vi.fn() } });
  mocks.startRun.mockResolvedValue({ runId: 'run-synthetic', status: 'COMPLETED' });
  mocks.resumeRun.mockResolvedValue({ runId: 'run-synthetic', status: 'INTERRUPTED' });
});
afterEach(() => { process.argv = originalArgv; process.exitCode = originalExitCode; vi.restoreAllMocks(); });
async function cli(args: string[]): Promise<void> { process.argv = ['node', 'before-tibo', ...args]; await import('../../src/cli.js'); }
describe('AC-22 AC-50 real CLI authorization and recovery wiring', () => {
  it('blocks missing invocation consent before real preflight or dispatch', async () => {
    await cli(['run', '/synthetic/source', '--non-interactive', '--ack-spend-risk', '--json']);
    expect(process.exitCode).toBe(1); expect(stderr).toContain('BLOCKED_CONSENT_REQUIRED'); expect(mocks.realRunOptions).not.toHaveBeenCalled(); expect(mocks.startRun).not.toHaveBeenCalled();
  });
  it('passes explicitly acknowledged run options to the runner', async () => {
    await cli(['run', '/synthetic/source', '--non-interactive', '--ack-spend-risk', '--ack-execution-risk', '--json']);
    expect(process.exitCode).toBeUndefined(); expect(mocks.realRunOptions).toHaveBeenCalledOnce(); expect(mocks.startRun).toHaveBeenCalledOnce(); expect(JSON.parse(stdout)).toMatchObject({ runId: 'run-synthetic' });
    expect(mocks.realRunOptions.mock.invocationCallOrder[0]).toBeLessThan(mocks.startRun.mock.invocationCallOrder[0]!);
  });
  it('routes expired real resume through locked recovery without authorization or account preflight', async () => {
    mocks.readRun.mockResolvedValue({ meta: { data_origin: 'real', identity: 'saved-synthetic-identity', deadline_at: new Date(1).toISOString() } });
    await cli(['resume', 'run-synthetic', '--non-interactive', '--json']);
    expect(mocks.realRunOptions).not.toHaveBeenCalled(); expect(mocks.resumeRun).toHaveBeenCalledOnce();
    const options = mocks.resumeRun.mock.calls[0]![2] as { identity: string; worker: { execute(): Promise<unknown> } };
    expect(options.identity).toBe('saved-synthetic-identity'); await expect(options.worker.execute()).rejects.toThrow('RECOVERY_MUST_NOT_DISPATCH');
    expect(JSON.parse(stdout)).toMatchObject({ model_calls: 0 });
  });
  it('requires new consent before a non-expired real resume', async () => {
    mocks.readRun.mockResolvedValue({ meta: { data_origin: 'real', deadline_at: new Date(Date.now() + 60000).toISOString(), config: { billing: { require_zero_incremental_charge: false } } } });
    await cli(['resume', 'run-synthetic', '--non-interactive', '--json']);
    expect(stderr).toContain('BLOCKED_CONSENT_REQUIRED'); expect(mocks.realRunOptions).not.toHaveBeenCalled(); expect(mocks.resumeRun).not.toHaveBeenCalled();
  });
  it('separates capability flags from proved isolation and pending account authorization in doctor', async () => {
    mocks.probeCodex.mockResolvedValue({ version: '0.154.0', exec: true, authIdentifiable: false, extensionsIsolation: 'unverified', realExecutionReady: false, reasons: ['Extension isolation has not been verified for this installation'] });
    mocks.probeSandbox.mockResolvedValue({ available: true }); mocks.doctorExecutionContext.mockResolvedValue({ status: 'verified', modelCalls: 0 });
    await cli(['doctor', '--json']);
    const report = JSON.parse(stdout) as Record<string, unknown>;
    expect(report.codex).toEqual({ scope: 'CLI flags and protocol only', version: '0.154.0', exec: true });
    expect(report.isolation).toEqual({ status: 'verified', modelCalls: 0 }); expect(report.real_integration).toBe('NOT RUN'); expect(report.execution_authorization).toContain('Not granted'); expect(mocks.realRunOptions).not.toHaveBeenCalled();
  });
});
