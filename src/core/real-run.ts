import { prepareRealExecution } from '../adapters/codex/preflight.js';
import { RealWorker } from '../adapters/real.js';
import { createVitestHooks } from '../validators/vitest.js';
import { validateCsvTool } from '../validators/csv.js';
import type { RunConfig } from './types.js';
import type { RunHooks,RunOptions } from './runner.js';
import { JournalClosedError, type Journal } from '../storage/journal.js';
import { performance } from 'node:perf_hooks';
export function recipeHooks(config:RunConfig):RunHooks {
 if(config.recipe_id==='test-me-to-death')return createVitestHooks({sourcePath:config.target_path,timeoutMs:config.budget.job_timeout_seconds*1000});
 if(config.recipe_id==='toolsmith-csv')return {validate:(job,result,signal)=>validateCsvTool(job,result,signal)};
 return {};
}
/** Call only after this invocation's spending/execution consent was collected. */
export async function realRunOptions(config:RunConfig,onEvent?:(j:Journal)=>void):Promise<RunOptions>{
 const real=await prepareRealExecution(config,{ackSpendRisk:true,ackExecutionRisk:true});
 let writer:Journal|undefined;let lastPoll=-Infinity;let inFlight:Promise<string|null>|undefined;let storageFailure:unknown;
 const check=async()=>{
   if(storageFailure)throw storageFailure;
   if(inFlight)return inFlight;
   inFlight=(async()=>{const reason=await real.preDispatch();lastPoll=performance.now();
     if(writer){
       const o=real.observation;
       try{
         await writer.append('quota.observed',{snapshot:{status:o.status,source:o.source,observedAt:o.observedAt,buckets:o.buckets,attribution:o.attribution,serviceBlocked:o.serviceBlocked,reason:o.reason,dispatchAllowed:reason===null,dispatchReason:reason}});
         if(reason&&config.mode==='quota'){
           const type=/STALE/iu.test(reason)?'quota.stale':/BOUNDARY|IDENTITY|CONFIGURATION/iu.test(reason)?'quota.boundary_changed':/UNAVAILABLE|ERROR|context_unavailable/iu.test(reason)?'quota.unavailable':null;
           if(type)await writer.append(type,{reason});
         }
       }catch(error){if(!(error instanceof JournalClosedError))storageFailure=error;throw error;}
       onEvent?.(writer);
     }
     return reason;
   })().finally(()=>{inFlight=undefined;});return inFlight;
 };
 return {origin:'real',worker:new RealWorker(real.execution),identity:`${real.identity.accountIdHash}:${real.identity.contextId}:${real.configHash}`,capabilities:{node_version:process.version,codex_version:real.capabilities.version,adapter_version:'0.154.0',platform:process.platform,architecture:process.arch,model:real.execution.model??null,model_source:real.execution.model?'effective_codex_config':'codex_default',sandbox_backend:real.sandbox.backend,sandbox_verified:true,auth_kind:'chatgpt',identity_verified:true,extensions_verified:true,quota_verified:config.mode==='quota'&&real.mapping.verified,quota_buckets:config.quota.required_buckets},onEvent:j=>{writer=j;onEvent?.(j);},hooks:{...recipeHooks(config),preDispatch:check,monitor:async()=>{
   if(storageFailure)throw storageFailure;
   if(config.mode!=='quota'||performance.now()-lastPoll<config.quota.poll_seconds*1000)return {stop:false,cancel:false,reason:''};
   try{const reason=await check();return {stop:Boolean(reason),cancel:Boolean(reason),reason:reason??''};}
   catch(error){if(error instanceof JournalClosedError)return {stop:false,cancel:false,reason:''};throw error;}
 }}};
}
