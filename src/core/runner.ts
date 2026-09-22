import { mkdir, readFile, cp, access, unlink, realpath, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadRecipe, validateContract, validateRunConfig } from './contracts.js';
import type { AgentResult, Recipe, RunConfig, ValidationResult } from './types.js';
import type { PreparedJob, SourceManifest, Worker } from './worker.js';
import { Journal, atomicJson } from '../storage/journal.js';
import { diskUsage, hash, listArtifacts, promote, pinArtifactFiles, type PinnedArtifactFile } from '../storage/artifacts.js';
import { createSnapshot, resolveSafePath, isWithinRoot } from '../workspace/index.js';
import { validateStructural } from '../validators/structural.js';
import { Deadline, dispatchBlock } from './budget.js';
import { harvest, type RunMetadata } from '../harvest/report.js';

export interface RunHooks {
  prepare?(runDir:string,meta:RunMetadata,source:SourceManifest,signal?:AbortSignal):Promise<void>;
  validate?(job:PreparedJob,result:AgentResult,signal?:AbortSignal):Promise<ValidationResult[]>;
  /** Only runner-created read-only dependency links, never candidate-selected exclusions. */
  readonlyDependencyLinks?:ReadonlyMap<string,string>;
  preDispatch?():Promise<string|null>;
  monitor?():Promise<{stop:boolean;cancel:boolean;reason:string}>;
}
export interface RunOptions { origin:'real'|'demo';worker:Worker;source?:SourceManifest;sourceDir?:string;identity?:string;capabilities?:Record<string,unknown>;onEvent?:(journal:Journal)=>void;fault?:(point:string)=>void;hooks?:RunHooks; }
export interface RunOutcome { runId:string;runDir:string;status:string;report:string;dispatches:number; }
export function deterministicPlan(recipe:Recipe,source:SourceManifest):{unit:string;stage:string}[] {
  // One unit per stage is the finite default plan. max_units remains a ceiling, not a quota.
  const limit=recipe.id==='repo-book' && source.files.length<2?1:recipe.stages.length;
  return recipe.stages.slice(0,limit).map(s=>({unit:`${s.id}-1`,stage:s.id}));
}
async function canonicalFuturePath(value:string):Promise<string>{let existing=resolve(value);const suffix:string[]=[];while(true){try{return join(await realpath(existing),...suffix);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const parent=dirname(existing);if(parent===existing)throw error;suffix.unshift(basename(existing));existing=parent;}}}
async function outside(source:string,state:string):Promise<void>{const [sourceRoot,stateRoot]=await Promise.all([canonicalFuturePath(source),canonicalFuturePath(state)]);if(isWithinRoot(sourceRoot,stateRoot))throw new Error('State directory must be outside the source');}
export async function startRun(config:RunConfig,options:RunOptions):Promise<RunOutcome> {
  validateRunConfig(config);await outside(config.target_path,config.state_dir);
  const recipe=loadRecipe(config.recipe_id);const id=`run-${randomUUID()}`;const dir=join(resolve(config.state_dir),'runs',id);await mkdir(dir,{recursive:true,mode:0o700});
  const j=new Journal(dir,id,options.origin);await j.lock();
  try {
    await j.append('run.created',{recipe_id:recipe.id});await j.transition('PREFLIGHT');
    let source:SourceManifest;
    if(options.source&&options.sourceDir) {source=options.source;await cp(options.sourceDir,join(dir,'source'),{recursive:true,dereference:false});}
    else if(recipe.input.kind==='repository') source=await createSnapshot({source:config.target_path,destination:join(dir,'source')});
    else {await mkdir(join(dir,'source'));source={source_commit:null,files:[],excluded:[],total_bytes:0};}
    if(recipe.id==='repo-book'&&!source.files.some(f=>/\.(?:[cm]?[jt]sx?|py|go|rs|java|c|cpp|rb|sh)$/.test(f.path)))throw new Error('BLOCKED: no identifiable source code in approved snapshot');
    const started=new Date();const meta:RunMetadata={run_id:id,data_origin:options.origin,recipe_version:recipe.version,started_at:started.toISOString(),deadline_at:new Date(started.getTime()+config.budget.max_run_minutes*60000).toISOString(),config,identity:options.identity??null,source_commit:source.source_commit,plan:deterministicPlan(recipe,source)};
    await atomicJson(join(dir,'run.json'),meta);await atomicJson(join(dir,'policy.json'),{config_hash:hash(JSON.stringify(config)),identity:meta.identity,deadline_at:meta.deadline_at});await atomicJson(join(dir,'source-manifest.json'),source);
    if(options.capabilities){
      const allowed=new Set(['node_version','codex_version','adapter_version','platform','architecture','model','model_source','sandbox_backend','sandbox_verified','auth_kind','quota_verified','quota_buckets','identity_verified','extensions_verified']);
      const summary=Object.fromEntries(Object.entries(options.capabilities).filter(([key,value])=>allowed.has(key)&&(value===null||typeof value==='boolean'||(typeof value==='string'&&value.length<=200&&!/[\r\n]/u.test(value))||(key==='quota_buckets'&&Array.isArray(value)&&value.length<=20&&value.every(item=>typeof item==='string'&&/^[a-zA-Z0-9._:-]{1,80}$/u.test(item))))));
      await atomicJson(join(dir,'capabilities.json'),summary);
    }
    const preparation=new AbortController();const preparationTimer=setTimeout(()=>preparation.abort(new Error('preparation_deadline')),Math.max(0,Date.parse(meta.deadline_at)-Date.now()));
    try{await options.hooks?.prepare?.(dir,meta,source,preparation.signal);preparation.signal.throwIfAborted();}finally{clearTimeout(preparationTimer);}
    await j.transition('READY');await j.transition('RUNNING');
    return await drive(dir,j,meta,source,recipe,options);
  } catch(e) {if(j.state.status==='PREFLIGHT')await j.transition('BLOCKED',(e as Error).message);throw e;} finally {await j.unlock();}
}
async function exists(path:string):Promise<boolean>{try{await access(path);return true;}catch{return false;}}
async function checkCandidate(dir:string,j:Journal,meta:RunMetadata,source:SourceManifest,recipe:Recipe,attempt:string,options:RunOptions,signal?:AbortSignal):Promise<boolean> {
  signal?.throwIfAborted();
  const a=j.state.attempts[attempt]!;const workspace=join(dir,'attempts',attempt,'workspace');
  const raw=JSON.parse(await readFile(join(dir,'attempts',attempt,'candidate-result.json'),'utf8')) as unknown;
  const result=validateContract<AgentResult>('agent-result',raw); const stage=recipe.stages.find(s=>s.id===a.stage)!;
  if(result.outcome!=='candidate') {await j.append('artifact.rejected',{attempt,reason:result.outcome});return false;}
  const validationRoot=await resolveSafePath(dir,'validation-scratch');await mkdir(validationRoot,{recursive:true,mode:0o700});
  const job:PreparedJob={attemptId:attempt,unitId:a.unit,stage,recipe,workspace,source,origin:meta.data_origin,timeoutMs:meta.config.budget.job_timeout_seconds*1000,previousFailure:null,validationRoot};
  let validations=await validateStructural(workspace,result,recipe,stage,source);
  let expectedFiles:PinnedArtifactFile[]=[];
  // Pin candidate bytes before any executable validator runs. A late edit must not inherit earlier checks.
  if(validations.every(v=>!v.required||v.status==='passed')){
    const originalFiles=await pinArtifactFiles(workspace,result.artifact_candidates.flatMap(c=>c.paths));
    const executable=options.hooks?.validate?await options.hooks.validate(job,result,signal):[];
    signal?.throwIfAborted();
    validations=[...await validateStructural(workspace,result,recipe,stage,source),...executable];
    expectedFiles=await pinArtifactFiles(workspace,result.artifact_candidates.flatMap(c=>c.paths));
    if(originalFiles.some(file=>!expectedFiles.some(current=>current.path===file.path&&current.sha256===file.sha256&&current.size_bytes===file.size_bytes))){const scope=validations.find(v=>v.id==='output-scope')!;scope.status='failed';scope.summary='Candidate bytes changed during validation';}
  }
  // Reproduction is a separate runner-owned route; a failing new test never becomes a passing test patch.
  if(recipe.id==='test-me-to-death'&&result.artifact_candidates[0]?.kind==='reproduction'){
    for(const v of validations)if(v.id==='vitest-added-tests')v.required=false;
    if(!validations.some(v=>v.id==='reproduction-check'))validations.push({id:'reproduction-check',version:'1.0',required:true,status:'skipped',summary:'Independent reproduction evidence unavailable',evidence_paths:[]});
  }
  for(const required of stage.validators.filter(v=>v.required&&!(recipe.id==='test-me-to-death'&&result.artifact_candidates[0]?.kind==='reproduction'&&v.id==='vitest-added-tests'))) if(!validations.some(v=>v.id===required.id))validations.push({id:required.id,version:'1.0',required:true,status:'skipped',summary:'Required validator unavailable',evidence_paths:[]});
  await atomicJson(join(dir,'attempts',attempt,'validation.json'),validations);
  await j.append('validation.completed',{attempt,checks:validations.map(v=>({id:v.id,status:v.status,summary:v.summary}))});
  if(validations.some(v=>v.required&&v.status!=='passed')) {const unsafe=validations.some(v=>['output-scope','protected-inputs','safe-markdown'].includes(v.id)&&v.status!=='passed');await j.append(unsafe?'artifact.quarantined':'artifact.rejected',{attempt,reason:'runner_validation_failed'});return false;}
  const c=result.artifact_candidates[0]!; const previous=(await listArtifacts(dir)).filter(a=>a.logical_key===c.logical_key).sort((left,right)=>j.state.artifacts.indexOf(left.artifact_id)-j.state.artifacts.indexOf(right.artifact_id)).at(-1);
  const candidateHashes=await Promise.all([...c.paths].sort().map(async p=>hash(await readFile(await resolveSafePath(workspace,p,{mustExist:true})))));
  if(previous&&JSON.stringify(previous.files.map(f=>f.sha256))===JSON.stringify(candidateHashes)){await j.append('artifact.rejected',{attempt,reason:'no_progress_duplicate_content'});return false;}
  signal?.throwIfAborted();
  const artifact=await promote(dir,{...c,run_id:meta.run_id,unit_id:a.unit,attempt_id:attempt,supersedes:previous?.artifact_id??null,data_origin:meta.data_origin,recipe_id:recipe.id,recipe_version:recipe.version,source_commit:source.source_commit,workspace,validations,expectedFiles},options.fault);
  await j.append('artifact.promoted',{attempt,artifact:artifact.artifact_id,logical_key:artifact.logical_key});return true;
}
async function drive(dir:string,j:Journal,meta:RunMetadata,source:SourceManifest,recipe:Recipe,options:RunOptions):Promise<RunOutcome>{
  const deadline=new Deadline(Date.parse(meta.deadline_at));let stopped=false;let stopAt=Infinity;let active:AbortController|null=null;let signals=0;let monitorReason:string|null=null;
  let closed=false;let drainTimer:ReturnType<typeof setTimeout>|undefined;
  const requestStop=(cause:string,delayMs:number)=>{stopped=true;monitorReason=cause;const requested=Date.now()+delayMs;if(requested<stopAt){stopAt=requested;if(drainTimer)clearTimeout(drainTimer);drainTimer=setTimeout(()=>active?.abort(new Error(cause)),Math.max(0,delayMs));drainTimer.unref();}if(delayMs===0)active?.abort(new Error(cause));};
  const signalHandler=()=>{signals++;requestStop('user_stop',signals>1?0:Math.min(30,meta.config.budget.finalization_reserve_seconds)*1000);};
  process.on('SIGINT',signalHandler);
  const deadlineTimer=setTimeout(()=>{if(!closed)requestStop('deadline',0);},deadline.remaining().remaining);deadlineTimer.unref();
  let controlPending=false;let diskPending=false;let monitorPending=false;let lastDiskCheck=-Infinity;let lastMonitorCheck=-Infinity;let clockJumpRecorded=false;
  const poll=setInterval(()=>{
    const clock=deadline.remaining();if(clock.clockJump&&!clockJumpRecorded){clockJumpRecorded=true;void j.append('worker.progress',{summary:'clock_jump_detected'}).catch(()=>{if(!closed)requestStop('storage_error',0);});}
    if(clock.remaining<=0)requestStop('deadline',0);
    if(Date.now()>=stopAt)active?.abort(new Error(monitorReason??'stop_or_deadline'));
    if(!controlPending){controlPending=true;void(async()=>{const control=join(dir,'control','stop.json');if(await exists(control)){const request=JSON.parse(await readFile(control,'utf8')) as {run_id:string;immediate:boolean};if(request.run_id!==meta.run_id||typeof request.immediate!=='boolean')throw new Error('Invalid stop request');if(!closed)requestStop('user_stop',request.immediate?0:30000);}})().catch(()=>{if(!closed)requestStop('control_error',0);}).finally(()=>{controlPending=false;});}
    if(performance.now()-lastDiskCheck>1000&&!diskPending){lastDiskCheck=performance.now();diskPending=true;void diskUsage(dir,options.hooks?.readonlyDependencyLinks,join(dir,'validation-scratch')).then(bytes=>{if(!closed&&bytes>=meta.config.budget.max_run_disk_mb*1024*1024)requestStop('disk_limit',0);}).catch(()=>{if(!closed)requestStop('storage_error',0);}).finally(()=>{diskPending=false;});}
    if(options.hooks?.monitor&&performance.now()-lastMonitorCheck>1000&&!monitorPending){lastMonitorCheck=performance.now();monitorPending=true;void Promise.resolve().then(()=>options.hooks!.monitor!()).then(decision=>{if(!closed&&decision.stop){stopped=true;monitorReason=decision.reason;if(decision.cancel)requestStop(decision.reason,0);}}).catch(()=>{if(!closed)requestStop('monitor_error',0);}).finally(()=>{monitorPending=false;});}
  },100);poll.unref();
  options.onEvent?.(j);
  let reason:string|null=null;
  try{
    for(const item of meta.plan){
      const accepted=Object.values(j.state.attempts).filter(a=>a.status==='accepted');if(accepted.some(a=>a.unit===item.unit))continue;
      const stage=recipe.stages.find(s=>s.id===item.stage)!;
      if(stage.depends_on.some(d=>!accepted.some(a=>a.stage===d)))continue;
      const prior=Object.values(j.state.attempts).filter(a=>a.unit===item.unit);let previousFailure:string|null=prior.length?'Previous attempt failed runner checks.':null;
      for(let repair=prior.length;repair<=meta.config.budget.max_repairs_per_unit;repair++){
        const time=deadline.remaining();if(time.clockJump&&!clockJumpRecorded){clockJumpRecorded=true;await j.append('worker.progress',{summary:'clock_jump_detected'});}
        reason=stopped?'user_stop':dispatchBlock(meta.config.budget,j.state.dispatches,j.state.noProgress,time.remaining,await diskUsage(dir,options.hooks?.readonlyDependencyLinks,join(dir,'validation-scratch')));
        if(!reason&&options.hooks?.preDispatch)reason=await options.hooks.preDispatch();
        if(reason)break;
        options.fault?.('before-intent');const attempt=`attempt-${randomUUID()}`;
        await j.append('dispatch.intent',{attempt,unit:item.unit,stage:item.stage});options.fault?.('after-intent');options.onEvent?.(j);
        const workspace=join(dir,'attempts',attempt,'workspace');await mkdir(workspace,{recursive:true,mode:0o700});await cp(join(dir,'source'),join(workspace,'project'),{recursive:true,dereference:false});
        if(recipe.id==='test-me-to-death')await mkdir(join(workspace,'project','tests','before-tibo'),{recursive:true,mode:0o700});
        if(recipe.id==='toolsmith-csv'){
          const latest=(await listArtifacts(dir)).filter(artifact=>artifact.logical_key==='csv-diff'&&artifact.kind==='tool').sort((left,right)=>j.state.artifacts.indexOf(left.artifact_id)-j.state.artifacts.indexOf(right.artifact_id)).at(-1);
          if(latest)for(const file of latest.files.filter(file=>file.path.startsWith('files/out/csv-diff/')&&file.path!=='files/out/csv-diff/validation.json')){const relative=file.path.slice('files/'.length);const destination=await resolveSafePath(workspace,relative);await mkdir(dirname(destination),{recursive:true,mode:0o700});await writeFile(destination,await readFile(await resolveSafePath(join(dir,'artifacts',latest.artifact_id),file.path,{mustExist:true})),{flag:'wx',mode:0o600});}
        }
        if(stopped||deadline.remaining().remaining<=0){await j.append('worker.interrupted',{attempt,reason:monitorReason??'deadline_before_spawn'});reason='worker_interrupted';break;}
        active=new AbortController();const timeout=setTimeout(()=>active?.abort(new Error('job_timeout')),meta.config.budget.job_timeout_seconds*1000);timeout.unref();
        try{
          await j.append('worker.started',{attempt});const job:PreparedJob={attemptId:attempt,unitId:item.unit,stage,recipe,workspace,source,origin:meta.data_origin,timeoutMs:meta.config.budget.job_timeout_seconds*1000,previousFailure};
          const result=await options.worker.execute(job,active.signal,async summary=>{await j.append('worker.progress',{attempt,summary});options.onEvent?.(j);});
          await j.append('worker.exited',{attempt,exit_code:result.exitCode});if(result.usage)await j.append('usage.observed',result.usage);
          if(result.exitCode!==0)throw new Error(`Worker exited with code ${result.exitCode}`);
          await j.append('candidate.received',{attempt});
          validateContract('agent-result',result.result);options.fault?.('before-candidate');await atomicJson(join(dir,'attempts',attempt,'candidate-result.json'),result.result);options.fault?.('after-candidate');
          if(await checkCandidate(dir,j,meta,source,recipe,attempt,options,active.signal))break;
          previousFailure='Previous candidate rejected by fixed validators; inspect the task constraints.';
        }catch(e){
          if((e as Error).message.startsWith('FAULT:'))throw e;
          const status=j.state.attempts[attempt]!.status;
          if(['intent','running'].includes(status)) {await j.append('worker.interrupted',{attempt,reason:(e as Error).message});reason='worker_interrupted';break;}
          if(status==='candidate'&&active.signal.aborted){await j.append('worker.interrupted',{attempt,reason:'validation_interrupted'});reason='worker_interrupted';break;}
          await j.append('artifact.rejected',{attempt,reason:(e as Error).message});previousFailure=(e as Error).message;
        }finally{clearTimeout(timeout);active=null;}
        options.onEvent?.(j);if(stopped){reason='user_stop';break;}
      }
      if(reason)break;
    }
    if(stopped&&reason!=='worker_interrupted')reason=monitorReason??'user_stop';
    if(reason==='worker_interrupted'){await j.transition('INTERRUPTED',reason);await harvest(dir,j.state,meta);return {runId:meta.run_id,runDir:dir,status:j.state.status,report:join(dir,'harvest','index.html'),dispatches:j.state.dispatches};}
    await j.transition('DRAINING',reason??undefined);await j.transition('HARVESTING');
    const accepted=new Set(Object.values(j.state.attempts).filter(a=>a.status==='accepted').map(a=>a.unit));
    const status=reason?'STOPPED':meta.plan.every(p=>accepted.has(p.unit))?'COMPLETED':accepted.size?'PARTIAL':'FAILED';
    await j.transition(status,reason??undefined);const report=await harvest(dir,j.state,meta);await j.append('harvest.generated',{path:'harvest/index.html'});await j.append('run.finished',{status});options.onEvent?.(j);
    return {runId:meta.run_id,runDir:dir,status,report,dispatches:j.state.dispatches};
  }finally{closed=true;clearInterval(poll);clearTimeout(deadlineTimer);if(drainTimer)clearTimeout(drainTimer);process.off('SIGINT',signalHandler);}
}
export async function readRun(stateDir:string,id:string,replay=true):Promise<{dir:string;journal:Journal;meta:RunMetadata}> {
  if(!/^run-[a-z0-9-]+$/.test(id))throw new Error('Invalid run ID');const dir=await resolveSafePath(join(resolve(stateDir),'runs'),id,{mustExist:true});const meta=JSON.parse(await readFile(join(dir,'run.json'),'utf8')) as RunMetadata;validateRunConfig(meta.config);
  if(meta.run_id!==id)throw new Error('Run identity mismatch');const journal=new Journal(dir,id,meta.data_origin);if(replay)await journal.replay();return {dir,journal,meta};
}
export async function stopRun(stateDir:string,id:string,immediate:boolean):Promise<void>{const {dir}=await readRun(stateDir,id);await mkdir(join(dir,'control'),{recursive:true,mode:0o700});await atomicJson(join(dir,'control','stop.json'),{run_id:id,immediate});}
export async function resumeRun(stateDir:string,id:string,options:RunOptions):Promise<RunOutcome>{
  // Read metadata without replay first: tail repair is only permitted after obtaining the writer lock.
  if(!/^run-[a-z0-9-]+$/.test(id))throw new Error('Invalid run ID');const dir=await resolveSafePath(join(resolve(stateDir),'runs'),id,{mustExist:true});const meta=JSON.parse(await readFile(join(dir,'run.json'),'utf8')) as RunMetadata;validateRunConfig(meta.config);
  const j=new Journal(dir,id,meta.data_origin);await j.lock();
  try{
    await j.replay(true);const policy=JSON.parse(await readFile(join(dir,'policy.json'),'utf8')) as {config_hash:string;identity:string|null;deadline_at:string};
    if(policy.config_hash!==hash(JSON.stringify(meta.config))||policy.deadline_at!==meta.deadline_at||policy.identity!==meta.identity||meta.data_origin!==options.origin)throw new Error('Stored policy or origin changed');
    if(meta.data_origin==='real'&&meta.identity!==options.identity)throw new Error('Identity changed; harvest only');
    const source=JSON.parse(await readFile(join(dir,'source-manifest.json'),'utf8')) as SourceManifest;const recipe=loadRecipe(meta.config.recipe_id);
    const manifests=await listArtifacts(dir);
    for(const m of manifests)if(!j.state.artifacts.includes(m.artifact_id)){const a=j.state.attempts[m.attempt_id];if(!a)throw new Error('Artifact has no dispatch');if(a.status!=='candidate'&&a.status!=='accepted')await j.append('candidate.received',{attempt:a.id});await j.append('artifact.promoted',{attempt:a.id,artifact:m.artifact_id});}
    // Expired and finished runs only recover existing immutable artifacts and render their receipt.
    if(Date.now()>=Date.parse(meta.deadline_at)||['COMPLETED','PARTIAL','FAILED','BLOCKED'].includes(j.state.status)){if(['RUNNING','DRAINING'].includes(j.state.status))await j.transition('INTERRUPTED','deadline_expired_harvest_only');const report=await harvest(dir,j.state,meta);return {runId:id,runDir:dir,status:j.state.status,report,dispatches:j.state.dispatches};}
    let prepared=false;const prepare=async()=>{if(!prepared){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new Error('preparation_deadline')),Math.max(0,Date.parse(meta.deadline_at)-Date.now()));try{await options.hooks?.prepare?.(dir,meta,source,controller.signal);controller.signal.throwIfAborted();prepared=true;}finally{clearTimeout(timer);}}};
    let ambiguous=false;
    for(const a of Object.values(j.state.attempts)){
      if(['intent','running','candidate','interrupted'].includes(a.status)){
        if(await exists(join(dir,'attempts',a.id,'candidate-result.json'))){await prepare();if(a.status!=='candidate')await j.append('candidate.received',{attempt:a.id});const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new Error('recovery_validation_deadline')),Math.max(0,Math.min(meta.config.budget.job_timeout_seconds*1000,Date.parse(meta.deadline_at)-Date.now())));try{await checkCandidate(dir,j,meta,source,recipe,a.id,options,controller.signal);}finally{clearTimeout(timer);}}
        else{if(a.status!=='interrupted')await j.append('worker.interrupted',{attempt:a.id,reason:'Ambiguous dispatch is never replayed'});ambiguous=true;}
      }
    }
    if(['RUNNING','DRAINING'].includes(j.state.status))await j.transition('INTERRUPTED','recovery');
    if(ambiguous||Date.now()>=Date.parse(meta.deadline_at)||!['INTERRUPTED','STOPPED'].includes(j.state.status)){const report=await harvest(dir,j.state,meta);return {runId:id,runDir:dir,status:j.state.status,report,dispatches:j.state.dispatches};}
    if(await exists(join(dir,'control','stop.json')))await unlink(join(dir,'control','stop.json')); // Explicit resume starts a fresh control request window, never a fresh budget.
    await j.transition('PREFLIGHT');await prepare();await j.transition('RUNNING');return await drive(dir,j,meta,source,recipe,options);
  }finally{await j.unlock();}
}
