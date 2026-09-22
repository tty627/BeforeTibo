import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, appendFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Journal, redact, atomicJson } from '../../src/storage/journal.js';
import { initialState, reduce, type StoredEvent } from '../../src/core/state.js';

async function fixture() { const dir = await mkdtemp(join(tmpdir(), 'bt-store-')); const j = new Journal(dir, 'run-test', 'demo'); await j.lock(); return { dir, j }; }
describe('durable event store', () => {
  it('AC-09 AC-10 rejects invalid transitions and a second writer', async () => {
    const {dir,j}=await fixture();
    try { await expect(j.transition('COMPLETED')).rejects.toThrow('Illegal'); await expect(new Journal(dir,'run-test','demo').lock()).rejects.toThrow('writer'); expect(j.state.seq).toBe(0); }
    finally { await j.unlock(); await rm(dir,{recursive:true,force:true}); }
  });
  it('AC-11 AC-13 intent consumes a dispatch durably, replay and IDs are idempotent', async () => {
    const {dir,j}=await fixture();
    try {
      await j.transition('PREFLIGHT'); await j.transition('READY'); await j.transition('RUNNING');
      await j.append('dispatch.intent',{attempt:'a1',unit:'u1',stage:'overview'},'intent-1');
      await j.append('dispatch.intent',{attempt:'a1',unit:'u1',stage:'overview'},'intent-1');
      expect(j.state.dispatches).toBe(1);
      const other=new Journal(dir,'run-test','demo'); await other.replay(); expect(other.state.dispatches).toBe(1); expect(other.state.attempts.a1?.status).toBe('intent');
    } finally { await j.unlock(); await rm(dir,{recursive:true,force:true}); }
  });
  it('AC-12 isolates a truncated final record but refuses corruption in the middle', async () => {
    const {dir,j}=await fixture();
    try { await j.transition('PREFLIGHT'); await appendFile(join(dir,'journal.jsonl'),'{"partial":'); await j.replay(true); expect(j.state.status).toBe('PREFLIGHT');
      const saved=await readFile(join(dir,'journal.jsonl'),'utf8'); await writeFile(join(dir,'journal.jsonl'),'bad\n'+saved); await expect(j.replay(true)).rejects.toThrow('corruption');
    } finally { await j.unlock(); await rm(dir,{recursive:true,force:true}); }
  });
  it('AC-76 redacts credentials before persistence',()=> { const result=JSON.stringify(redact({token:'example-value',summary:'token=do-not-store name@example.invalid'})); expect(result).not.toContain('do-not-store'); expect(result).not.toContain('name@example'); expect(result).not.toContain('example-value'); });
});

