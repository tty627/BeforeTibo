import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexExecAdapter, buildExecArgs, codexEnvironment, type CapabilityReport, type ExecOptions } from '../../src/adapters/codex/index.js';
import { executeProcess } from '../../src/sandbox/process.js';
vi.mock('../../src/sandbox/process.js', () => ({ executeProcess: vi.fn() }));
const cap: CapabilityReport = { executable: 'codex', version: '0.154.0', exec: true, jsonl: true, outputSchema: true, sandboxPolicies: ['workspace-write'], explicitApprovalPolicy: true, ignoreUserConfig: true, ignoreRules: true, ephemeral: true, readOnlyObserverProtocol: true, authIdentifiable: false, extensionsIsolation: 'unverified', realExecutionReady: false, reasons: [] };
const options = (cwd = '/isolated'): ExecOptions => ({ cwd, prompt: 'private prompt', schemaPath: '/controlled/schema.json', resultPath: join(cwd, 'candidate.json'), capabilities: cap, identity: { authType: 'chatgpt', contextId: 'synthetic-context', accountIdHash: 'synthetic-account', verified: true }, sandboxVerified: true, extensionsDisabledVerified: true, ackSpendRisk: true, ackExecutionRisk: true, timeoutMs: 1000, validateCandidate: value => typeof value === 'object' && value !== null && 'schema_version' in value });
const dirs: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
describe('Codex execution safety and exit semantics', () => {
  it('builds argv with explicit sandbox, no approvals, stdin prompt and no secret environment', () => {
    const args = buildExecArgs(options('/path with spaces'));
    expect(args).toContain('workspace-write'); expect(args).toContain('approval_policy="never"');
    expect(args).toContain('/path with spaces'); expect(args.at(-1)).toBe('-'); expect(args.join(' ')).not.toContain('private prompt');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(codexEnvironment({ PATH: '/bin', HOME: '/user', CODEX_API_KEY: 'secret', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--require evil', CODEX_HOME: '/approved' })).toEqual({ PATH: '/bin', HOME: '/user', CODEX_HOME: '/approved' });
  });
  it('blocks missing proof, API auth, absent consent, unsupported versions and billing guarantees', () => {
    expect(() => buildExecArgs({ ...options(), requireZeroIncrementalCharge: true })).toThrow('NO_HARD_BILLING_GUARD');
    expect(() => buildExecArgs({ ...options(), ackSpendRisk: false })).toThrow('CONSENT');
    expect(() => buildExecArgs({ ...options(), identity: { ...options().identity, authType: 'apiKey' } })).toThrow('AUTH');
    expect(() => buildExecArgs({ ...options(), extensionsDisabledVerified: false })).toThrow('BOUNDARY');
    expect(() => buildExecArgs({ ...options(), capabilities: { ...cap, version: '999.0.0' } })).toThrow('CAPABILITIES');
    expect(() => buildExecArgs({ ...options(), resultPath: '/host/private.json' })).toThrow('inside isolated');
  });
  it('AC-28 preserves verified named permissions without a competing legacy sandbox flag', () => {
    const controls = ['default_permissions="synthetic-profile"', 'permissions.synthetic-profile={network={enabled=false}}'];
    const args = buildExecArgs({ ...options(), controlledConfig: controls });
    expect(args).toContain('--strict-config'); expect(args).toContain('--skip-git-repo-check'); expect(args).toContain(controls[0]);
    expect(args).not.toContain('--sandbox'); expect(args).not.toContain('--ignore-user-config'); expect(args).not.toContain('sandbox_workspace_write.network_access=false');
  });
  it('AC-60 blocks a changed actual attempt context before starting any model process', async () => {
    const verifyExecutionCwd = vi.fn(async () => { throw new Error('BLOCKED_EXECUTION_CONFIGURATION_CHANGED'); });
    await expect(new CodexExecAdapter().execute({ ...options('/actual/attempt'), verifyExecutionCwd })).rejects.toThrow('BLOCKED_EXECUTION_CONFIGURATION_CHANGED');
    expect(verifyExecutionCwd).toHaveBeenCalledWith('/actual/attempt'); expect(executeProcess).not.toHaveBeenCalled();
  });
  it('exit zero with invalid candidate remains failed, no source or reasoning forwarded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beforetibo-adapter-test-')); dirs.push(dir);
    await writeFile(join(dir, 'candidate.json'), '{"claim":"all passed"}');
    vi.mocked(executeProcess).mockImplementationOnce(async opts => {
      opts.onStdout?.(Buffer.from('{"type":"item.completed","item":{"type":"reasoning","text":"private source"}}\n{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":8}}\n'));
      return { exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: false, outputTruncated: false, durationMs: 5 };
    });
    const events: unknown[] = [];
    const result = await new CodexExecAdapter().execute({ ...options(dir), onEvent: event => events.push(event) });
    expect(result.status).toBe('failed'); expect(result.candidate).toBeNull(); expect(result.diagnostics).toContain('candidate_missing_or_invalid');
    expect(JSON.stringify(events)).not.toContain('private source');
    expect(vi.mocked(executeProcess).mock.calls[0]?.[0].captureOutput).toBe(false);
  });
  it('returns a candidate only after schema validation and never promotes it itself', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'beforetibo-adapter-test-')); dirs.push(dir);
    await writeFile(join(dir, 'candidate.json'), '{"schema_version":"1.0"}');
    vi.mocked(executeProcess).mockResolvedValueOnce({ exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: false, outputTruncated: false, durationMs: 5 });
    expect(await new CodexExecAdapter().execute(options(dir))).toMatchObject({ status: 'candidate', candidate: { schema_version: '1.0' }, usage: { usage_completeness: 'partial' } });
  });
  it('does not accept files from failed, timed out or truncated workers', async () => {
    for (const patch of [{ exitCode: 1 }, { timedOut: true, exitCode: null }, { outputTruncated: true }]) {
      vi.mocked(executeProcess).mockResolvedValueOnce({ exitCode: 0, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: false, outputTruncated: false, durationMs: 5, ...patch });
      const result = await new CodexExecAdapter().execute(options());
      expect(result.candidate).toBeNull(); expect(result.status).not.toBe('candidate');
    }
  });
});
