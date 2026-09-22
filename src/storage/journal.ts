import { mkdir, open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState, reduce, validateStoredEvent, type RunState, type StoredEvent } from '../core/state.js';
import type { EventType } from '../core/types.js';

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{16,})\b/g, '[REDACTED]').replace(/(?:Bearer\s+)[^\s"<>]+/gi, 'Bearer [REDACTED]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]').replace(/\b(?:token|password|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '[SECRET]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(token|password|secret|api_?key|authorization|cookie)$/i.test(k) ? '[REDACTED]' : redact(v)]));
  return value;
}
async function syncDirectory(path: string): Promise<void> { const f = await open(path, 'r'); try { await f.sync(); } finally { await f.close(); } }
export async function atomicJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`; const f = await open(tmp, 'wx', 0o600);
  try {
    try { await f.writeFile(JSON.stringify(value, null, 2) + '\n'); await f.sync(); } finally { await f.close(); }
    await rename(tmp, path); await syncDirectory(dirname(path));
  } catch (error) { await unlink(tmp).catch(() => undefined); throw error; }
}
interface Lock { pid: number; token: string }
function parseLock(text: string): Lock {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error('Ambiguous writer lock; refusing recovery'); }
  if (!value || typeof value !== 'object' || !('pid' in value) || !('token' in value) || !Number.isSafeInteger(value.pid) || (value.pid as number) < 1 || typeof value.token !== 'string' || !value.token) throw new Error('Ambiguous writer lock; refusing recovery');
  return value as Lock;
}
export type JournalFaultPoint = 'before-stale-lock-rename' | 'before-append-write' | 'after-append-sync' | 'before-state-snapshot';
export interface JournalOptions { fault?: (point: JournalFaultPoint) => void | Promise<void> }
export class JournalClosedError extends Error {
  constructor() { super('Writer is closing'); this.name = 'JournalClosedError'; }
}
export class Journal {
  state: RunState;
  private token = randomUUID(); private locked = false; private closing = false;
  private poisoned = false; private separatorNeeded = false;
  private pending: Promise<void> = Promise.resolve();
  constructor(readonly dir: string, runId: string, origin: 'real' | 'demo', private readonly options: JournalOptions = {}) { this.state = initialState(runId, origin); }
  private async createLock(): Promise<void> {
    const f = await open(join(this.dir, 'writer.lock'), 'wx', 0o600);
    try { await f.writeFile(JSON.stringify({ pid: process.pid, token: this.token })); await f.sync(); } finally { await f.close(); }
    await syncDirectory(this.dir); this.locked = true; this.closing = false;
  }
  async lock(): Promise<void> {
    if (this.locked) throw new Error('Run already has this writer');
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    try { await this.createLock(); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const recoveryPath = join(this.dir, 'recovery.lock');
    let recovery;
    try { recovery = await open(recoveryPath, 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Writer recovery already active or ambiguous; refusing second writer'); throw error; }
    try {
      await recovery.writeFile(JSON.stringify({ pid: process.pid, token: this.token })); await recovery.sync();
      const path = join(this.dir, 'writer.lock');
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Ambiguous writer lock type');
      const lock = parseLock(await readFile(path, 'utf8'));
      let dead = false;
      try { process.kill(lock.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      if (!dead) throw new Error('Run already has a writer (or lock ownership is uncertain)');
      await this.options.fault?.('before-stale-lock-rename');
      const current = await lstat(path); const currentLock = parseLock(await readFile(path, 'utf8'));
      if (current.ino !== metadata.ino || current.dev !== metadata.dev || currentLock.token !== lock.token || currentLock.pid !== lock.pid) throw new Error('Writer lock changed during recovery');
      // All stale-lock reclaimers take recovery.lock. A fresh writer can only win creation after rename.
      await rename(path, join(this.dir, `stale-lock-${randomUUID()}.json`));
      try { await this.createLock(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another writer won lock recovery'); throw error; }
    } finally { await recovery.close(); await unlink(recoveryPath); }
  }
  async unlock(): Promise<void> {
    if (!this.locked) return;
    this.closing = true; await this.pending;
    const path = join(this.dir, 'writer.lock');
    const lock = parseLock(await readFile(path, 'utf8'));
    if (lock.token !== this.token || lock.pid !== process.pid) throw new Error('Writer lock ownership changed');
    await unlink(path); await syncDirectory(this.dir); this.locked = false;
  }
  async replay(repairTail = false): Promise<RunState> {
    await this.pending;
    const path = join(this.dir, 'journal.jsonl'); let text: string;
    try {
      const metadata = await lstat(path); if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Journal must be a regular file');
      if (metadata.size > 32 * 1024 * 1024) throw new Error('Journal size limit');
      text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.state = initialState(this.state.runId, this.state.origin); return this.state; } throw error; }
    const lines = text.split('\n'); let offset = 0;
    let recovered = initialState(this.state.runId, this.state.origin);
    this.separatorNeeded = text.length > 0 && !text.endsWith('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!; if (!line && i === lines.length - 1) break;
      if (Buffer.byteLength(line) > 64 * 1024) throw new Error('Journal event size limit');
      let raw: unknown;
      try { raw = JSON.parse(line) as unknown; }
      catch {
        if (i !== lines.length - 1) throw new Error('Journal corruption before final line');
        if (!repairTail || !this.locked) throw new Error('Journal truncated tail; writer recovery required');
        const quarantine = await open(join(this.dir, `truncated-tail-${randomUUID()}.txt`), 'wx', 0o600);
        try { await quarantine.writeFile(line); await quarantine.sync(); } finally { await quarantine.close(); }
        const f = await open(path, 'r+'); try { await f.truncate(Buffer.byteLength(text.slice(0, offset))); await f.sync(); } finally { await f.close(); }
        this.state = recovered; this.separatorNeeded = false; this.poisoned = false;
        await this.append('log.truncated', { reason: 'Recovered incomplete final journal line' }); return this.state;
      }
      recovered = reduce(recovered, validateStoredEvent(raw)); offset += line.length + 1;
    }
    this.state = recovered; this.poisoned = false; return this.state;
  }
  append(type: EventType, payload: Record<string, unknown> = {}, eventId = `event-${randomUUID()}`): Promise<StoredEvent> {
    if (this.closing) return Promise.reject(new JournalClosedError());
    const operation = this.pending.then(() => this.appendOne(type, payload, eventId));
    this.pending = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private async appendOne(type: EventType, payload: Record<string, unknown>, eventId: string): Promise<StoredEvent> {
    if (!this.locked) throw new Error('Writer lock required');
    if (this.poisoned) throw new Error('Storage failed; replay under the writer lock before continuing');
    const event: StoredEvent = { schema_version: '1.0', event_id: eventId, run_id: this.state.runId, seq: this.state.seq + 1, occurred_at: new Date().toISOString(), type, data_origin: this.state.origin, payload: redact(payload) as Record<string, unknown> };
    const next = reduce(this.state, event); if (next === this.state) return event;
    const line = JSON.stringify(event) + '\n'; if (Buffer.byteLength(line) > 64 * 1024) throw new Error('Event size limit');
    const path = join(this.dir, 'journal.jsonl');
    try {
      const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
      if (metadata && (!metadata.isFile() || metadata.isSymbolicLink())) throw new Error('Journal must be a regular file');
      if (metadata && metadata.size > 0 && this.state.seq === 0) throw new Error('Existing journal requires replay before appending');
      if ((metadata?.size ?? 0) + Buffer.byteLength(line) > 32 * 1024 * 1024) throw new Error('Journal size limit');
      await this.options.fault?.('before-append-write');
      const f = await open(path, 'a', 0o600);
      try { await f.writeFile((this.separatorNeeded ? '\n' : '') + line); await f.sync(); } finally { await f.close(); }
      if (!metadata) await syncDirectory(this.dir);
      this.state = next; this.separatorNeeded = false;
      await this.options.fault?.('after-append-sync');
      await this.options.fault?.('before-state-snapshot');
      await atomicJson(join(this.dir, 'state.json'), next); return event;
    } catch (error) { this.poisoned = true; throw error; }
  }
  async transition(status: RunState['status'], reason?: string): Promise<void> { await this.append('run.state_changed', { status, ...(reason ? { reason } : {}) }); }
}