async function running(j: Journal): Promise<void> {
  await j.transition('PREFLIGHT'); await j.transition('READY'); await j.transition('RUNNING');
}
function event(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return { schema_version: '1.0', run_id: 'run-test', event_id: 'event-1', seq: 1, occurred_at: '2026-09-22T00:00:00Z', data_origin: 'demo', type: 'run.created', payload: { recipe_id: 'repo-book' }, ...overrides };
}
describe('strict durable state semantics', () => {
  it('AC-09 rejects unknown event envelope fields and event types', () => {
    expect(() => reduce(initialState('run-test', 'demo'), { ...event(), unexpected: true } as StoredEvent)).toThrow();
    expect(() => reduce(initialState('run-test', 'demo'), event({ type: 'unknown.event' as StoredEvent['type'] }))).toThrow();
  });
  it('AC-09 validates event-specific payloads before any state update', () => {
    for (const payload of [{}, { recipe_id: 1 }, { recipe_id: 'repo-book', budget: 100 }, { recipe_id: '__proto__' }]) expect(() => reduce(initialState('run-test', 'demo'), event({ payload }))).toThrow();
  });
  it('AC-13 rejects cross-run and conflicting duplicate IDs', () => {
    const first = event(); const state = reduce(initialState('run-test', 'demo'), first);
    expect(reduce(state, first)).toBe(state);
    expect(() => reduce(state, { ...first, run_id: 'run-other' })).toThrow(/identity/);
    expect(() => reduce(state, { ...first, data_origin: 'real' })).toThrow(/identity/);
    expect(() => reduce(state, { ...first, payload: { recipe_id: 'toolsmith-csv' } })).toThrow(/duplicate/);
    expect(() => reduce(state, { ...first, seq: 80 })).toThrow(/duplicate/);
  });
  it('AC-09 AC-37 never downgrades an accepted attempt or substitutes its artifact', async () => {
    const { dir, j } = await fixture();
    try {
      await running(j); await j.append('dispatch.intent', { attempt: 'a1', unit: 'u1', stage: 'overview' });
      await j.append('worker.started', { attempt: 'a1' }); await j.append('candidate.received', { attempt: 'a1' });
      await j.append('artifact.promoted', { attempt: 'a1', artifact: 'artifact-1' });
      await j.append('artifact.promoted', { attempt: 'a1', artifact: 'artifact-1' });
      for (const type of ['artifact.rejected', 'artifact.quarantined', 'worker.interrupted', 'candidate.received'] as const) await expect(j.append(type, { attempt: 'a1' })).rejects.toThrow();
      await expect(j.append('artifact.promoted', { attempt: 'a1', artifact: 'artifact-2' })).rejects.toThrow(/promotion/);
      expect(j.state.artifacts).toEqual(['artifact-1']); expect(j.state.attempts.a1?.status).toBe('accepted');
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-08 enforces a single active worker across different units', async () => {
    const { dir, j } = await fixture();
    try { await running(j); await j.append('dispatch.intent', { attempt: 'a1', unit: 'u1', stage: 'overview' }); await expect(j.append('dispatch.intent', { attempt: 'a2', unit: 'u2', stage: 'overview' })).rejects.toThrow(/single worker/); expect(j.state.dispatches).toBe(1); }
    finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-33 deduplicates usage IDs and rejects changed values or invented zeros', async () => {
    const { dir, j } = await fixture();
    try {
      const usage = { id: 'attempt-1', input_tokens: null, output_tokens: 5, data_origin: 'demo' };
      await j.append('usage.observed', usage); await j.append('usage.observed', usage);
      await expect(j.append('usage.observed', { ...usage, input_tokens: 0 })).rejects.toThrow(/usage ID/);
      await expect(j.append('usage.observed', { ...usage, id: 'attempt-2', output_tokens: -1 })).rejects.toThrow(/payload/);
      await expect(j.append('usage.observed', { ...usage, id: 'attempt-2', data_origin: 'real' })).rejects.toThrow(/origin/);
      expect(j.state.usage).toEqual([usage]);
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
});
describe('journal framing and recovery', () => {
  it('AC-12 preserves a valid final record without a newline and safely appends', async () => {
    const { dir, j } = await fixture();
    try {
      await j.transition('PREFLIGHT'); const path = join(dir, 'journal.jsonl');
      await writeFile(path, (await readFile(path, 'utf8')).trimEnd()); await j.replay(true);
      await j.transition('READY'); const other = new Journal(dir, 'run-test', 'demo'); await other.replay();
      expect(other.state.status).toBe('READY'); expect(other.state.seq).toBe(2); expect((await readdir(dir)).filter(name => name.startsWith('truncated-tail'))).toEqual([]);
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-12 does not truncate valid JSON with an invalid envelope', async () => {
    const { dir, j } = await fixture();
    try {
      await j.transition('PREFLIGHT'); await appendFile(join(dir, 'journal.jsonl'), '{"schema_version":"1.0"}');
      const before = await readFile(join(dir, 'journal.jsonl'), 'utf8');
      await expect(j.replay(true)).rejects.toThrow(); expect(await readFile(join(dir, 'journal.jsonl'), 'utf8')).toBe(before);
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-12 repairs a UTF-8 tail at a byte boundary without losing preceding records', async () => {
    const { dir, j } = await fixture();
    try {
      await j.append('worker.progress', { summary: '中文进度' }); await appendFile(join(dir, 'journal.jsonl'), '{"broken":'); await j.replay(true);
      const other = new Journal(dir, 'run-test', 'demo'); await other.replay(); expect(other.state.seq).toBe(2); expect(await readFile(join(dir, 'journal.jsonl'), 'utf8')).toContain('中文进度');
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-13 serializes concurrent append calls with continuous sequence numbers', async () => {
    const { dir, j } = await fixture();
    try { await Promise.all(Array.from({ length: 12 }, (_, index) => j.append('worker.progress', { summary: `progress ${index}` }))); const other = new Journal(dir, 'run-test', 'demo'); await other.replay(); expect(other.state.seq).toBe(12); }
    finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
});
describe('writer ownership and disk faults', () => {
  it('AC-10 prevents simultaneous stale-lock reclaimers from moving a new writer lock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bt-lock-race-'));
    await writeFile(join(dir, 'writer.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); const reached = new Promise<void>(resolve => { entered = resolve; });
    const first = new Journal(dir, 'run-test', 'demo', { fault: async point => { if (point === 'before-stale-lock-rename') { entered(); await gate; } } });
    const acquired = first.lock(); await reached;
    try {
      const second = new Journal(dir, 'run-test', 'demo'); await expect(second.lock()).rejects.toThrow(/recovery/);
      release(); await acquired; await expect(second.lock()).rejects.toThrow(/writer/);
      expect(JSON.parse(await readFile(join(dir, 'writer.lock'), 'utf8'))).toMatchObject({ pid: process.pid });
    } finally { release(); await acquired.catch(() => undefined); await first.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-10 detects lock replacement before reclaiming', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bt-lock-replace-'));
    await writeFile(join(dir, 'writer.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
    const j = new Journal(dir, 'run-test', 'demo', { fault: async point => { if (point === 'before-stale-lock-rename') await writeFile(join(dir, 'writer.lock'), JSON.stringify({ pid: process.pid, token: 'new-owner' })); } });
    try { await expect(j.lock()).rejects.toThrow(/changed/); expect(JSON.parse(await readFile(join(dir, 'writer.lock'), 'utf8'))).toMatchObject({ token: 'new-owner' }); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-75 an ENOSPC before append leaves state unchanged and blocks further dispatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bt-disk-full-')); let fail = true;
    const j = new Journal(dir, 'run-test', 'demo', { fault: point => { if (fail && point === 'before-append-write') { fail = false; throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); } } });
    await j.lock();
    try { await expect(j.transition('PREFLIGHT')).rejects.toThrow(/disk full/); expect(j.state.seq).toBe(0); await expect(j.transition('PREFLIGHT')).rejects.toThrow(/Storage failed/); }
    finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-11 AC-75 an error after journal sync preserves the dispatch on replay', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bt-disk-sync-')); let fail = false;
    const j = new Journal(dir, 'run-test', 'demo', { fault: point => { if (fail && point === 'after-append-sync') { fail = false; throw new Error('lost process after durable write'); } } });
    await j.lock();
    try {
      await running(j); fail = true;
      await expect(j.append('dispatch.intent', { attempt: 'a1', unit: 'u1', stage: 'overview' })).rejects.toThrow(/durable/);
      expect(j.state.dispatches).toBe(1); await expect(j.append('worker.started', { attempt: 'a1' })).rejects.toThrow(/Storage failed/);
      const recovered = new Journal(dir, 'run-test', 'demo'); await recovered.replay(); expect(recovered.state.dispatches).toBe(1); expect(recovered.state.attempts.a1?.status).toBe('intent');
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-75 a real state-snapshot rename failure preserves journal and removes temp files', async () => {
    const { dir, j } = await fixture();
    try {
      await mkdir(join(dir, 'state.json')); await expect(j.transition('PREFLIGHT')).rejects.toThrow();
      const recovered = new Journal(dir, 'run-test', 'demo'); await recovered.replay(); expect(recovered.state.status).toBe('PREFLIGHT');
      expect((await readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
    } finally { await j.unlock(); await rm(dir, { recursive: true, force: true }); }
  });
  it('AC-75 atomic JSON does not replace an existing destination after a failed write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bt-atomic-'));
    try { const path = join(dir, 'state.json'); await atomicJson(path, { previous: true }); const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; await expect(atomicJson(path, cyclic)).rejects.toThrow(); expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ previous: true }); expect((await readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
});
