import { describe,it,expect } from 'vitest';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRun,readRun,resumeRun } from '../../src/core/runner.js';
import { MockWorker } from '../../src/adapters/mock.js';
import { hash } from '../../src/storage/artifacts.js';
import type { RunConfig } from '../../src/core/types.js';
import { harvest,exportSummary } from '../../src/harvest/report.js';

export async function demoFixture(){
 const root=await mkdtemp(join(tmpdir(),'before-tibo-test-'));const source=join(root,'input');await mkdir(source);const text='export function add(a, b) { return a + b; }\n';await writeFile(join(source,'sum.js'),text);
 const config:RunConfig={schema_version:'1.0',recipe_id:'repo-book',mode:'bounded',target_path:source,state_dir:join(root,'state'),budget:{max_dispatches:4,max_run_minutes:20,job_timeout_seconds:10,max_repairs_per_unit:2,max_consecutive_no_progress:2,finalization_reserve_seconds:5,max_run_disk_mb:50},quota:{required_buckets:[],reserve_percent:10,poll_seconds:15,stale_seconds:60},execution:{auth:'chatgpt',max_workers:1,sandbox:'required',task_network:'deny'},billing:{require_zero_incremental_charge:false,require_user_acknowledgement:true}};
 const manifest={source_commit:hash(text).slice(0,40),files:[{path:'sum.js',sha256:hash(text),size_bytes:Buffer.byteLength(text)}],excluded:[],total_bytes:Buffer.byteLength(text)};
 return {root,source,config,manifest};
}
describe('offline vertical workflow',()=>{
 it('AC-14 AC-15 AC-34 AC-38 AC-39 AC-70 AC-71 AC-72 AC-73 validates, promotes and harvests offline',async()=>{
  const f=await demoFixture();try{
   const run=await startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source});expect(run.status,await readFile(join(run.runDir,'journal.jsonl'),'utf8')).toBe('COMPLETED');
   const {dir,journal,meta}=await readRun(f.config.state_dir,run.runId);expect(journal.state.artifacts).toHaveLength(1);expect(journal.state.dispatches).toBe(1);
   const receipt=JSON.parse(await readFile(join(dir,'harvest','receipt.json'),'utf8'));expect(receipt.data_origin).toBe('demo');expect(Number.isFinite(Date.parse(receipt.ended_at))).toBe(true);expect(receipt.artifacts[0].validations.every((v:{status:string})=>v.status==='passed')).toBe(true);
   const html=await readFile(await harvest(dir,journal.state,meta),'utf8');expect(html).toContain('DEMO');expect(html).toContain('Content-Security-Policy');expect(html).not.toContain('<script');
   await exportSummary(dir,join(f.root,'export'));const exported=await readFile(join(f.root,'export','receipt.json'),'utf8');expect(exported).not.toContain(f.root);expect(exported).not.toContain('sum.js');
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('AC-11 AC-47 crash after intent never repeats uncertain dispatch',async()=>{
  const f=await demoFixture();try{let dir='';await expect(startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source,fault:p=>{if(p==='after-intent')throw new Error('FAULT:crash');}})).rejects.toThrow('FAULT');
   const {readdir}=await import('node:fs/promises');const ids=await readdir(join(f.config.state_dir,'runs'));dir=ids[0]!;const resumed=await resumeRun(f.config.state_dir,dir,{origin:'demo',worker:new MockWorker()});expect(resumed.status).toBe('INTERRUPTED');expect(resumed.dispatches).toBe(1);
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
 it.each(['after-candidate','after-promotion'])('AC-40 AC-48 AC-49 crash at %s recovers without another generation',async point=>{
  const f=await demoFixture();try{
   await expect(startRun(f.config,{origin:'demo',worker:new MockWorker(),source:f.manifest,sourceDir:f.source,fault:p=>{if(p===point)throw new Error('FAULT:crash');}})).rejects.toThrow('FAULT');
   const {readdir}=await import('node:fs/promises');const id=(await readdir(join(f.config.state_dir,'runs')))[0]!;const resumed=await resumeRun(f.config.state_dir,id,{origin:'demo',worker:{execute:()=>{throw new Error('Must not generate again');}}});expect(resumed.dispatches).toBe(1);const {journal}=await readRun(f.config.state_dir,id);expect(journal.state.artifacts).toHaveLength(1);
  }finally{await rm(f.root,{recursive:true,force:true});}
 });
});

describe('bounded dispatch and failure classification',()=>{
 it('AC-16 AC-32 AC-41 AC-43 invalid exit-zero candidates consume budget but never pass',async()=>{
  const f=await demoFixture();try{f.config.budget.max_dispatches=2;const run=await startRun(f.config,{origin:'demo',worker:new MockWorker('invalid-json'),source:f.manifest,sourceDir:f.source});expect(run.dispatches).toBe(2);const {journal}=await readRun(f.config.state_dir,run.runId);expect(journal.state.artifacts).toHaveLength(0);expect(Object.values(journal.state.attempts).every(a=>a.status==='rejected')).toBe(true);expect(journal.state.stopReason).toBe('max_dispatches');}finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('AC-44 no-progress repairs stay bounded',async()=>{
  const f=await demoFixture();try{const run=await startRun(f.config,{origin:'demo',worker:new MockWorker('no-progress'),source:f.manifest,sourceDir:f.source});expect(run.dispatches).toBe(2);const {journal}=await readRun(f.config.state_dir,run.runId);expect(journal.state.stopReason).toBe('no_progress');}finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('AC-35 AC-36 AC-53 AC-74 source modification is quarantined',async()=>{
  const f=await demoFixture();try{const normal=new MockWorker();const run=await startRun(f.config,{origin:'demo',worker:{execute:async(job,signal,progress)=>{const r=await normal.execute(job,signal,progress);await writeFile(join(job.workspace,'project','sum.js'),'malicious change');return r;}},source:f.manifest,sourceDir:f.source});const {journal}=await readRun(f.config.state_dir,run.runId);expect(journal.state.artifacts).toHaveLength(0);expect(Object.values(journal.state.attempts).every(a=>a.status==='quarantined')).toBe(true);expect(await readFile(join(f.source,'sum.js'),'utf8')).toContain('export function add');}finally{await rm(f.root,{recursive:true,force:true});}
 });
 it('AC-45 AC-46 immediate stop cancels an active worker without losing prior budget',async()=>{
  const f=await demoFixture();try{const {stopRun}=await import('../../src/core/runner.js');const result=await startRun(f.config,{origin:'demo',worker:new MockWorker('delay'),source:f.manifest,sourceDir:f.source,onEvent:j=>{if(j.state.startedWorkers===1)void stopRun(f.config.state_dir,j.state.runId,true);}});expect(result.dispatches).toBe(1);expect(result.status).toBe('INTERRUPTED');}finally{await rm(f.root,{recursive:true,force:true});}
 });
});
