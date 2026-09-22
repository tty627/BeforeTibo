import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults } from '../../src/core/config.js';
import { MockWorker } from '../../src/adapters/mock.js';
import { readRun, resumeRun, startRun, stopRun } from '../../src/core/runner.js';
import { hash } from '../../src/storage/artifacts.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'before-tibo-stop-')); const source = join(root, 'input'); await mkdir(source);
  const content = 'export function add(a,b) { return a+b; }\n'; await writeFile(join(source, 'sum.js'), content);
  const config = defaults(source, 'repo-book'); config.state_dir = join(root, 'state');
  const manifest = { source_commit: hash(content).slice(0, 40), files: [{ path: 'sum.js', sha256: hash(content), size_bytes: Buffer.byteLength(content) }], excluded: [], total_bytes: Buffer.byteLength(content) };
  return { root, source, config, manifest };
}

describe('graceful and repeated interrupt semantics', () => {
  it('AC-44 per-unit repair limit applies independently of dispatch and no-progress ceilings', async () => {
    const f = await fixture();
    try {
      f.config.budget.max_dispatches = 6; f.config.budget.max_consecutive_no_progress = 5; f.config.budget.max_repairs_per_unit = 1;
      const run = await startRun(f.config, { origin: 'demo', source: f.manifest, sourceDir: f.source, worker: new MockWorker('invalid-json') });
      expect(run.dispatches).toBe(2); expect(run.status).toBe('FAILED');
      expect((await readRun(f.config.state_dir, run.runId)).journal.state.noProgress).toBe(2);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it('AC-50 changed stored execution identity blocks resume before another worker call', async () => {
    const f = await fixture();
    const worker = { execute: vi.fn(async () => { throw new Error('Model tasks are not permitted in this fixture'); }) };
    try {
      await expect(startRun(f.config, { origin: 'real', identity: 'synthetic-account-a', source: f.manifest, sourceDir: f.source, worker, fault: point => { if (point === 'after-intent') throw new Error('FAULT: simulated crash'); } })).rejects.toThrow('FAULT');
      const id = (await readdir(join(f.config.state_dir, 'runs')))[0]!;
      await expect(resumeRun(f.config.state_dir, id, { origin: 'real', identity: 'synthetic-account-b', worker })).rejects.toThrow('Identity changed');
      expect(worker.execute).not.toHaveBeenCalled();
      expect((await readRun(f.config.state_dir, id)).journal.state.dispatches).toBe(1);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-71 keeps accepted work distinct from failed exploration and unfinished stages', async () => {
    const f = await fixture();
    try {
      const extra = 'export const synthetic = true;\n'; await writeFile(join(f.source, 'second.js'), extra);
      f.manifest.files.push({ path: 'second.js', sha256: hash(extra), size_bytes: Buffer.byteLength(extra) });
      f.manifest.total_bytes += Buffer.byteLength(extra); f.config.budget.max_repairs_per_unit = 0;
      const normal = new MockWorker(); const failure = new MockWorker('invalid-json');
      const run = await startRun(f.config, {
        origin: 'demo', source: f.manifest, sourceDir: f.source,
        worker: { execute: (job, signal, progress) => (job.stage.id === 'overview' ? normal : failure).execute(job, signal, progress) },
      });
      const receipt = JSON.parse(await readFile(join(run.runDir, 'harvest/receipt.json'), 'utf8'));
      expect(receipt.artifacts).toHaveLength(1); expect(receipt.artifacts[0].unit_id).toBe('overview-1');
      expect(receipt.failed_attempts.length).toBeGreaterThan(0);
      expect(receipt.failed_attempts.every((attempt: { status: string }) => attempt.status === 'rejected')).toBe(true);
      expect(receipt.unfinished_plan).toHaveLength(3);
      expect(receipt.unfinished_plan.some((unit: { unit: string }) => unit.unit === 'overview-1')).toBe(false);
      expect(await readFile(run.report, 'utf8')).toContain('Unfinished / failed');
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-45 default stop allows the current bounded attempt to validate and preserves its artifact', async () => {
    const f = await fixture(); let requested = false;
    try {
      const run = await startRun(f.config, {
        origin: 'demo', source: f.manifest, sourceDir: f.source, worker: new MockWorker('normal', 700),
        onEvent: journal => { if (journal.state.startedWorkers === 1 && !requested) { requested = true; void stopRun(f.config.state_dir, journal.state.runId, false); } },
      });
      expect(run.status).toBe('STOPPED'); expect(run.dispatches).toBe(1);
      const { journal } = await readRun(f.config.state_dir, run.runId);
      expect(journal.state.artifacts).toHaveLength(1); expect(journal.state.stopReason).toBe('user_stop');
      expect(await readFile(run.report, 'utf8')).toContain('DEMO');
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });

  it('AC-46 second Ctrl+C handler invocation cancels an active attempt before the drain interval', async () => {
    const f = await fixture(); let scheduled = false; let interrupt: (() => void) | undefined;
    const listen = process.on.bind(process);
    const spy = vi.spyOn(process, 'on').mockImplementation((event, handler) => {
      if (event === 'SIGINT') interrupt = handler as () => void;
      return listen(event, handler);
    });
    const started = performance.now();
    try {
      const run = await startRun(f.config, {
        origin: 'demo', source: f.manifest, sourceDir: f.source, worker: new MockWorker('delay'),
        onEvent: journal => {
          if (journal.state.startedWorkers === 1 && !scheduled) {
            scheduled = true; expect(interrupt).toBeTypeOf('function'); interrupt!();
            setTimeout(() => interrupt!(), 20);
          }
        },
      });
      expect(run.status).toBe('INTERRUPTED'); expect(run.dispatches).toBe(1);
      expect(performance.now() - started).toBeLessThan(5000);
      expect((await readRun(f.config.state_dir, run.runId)).journal.state.artifacts).toHaveLength(0);
    } finally { spy.mockRestore(); await rm(f.root, { recursive: true, force: true }); }
  });
});
