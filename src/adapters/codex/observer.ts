import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { codexEnvironment, type CapabilityReport } from './exec.js';
import { isRecord } from './jsonl.js';
import { normalizeQuota, type IdentityContext, type QuotaObservation } from './quota.js';
import { ReadOnlyRpcClient } from './rpc.js';

export interface ObserverOptions {
  executable?: string; cwd: string; env?: NodeJS.ProcessEnv; capabilities: CapabilityReport;
  /** Must be established by runner's approved-context checks, not by the Recipe. */
  context: IdentityContext; startupIsolationVerified: boolean; timeoutMs?: number;
}
/** Stdio only. No login, logout, reset, credit, process, or thread API can be called. */
export class StdioQuotaObserver {
  private child: ChildProcessWithoutNullStreams;
  private rpc: ReadOnlyRpcClient;
  private closed = false;
  private bytes = 0;
  private constructor(private options: ObserverOptions) {
    this.child = spawn(options.executable ?? 'codex', ['app-server', '--listen', 'stdio://'], { cwd: options.cwd, env: codexEnvironment(options.env), shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    this.rpc = new ReadOnlyRpcClient(data => this.child.stdin.write(data), options.timeoutMs ?? 5000);
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.bytes += chunk.length;
      if (this.bytes > 20_971_520) this.close();
      else { this.rpc.receive(chunk); if (this.rpc.diagnostics.includes('invalid_or_truncated_protocol')) this.close(); }
    });
    this.child.stderr.on('data', (chunk: Buffer) => { this.bytes += chunk.length; if (this.bytes > 20_971_520) this.close(); });
    this.child.on('error', () => this.close());
    this.child.on('exit', () => this.close());
    this.child.on('close', () => this.close());
    this.child.stdin.on('error', () => this.close());
  }
  static async open(options: ObserverOptions): Promise<StdioQuotaObserver> {
    if (!isAbsolute(options.cwd)) throw new Error('Observer requires absolute cwd');
    if (!options.capabilities.readOnlyObserverProtocol || !options.startupIsolationVerified) throw new Error('BLOCKED_OBSERVER_CONTEXT_UNVERIFIED');
    const observer = new StdioQuotaObserver(options);
    try { await observer.rpc.initialize(); return observer; }
    catch (error) { observer.close(); throw error; }
  }
  async read(): Promise<QuotaObservation> {
    const unknown: IdentityContext = { authType: 'unknown', accountIdHash: null, contextId: this.options.context.contextId, verified: false };
    try {
      const account = await this.rpc.read('account/read');
      if (!isRecord(account) || !isRecord(account.account) || account.account.type !== 'chatgpt') return { ...normalizeQuota(null, unknown), reason: 'ChatGPT-managed account cannot be confirmed' };
      const raw = await this.rpc.read('account/rateLimits/read');
      const accountIdHash = isRecord(raw) && typeof raw.accountId === 'string' ? createHash('sha256').update(raw.accountId).digest('hex') : null;
      const context = this.options.context;
      const identity: IdentityContext = { ...unknown, authType: 'chatgpt', accountIdHash, verified: context.verified && context.authType === 'chatgpt' && accountIdHash !== null && accountIdHash === context.accountIdHash };
      return normalizeQuota(raw, identity);
    } catch { this.close(); return { ...normalizeQuota(null, unknown), status: 'error', reason: 'Read-only account observation failed or timed out' }; }
  }
  close(): void {
    this.rpc.close();
    if (!this.closed) {
      this.closed = true;
      this.child.stdin.end();
      // Only this live object's own process group may be signalled; never use persisted PIDs.
      if (process.platform !== 'win32' && this.child.pid !== undefined) {
        try { process.kill(-this.child.pid, 'SIGKILL'); return; } catch { /* The leader may already have exited. */ }
      }
      this.child.kill('SIGKILL');
    }
  }
}
