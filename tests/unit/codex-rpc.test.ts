import { describe, expect, it } from 'vitest';
import { ReadOnlyRpcClient } from '../../src/adapters/codex/index.js';

describe('AC-63 read-only App Server protocol', () => {
  it('requires handshake and correlates concurrent responses by request ID', async () => {
    const sent: Record<string, unknown>[] = [];
    const client = new ReadOnlyRpcClient(line => sent.push(JSON.parse(line) as Record<string, unknown>));
    await expect(client.read('account/read')).rejects.toThrow('not initialized');
    const init = client.initialize();
    expect(sent[0]).toMatchObject({ id: 1, method: 'initialize' });
    client.receive('{"id":1,"result":{"userAgent":"synthetic-DEMO"}}\n'); await init;
    expect(sent[1]).toEqual({ method: 'initialized' });
    const account = client.read('account/read'); const quota = client.read('account/rateLimits/read');
    expect(sent[2]).toMatchObject({ params: { refreshToken: false } });
    client.receive('{"id":3,"result":{"rateLimits":null}}\n{"id":2,"result":{"account":null}}\n');
    expect(await account).toEqual({ account: null }); expect(await quota).toEqual({ rateLimits: null });
    client.close();
  });
  it('rejects write methods even if runtime input bypasses TypeScript', async () => {
    const sent: Record<string, unknown>[] = [];
    const client = new ReadOnlyRpcClient(line => sent.push(JSON.parse(line) as Record<string, unknown>));
    const init = client.initialize(); client.receive('{"id":1,"result":{}}\n'); await init;
    for (const method of ['account/logout', 'account/login/start', 'account/rateLimitResetCredit/consume', 'account/sendAddCreditsNudgeEmail', 'command/exec']) {
      await expect(client.read(method as 'account/read')).rejects.toThrow('rejected');
    }
    expect(sent).toHaveLength(2);
    client.receive('{"id":55,"method":"account/rateLimitResetCredit/consume","params":{}}\n');
    expect(sent[2]).toEqual({ id: 55, error: { code: -32601, message: 'Read-only observer rejects server requests' } });
    client.close();
  });
  it('times out mismatched IDs, ignores late and duplicated responses', async () => {
    const client = new ReadOnlyRpcClient(() => undefined, 15);
    const init = client.initialize(); client.receive('{"id":1,"result":{}}\n'); await init;
    const pending = client.read('account/read');
    client.receive('{"id":999,"result":{}}\n');
    await expect(pending).rejects.toThrow('timed out');
    client.receive('{"id":2,"result":{}}\n{"id":2,"result":{}}\n');
    expect(client.diagnostics).toEqual(['unmatched_response', 'unmatched_response', 'unmatched_response']);
    client.close();
  });
  it('only delivers known account update notifications and never raw RPC errors', async () => {
    const notifications: unknown[] = [];
    const client = new ReadOnlyRpcClient(() => undefined, 100, (method, params) => notifications.push({ method, params }));
    const init = client.initialize(); client.receive('{"id":1,"result":{}}\n'); await init;
    client.receive('{"method":"account/updated","params":{"authMode":null}}\n{"method":"item/agentMessage/delta","params":{"text":"private"}}\n');
    expect(notifications).toEqual([{ method: 'account/updated', params: { authMode: null } }]);
    const account = client.read('account/read'); client.receive('{"id":2,"error":{"message":"secret"}}\n');
    await expect(account).rejects.toThrow('Observer RPC error');
    client.close();
  });
});
