import { isRecord, JsonlParser } from './jsonl.js';

export type ReadMethod = 'account/read' | 'account/rateLimits/read';
const allowed = new Set(['initialize', 'account/read', 'account/rateLimits/read']);
interface Pending { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; }
/** Wire-only client: exposes no account-changing or task-running methods. */
export class ReadOnlyRpcClient {
  private parser = new JsonlParser();
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private ready = false;
  private initializing = false;
  private closed = false;
  readonly diagnostics: string[] = [];
  constructor(private write: (data: string) => void, private timeoutMs = 5000, private onNotification?: (method: string, params: unknown) => void) {}
  async initialize(): Promise<void> {
    if (this.ready || this.initializing) throw new Error('Observer already initialized');
    this.initializing = true;
    try {
      await this.request('initialize', { clientInfo: { name: 'before_tibo', title: 'BeforeTibo read-only quota observer', version: '0.1.0-alpha.1' }, capabilities: { experimentalApi: false } });
      this.write(JSON.stringify({ method: 'initialized' }) + '\n');
      this.ready = true;
    } catch (error) { this.close(); throw error; }
  }
  read(method: ReadMethod): Promise<unknown> {
    if (!this.ready) return Promise.reject(new Error('Observer not initialized'));
    return this.request(method, method === 'account/read' ? { refreshToken: false } : undefined);
  }
  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Observer closed'));
    if (!allowed.has(method)) return Promise.reject(new Error('Read-only observer rejected method'));
    if (this.pending.size >= 8) return Promise.reject(new Error('Observer request limit'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Observer request timed out')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n'); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('Observer transport failed')); }
    });
  }
  receive(chunk: string | Buffer): void {
    if (this.closed) return;
    for (const message of this.parser.push(chunk)) this.handle(message);
    if (this.parser.diagnostics.length) { this.note('invalid_or_truncated_protocol'); this.close(); }
  }
  private handle(message: Record<string, unknown>): void {
    if (typeof message.method === 'string') {
      if ('id' in message) {
        if (typeof message.id === 'string' || typeof message.id === 'number') this.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only observer rejects server requests' } }) + '\n');
        this.note('server_request_rejected'); return;
      }
      if (this.ready && (message.method === 'account/updated' || message.method === 'account/rateLimits/updated')) this.onNotification?.(message.method, message.params);
      return;
    }
    if (typeof message.id !== 'number') { this.note('unmatched_response'); return; }
    const pending = this.pending.get(message.id);
    if (!pending) { this.note('unmatched_response'); return; }
    this.pending.delete(message.id); clearTimeout(pending.timer);
    if (isRecord(message.error)) pending.reject(new Error('Observer RPC error'));
    else if ('result' in message) pending.resolve(message.result);
    else pending.reject(new Error('Invalid observer response'));
  }
  private note(value: string): void { if (this.diagnostics.length < 32) this.diagnostics.push(value); }
  close(): void {
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Observer closed')); }
    this.pending.clear();
  }
}
