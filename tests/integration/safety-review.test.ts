import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink, rename, lstat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defaults } from '../../src/core/config.js';
import { Deadline } from '../../src/core/budget.js';
import { readRun, resumeRun, startRun, stopRun } from '../../src/core/runner.js';
import { MockWorker } from '../../src/adapters/mock.js';
import { hash, pinArtifactFiles, diskUsage } from '../../src/storage/artifacts.js';
import { escapeMarkdown, harvest } from '../../src/harvest/report.js';
import { executeSandboxed, probeSandbox } from '../../src/sandbox/index.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'before-tibo-review-')); const source = join(root, 'input'); await mkdir(source);
  const text = 'export function add(a,b) { return a+b; }\n'; await writeFile(join(source, 'sum.js'), text);
  const config = defaults(source, 'repo-book'); config.state_dir = join(root, 'state'); config.budget.max_dispatches = 1; config.budget.max_repairs_per_unit = 0;
  const manifest = { source_commit: hash(text).slice(0, 40), files: [{ path: 'sum.js', sha256: hash(text), size_bytes: Buffer.byteLength(text) }], excluded: [], total_bytes: Buffer.byteLength(text) };
  return { root, source, config, manifest };
}
describe('independent security review regressions', () => {
  it('AC-17 rejects a state-directory symlink into source before creating run files', async () => {
    const f=await fixture();
    try{await symlink(f.source,f.config.state_dir);await expect(startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source})).rejects.toThrow('outside the source');expect(await readdir(f.source)).toEqual(['sum.js']);}
    finally{await rm(f.root,{recursive:true,force:true});}
  });
  it('AC-17 a directory named with a dot-dot prefix is still inside source',async()=>{
    const f=await fixture();
    try{f.config.state_dir=join(f.source,'..state');await expect(startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source})).rejects.toThrow('outside the source');expect(await readdir(f.source)).toEqual(['sum.js']);}
    finally{await rm(f.root,{recursive:true,force:true});}
  });
  it('AC-72 escapes active Markdown and raw HTML in report metadata',()=>{
    const text=escapeMarkdown('![tracking](https://example.invalid/x)\n<img src="https://example.invalid/x">');
    expect(text).toContain('\\!\\[tracking\\]');expect(text).toContain('\\<img');expect(text).not.toContain('\n');
  });
  it('AC-37 AC-40 candidate bytes cannot change between validation and promotion', async () => {
    const f = await fixture();
    try {
      const run = await startRun(f.config, { origin: 'demo', worker: new MockWorker(), source: f.manifest, sourceDir: f.source, hooks: { validate: async (job) => { await writeFile(join(job.workspace, 'out/repo-book/index.md'), '# This unvalidated replacement must not inherit earlier checks.\n'); return []; } } });
      const { journal } = await readRun(f.config.state_dir, run.runId);
      expect(journal.state.artifacts).toHaveLength(0); expect(Object.values(journal.state.attempts)[0]?.status).toBe('quarantined');
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-39 completed recovery does not require an executable validator backend', async () => {
    const f = await fixture();
    try {
      const run = await startRun(f.config, { origin: 'demo', worker: new MockWorker(), source: f.manifest, sourceDir: f.source });
      const recovered = await resumeRun(f.config.state_dir, run.runId, { origin: 'demo', worker: { execute: () => { throw new Error('Unexpected worker'); } }, hooks: { prepare: () => { throw new Error('Unexpected validator backend'); } } });
      expect(recovered.status).toBe('COMPLETED'); expect(recovered.dispatches).toBe(1);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-50 expired recovery only harvests, without preparing baseline execution', async () => {
    const f = await fixture();
    try {
      await expect(startRun(f.config, { origin: 'demo', worker: new MockWorker(), source: f.manifest, sourceDir: f.source, fault: (point) => { if (point === 'after-intent') throw new Error('FAULT: stopped process'); } })).rejects.toThrow('FAULT');
      const runId = (await readdir(join(f.config.state_dir, 'runs')))[0]!;
      const { meta } = await readRun(f.config.state_dir, runId);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(meta.deadline_at) + 1);
      try {
        const recovered = await resumeRun(f.config.state_dir, runId, { origin: 'demo', worker: { execute: () => { throw new Error('Unexpected worker'); } }, hooks: { prepare: () => { throw new Error('Unexpected validator backend'); } } });
        expect(recovered.status).toBe('INTERRUPTED'); expect(recovered.dispatches).toBe(1);
      } finally { clock.mockRestore(); }
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-77 records one clock rollback during the last active unit without extending its deadline',async()=>{
    const f=await fixture();const readings=vi.spyOn(Deadline.prototype,'remaining');const wallNow=Date.now.bind(Date);let restoreWallClock=()=>{};let beforeRollback=0;
    try{
      const run=await startRun(f.config,{origin:'demo',source:f.manifest,sourceDir:f.source,worker:{execute:async(job,signal,onProgress)=>{
        beforeRollback=readings.mock.results.at(-1)!.value.remaining;
        const clock=vi.spyOn(Date,'now').mockImplementation(()=>wallNow()-60_000);restoreWallClock=()=>clock.mockRestore();
        // Observe repeated live control polls after dispatch, with no later unit to detect the jump.
        await vi.waitFor(()=>expect(readings.mock.results.filter(result=>result.type==='return'&&result.value.clockJump).length).toBeGreaterThanOrEqual(3),{interval:25,timeout:2000});
        return new MockWorker().execute(job,signal,onProgress);
      }}});
      expect(run.status).toBe('COMPLETED');expect(run.dispatches).toBe(1);
      const jumped=readings.mock.results.filter(result=>result.type==='return'&&result.value.clockJump).map(result=>result.value.remaining as number);
      expect(jumped.length).toBeGreaterThanOrEqual(3);expect(jumped[0]).toBeLessThan(beforeRollback);
      for(let index=1;index<jumped.length;index++)expect(jumped[index]).toBeLessThanOrEqual(jumped[index-1]!);
      const {meta}=await readRun(f.config.state_dir,run.runId);expect(Date.parse(meta.deadline_at)-Date.parse(meta.started_at)).toBe(f.config.budget.max_run_minutes*60_000);
      const events=(await readFile(join(run.runDir,'journal.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line) as {type:string;payload:{summary?:string}});
      expect(events.filter(event=>event.type==='worker.progress'&&event.payload.summary==='clock_jump_detected')).toHaveLength(1);
    }finally{restoreWallClock();readings.mockRestore();await rm(f.root,{recursive:true,force:true});}
  },5000);
  it('artifact pinning detects exact bytes independently of modification timestamps', async () => {
    const f = await fixture();
    try {
      const pinned = await pinArtifactFiles(f.source, ['sum.js']); const contents = await readFile(join(f.source, 'sum.js'), 'utf8');
      await writeFile(join(f.source, 'sum.js'), contents.replace('a+b', 'a-b')); const changed = await pinArtifactFiles(f.source, ['sum.js']);
      expect(changed[0]?.size_bytes).toBe(pinned[0]?.size_bytes); expect(changed[0]?.sha256).not.toBe(pinned[0]?.sha256);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
  it('AC-45 a slow quota observer cannot block an immediate stop',async()=>{
    const f=await fixture();let scheduled=false;let calls=0;const started=performance.now();
    try{
      const run=await startRun(f.config,{origin:'demo',source:f.manifest,sourceDir:f.source,worker:new MockWorker('delay'),hooks:{monitor:()=>{calls++;return new Promise(()=>undefined);}},onEvent:journal=>{if(journal.state.startedWorkers===1&&!scheduled){scheduled=true;setTimeout(()=>{void stopRun(f.config.state_dir,journal.state.runId,true);},250);}}});
      expect(run.status).toBe('INTERRUPTED');expect(calls).toBe(1);expect(performance.now()-started).toBeLessThan(2000);
    }finally{await rm(f.root,{recursive:true,force:true});}
  },5000);
  it('AC-61 AC-62 AC-68 harvest preserves independent quota windows and unknown values',async()=>{
    const f=await fixture();
    try{
      const run=await startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source,capabilities:{codex_version:'synthetic-fixture',model:null,argv:['private arguments'],identity:'private-account'}});
      const {dir,journal,meta}=await readRun(f.config.state_dir,run.runId);
      journal.state.quota={source:'codex-app-server',observedAt:1,identity:{accountIdHash:'private-account'},buckets:[{limitId:'synthetic-bucket',limitName:'Synthetic test limits',windows:[{name:'custom-window',remainingPercent:37,usedPercent:63,windowDurationMins:90,resetsAt:200},{name:'missing-window',remainingPercent:null,usedPercent:null,windowDurationMins:null,resetsAt:null}]}]};journal.state.quotaStatus='stale';
      await harvest(dir,journal.state,meta);const contents=await readFile(join(dir,'harvest/receipt.json'),'utf8');const report=JSON.parse(contents) as {quota:{status:string;buckets:{windows:{remaining_percent:number|null}[]}[]}};
      expect(report.quota.status).toBe('stale');expect(report.quota.buckets[0]!.windows.map(window=>window.remaining_percent)).toEqual([37,null]);expect(contents).not.toContain('private-account');
      const capabilities=await readFile(join(dir,'capabilities.json'),'utf8');expect(capabilities).toContain('synthetic-fixture');expect(capabilities).not.toContain('private');
    }finally{await rm(f.root,{recursive:true,force:true});}
  });
  it('AC-75 disk polling tolerates atomic rename races without ignoring unsafe links',async()=>{
    const f=await fixture();
    try{
      const first=join(f.root,'first');const second=join(f.root,'second');await mkdir(first);await writeFile(join(first,'record.json'),'bounded fixture');
      await Promise.all([ (async()=>{for(let index=0;index<100;index++){await rename(first,second);await rename(second,first);}})(),(async()=>{for(let index=0;index<100;index++)expect(await diskUsage(f.root)).toBeGreaterThanOrEqual(0);})() ]);
      await symlink(f.source,join(f.root,'unsafe-link'));await expect(diskUsage(f.root)).rejects.toThrow('Symlink');
    }finally{await rm(f.root,{recursive:true,force:true});}
  });
  it('AC-46 AC-49 immediate stop cancels validation and resume checks saved candidate without dispatch',async()=>{
    if(!(await probeSandbox()).available)return;
    const f=await fixture();let runId='';let cancelled=false;
    try{
      const run=await startRun(f.config,{origin:'demo',source:f.manifest,sourceDir:f.source,worker:new MockWorker(),onEvent:journal=>{runId=journal.state.runId;},hooks:{validate:async(job,_result,signal)=>{
        const scratch=join(job.workspace,'validator-scratch');await mkdir(scratch);
        try{const processResult=await executeSandboxed({command:process.execPath,args:['-e','console.log("validation-ready");setInterval(()=>{},1000);'],cwd:scratch,writableRoots:[scratch],timeoutMs:10_000,signal,onStdout:()=>{void stopRun(f.config.state_dir,runId,true);}});cancelled=processResult.cancelled;signal?.throwIfAborted();return [];}
        finally{await rm(scratch,{recursive:true,force:true});}
      }}});
      expect(cancelled).toBe(true);expect(run.status).toBe('INTERRUPTED');const {journal}=await readRun(f.config.state_dir,run.runId);expect(journal.state.artifacts).toHaveLength(0);expect(Object.values(journal.state.attempts)[0]?.status).toBe('interrupted');
      const recovered=await resumeRun(f.config.state_dir,run.runId,{origin:'demo',worker:{execute:()=>{throw new Error('Saved candidate must not require another dispatch');}}});
      expect(recovered.status).toBe('COMPLETED');expect(recovered.dispatches).toBe(1);expect((await readRun(f.config.state_dir,run.runId)).journal.state.artifacts).toHaveLength(1);
    }finally{await rm(f.root,{recursive:true,force:true});}
  },15_000);
  it('AC-75 disk accounting permits only an exact runner-owned read-only dependency link',async()=>{
    const f=await fixture();
    try{
      const trusted=join(f.root,'trusted-node-modules');await symlink(f.source,trusted);const allowed=new Map([[trusted,await import('node:fs/promises').then(fs=>fs.realpath(f.source))]]);
      expect(await diskUsage(f.root,allowed)).toBeGreaterThan(0);await expect(diskUsage(f.root,new Map([[trusted,join(f.root,'elsewhere')]]))).rejects.toThrow('link changed');await symlink(f.source,join(f.root,'worker-link'));await expect(diskUsage(f.root,allowed)).rejects.toThrow('Symlink');
    }finally{await rm(f.root,{recursive:true,force:true});}
  });
  it('AC-75 validator profile links and sockets count themselves without following targets or exempting worker paths',async()=>{
    const root=await mkdtemp(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'btd-'));const outside=await mkdtemp(join(tmpdir(),'beforetibo-disk-outside-'));const scratch=join(root,'validation-scratch');const server=createServer();
    try{
      await mkdir(scratch);await writeFile(join(outside,'private.bin'),Buffer.alloc(8192));await writeFile(join(scratch,'profile.bin'),'browser profile');
      const link=join(scratch,'SingletonSocket');await symlink(outside,link);const socket=join(scratch,'s');await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});
      expect(await diskUsage(root,undefined,scratch)).toBe(Buffer.byteLength('browser profile')+(await lstat(link)).size+(await lstat(socket)).size);
      await symlink(outside,join(root,'worker-link'));await expect(diskUsage(root,undefined,scratch)).rejects.toThrow('Symlink');
      await expect(diskUsage(root,undefined,root)).rejects.toThrow('Invalid validator scratch');
    }finally{if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
  });
  it('AC-21 AC-75 browser-sized validator scratch growth triggers the run disk budget and cancels execution',async()=>{
    if(!(await probeSandbox()).available)return;
    const f=await fixture();f.config.budget.max_run_disk_mb=50;let cancelled=false;let abortReason='';
    try{
      const run=await startRun(f.config,{origin:'demo',source:f.manifest,sourceDir:f.source,worker:{execute:async(job,signal,onProgress)=>{expect(job.validationRoot).toBeUndefined();return new MockWorker().execute(job,signal,onProgress);}},hooks:{validate:async(job,_result,signal)=>{
        expect(job.validationRoot).toMatch(/\/validation-scratch$/u);const scratch=join(job.validationRoot!,'browser-profile');await mkdir(scratch);
        try{
          const result=await executeSandboxed({command:process.execPath,args:['-e','require("node:fs").writeFileSync("download.bin",Buffer.alloc(51*1024*1024));setInterval(()=>{},1000);'],cwd:scratch,writableRoots:[scratch],timeoutMs:10_000,signal});
          cancelled=result.cancelled;abortReason=signal?.reason instanceof Error?signal.reason.message:'';signal?.throwIfAborted();return [];
        }finally{await rm(scratch,{recursive:true,force:true});}
      }}});
      expect(cancelled).toBe(true);expect(abortReason).toBe('disk_limit');expect(run.status).toBe('INTERRUPTED');expect(run.dispatches).toBe(1);expect((await readRun(f.config.state_dir,run.runId)).journal.state.artifacts).toHaveLength(0);
    }finally{await rm(f.root,{recursive:true,force:true});}
  },15_000);
});
