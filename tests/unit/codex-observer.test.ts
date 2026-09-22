import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityReport } from '../../src/adapters/codex/exec.js';

const transport = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: transport.spawn }));
import { StdioQuotaObserver } from '../../src/adapters/codex/observer.js';

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 987654321, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
  });
  const sent: Record<string, unknown>[] = [];
  child.stdin.on('data', (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString()) as Record<string, unknown>;
    sent.push(request);
    if (request.method === 'initialize') queueMicrotask(() => child.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\n'));
  });
  transport.spawn.mockReturnValue(child);
  return { child, sent };
}
const options = {
  cwd: process.cwd(), startupIsolationVerified: true, timeoutMs: 20,
  capabilities: { readOnlyObserverProtocol: true } as CapabilityReport,
  context: { authType: 'unknown' as const, accountIdHash: null, contextId: 'synthetic-DEMO', verified: false },
};

afterEach(() => vi.restoreAllMocks());
describe('read-only observer owned process lifecycle', () => {
  it('cleans its process group when the leader exits, and close is idempotent', async () => {
    const { child } = fakeChild();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const observer = await StdioQuotaObserver.open(options);
    expect(transport.spawn).toHaveBeenLastCalledWith('codex', ['app-server', '--listen', 'stdio://'], expect.objectContaining({ detached: process.platform !== 'win32', shell: false }));
    child.emit('exit', 0);
    observer.close();
    if (process.platform !== 'win32') expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid, 'SIGKILL');
    else expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  });
  it('closes transport after a read timeout and preserves unknown quota', async () => {
    const { child, sent } = fakeChild();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const observer = await StdioQuotaObserver.open(options);
    const result = await observer.read();
    expect(result.status).toBe('error');
    expect(result.identity.verified).toBe(false);
    expect(result.buckets).toEqual([]);
    expect(sent.map(request => request.method)).toEqual(['initialize', 'initialized', 'account/read']);
    if (process.platform !== 'win32') expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    else expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
  it('terminates malformed unsolicited protocol without waiting for another read', async () => {
    const { child } = fakeChild();
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const observer = await StdioQuotaObserver.open(options);
    child.stdout.write('not-json\n');
    if (process.platform !== 'win32') expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    else expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    observer.close();
  });
});
