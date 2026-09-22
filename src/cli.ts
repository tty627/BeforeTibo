#!/usr/bin/env node
import { Command } from 'commander';
import { homedir } from 'node:os';
import { join,resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadRecipe } from './core/contracts.js';
import { expandPath,resolveConfig,type ConfigFlags } from './core/config.js';
import { startRun,readRun,resumeRun,stopRun } from './core/runner.js';
import { MockWorker } from './adapters/mock.js';
import { probeCodex } from './adapters/codex/index.js';
import { probeSandbox } from './sandbox/index.js';
import { inspectRepository } from './workspace/index.js';
import { demo } from './core/demo.js';
import { realRunOptions, recipeHooks } from './core/real-run.js';
import { doctorExecutionContext } from './adapters/codex/preflight.js';
import { redact } from './storage/journal.js';
import { harvest,exportSummary } from './harvest/report.js';
import { renderState } from './ui/terminal.js';
import type { RunConfig } from './core/types.js';
const program=new Command().name('before-tibo').description('Bounded workflows. Independently checked artifacts.').version('0.1.0-alpha.1');
const output=(value:unknown,json=false)=>{process.stdout.write(json?JSON.stringify(value)+'\n':typeof value==='string'?value+'\n':JSON.stringify(value,null,2)+'\n');};
const state=(o:{stateDir?:string})=>expandPath(o.stateDir??join(homedir(),'.before-tibo'));
function options(c:Command):Command{return c.option('--state-dir <path>','Local state root').option('--json','Machine-readable stdout');}
function runFlags(c:Command):Command{return options(c.option('--recipe <id>','Built-in recipe').option('--preset <preset>','gentle, hard, tibo').option('--mode <mode>','bounded or quota').option('--config <file>','Strict run JSON').option('--max-dispatches <n>').option('--max-run-minutes <n>').option('--reserve-percent <n>').option('--non-interactive').option('--ack-spend-risk').option('--ack-execution-risk'));}
async function consent(config:RunConfig,o:{ackSpendRisk?:boolean;ackExecutionRisk?:boolean;nonInteractive?:boolean}):Promise<void>{
 if(config.billing.require_zero_incremental_charge)throw new Error('BLOCKED_NO_HARD_BILLING_GUARD');
 if(o.ackSpendRisk&&o.ackExecutionRisk)return;
 if(o.nonInteractive||!process.stdin.isTTY)throw new Error('BLOCKED_CONSENT_REQUIRED: pass --ack-spend-risk and --ack-execution-risk for this invocation. Config is not consent.');
 const io=createInterface({input:process.stdin,output:process.stderr});try{const answer=await io.question('This run sends approved source to Codex, executes isolated work, and may consume credits. Local limits are not billing caps. Type "I accept both risks" to continue: ');if(answer!=='I accept both risks')throw new Error('Run cancelled: consent not given');}finally{io.close();}
}
program.command('doctor').option('--json').action(async o=>{
 const [codex,sandbox,isolation]=await Promise.all([probeCodex(),probeSandbox(),doctorExecutionContext()]);
 const flags=Object.fromEntries(Object.entries(codex).filter(([key])=>!['extensionsIsolation','authIdentifiable','realExecutionReady','reasons'].includes(key)));
 output({node:process.version,platform:process.platform,arch:process.arch,codex:{scope:'CLI flags and protocol only',...flags},sandbox,isolation,execution_authorization:'Not granted by doctor; account binding and invocation consent required',auth:'unavailable: account not read by doctor',quota:'unavailable: read during authorized real preflight',real_integration:'NOT RUN'},o.json);
});
const recipes=program.command('recipes');recipes.command('list').option('--json').action(o=>output(['repo-book','test-me-to-death','toolsmith-csv'].map(id=>{const r=loadRecipe(id);return {id,title:r.title,goal:r.goal,limitations:r.known_limitations};}),o.json));recipes.command('show <id>').option('--json').action((id,o)=>output(loadRecipe(id),o.json));
runFlags(program.command('plan <path>')).action(async(path,o:ConfigFlags&{json?:boolean})=>{const config=await resolveConfig(path,o);const recipe=loadRecipe(config.recipe_id);const source=recipe.input.kind==='repository'?await inspectRepository(config.target_path):{source_commit:null,files:[],excluded:[],total_bytes:0};output({model_calls:0,data_origin:'static-plan',config,source,stages:recipe.stages.map(s=>({id:s.id,max_units:s.max_units,required:s.expected_paths})),billing:'No inference started. A real run may consume credits; local limits are not billing caps.',untracked:'Not read or copied'},o.json);});
runFlags(program.command('run <path>')).action(async(path,o:ConfigFlags&{json?:boolean;nonInteractive?:boolean;ackSpendRisk?:boolean;ackExecutionRisk?:boolean})=>{const config=await resolveConfig(path,o);await consent(config,o);const opts=await realRunOptions(config,j=>{if(!o.json)process.stderr.write(renderState(j.state,config.budget.max_dispatches)+'\n');});output(await startRun(config,opts),o.json);});
options(program.command('demo')).option('--recipe <id>','Synthetic recipe','repo-book').action(async o=>{
 const result=await demo(o.recipe,state(o),j=>{if(!o.json)process.stderr.write(renderState(j.state)+'\n');});output({data_origin:'demo',...result},o.json);
});
options(program.command('status <run-id>')).action(async(id,o)=>{const {journal}=await readRun(state(o),id);output(o.json?journal.state:renderState(journal.state),o.json);});
options(program.command('stop <run-id>')).option('--immediate').action(async(id,o)=>{await stopRun(state(o),id,Boolean(o.immediate));output({run_id:id,stop_requested:true,immediate:Boolean(o.immediate)},o.json);});
options(program.command('resume <run-id>')).option('--ack-spend-risk').option('--ack-execution-risk').option('--non-interactive').action(async(id,o)=>{
 const {meta}=await readRun(state(o),id,false);
 if(meta.data_origin==='real'){
   if(Date.now()>=Date.parse(meta.deadline_at)){
     const recovered=await resumeRun(state(o),id,{origin:'real',identity:meta.identity??undefined,worker:{execute:async()=>{throw new Error('BLOCKED_RECOVERY_MUST_NOT_DISPATCH');}}});
     output({...recovered,reason:'Original deadline expired; recovery and harvest only',model_calls:0},o.json);return;
   }
   await consent(meta.config,o);const opts=await realRunOptions(meta.config,j=>{if(!o.json)process.stderr.write(renderState(j.state)+'\n');});output(await resumeRun(state(o),id,opts),o.json);return;
 }
 output(await resumeRun(state(o),id,{origin:'demo',worker:new MockWorker(),hooks:recipeHooks(meta.config)}),o.json);
});
options(program.command('harvest <run-id>')).action(async(id,o)=>{const {dir,journal,meta}=await readRun(state(o),id);output({run_id:id,report:await harvest(dir,journal.state,meta),model_calls:0},o.json);});
options(program.command('open <run-id>')).action(async(id,o)=>{const {dir}=await readRun(state(o),id);output({report:join(dir,'harvest','index.html'),note:'Open locally after review. Tools are separate generated files.'},o.json);});
options(program.command('export <run-id>')).requiredOption('--output <directory>').action(async(id,o)=>{const {dir,journal,meta}=await readRun(state(o),id);await harvest(dir,journal.state,meta);await exportSummary(dir,resolve(o.output));output({output:resolve(o.output),content:'Sanitized summary only; private artifacts excluded.'},o.json);});
if(Number(process.versions.node.split('.')[0])!==24){process.stderr.write('BeforeTibo requires Node.js 24.x. Use Node 24 and retry.\n');process.exitCode=1;}
else await program.parseAsync().catch((e:unknown)=>{process.stderr.write(JSON.stringify({error:String(redact(e instanceof Error?e.message:String(e)))})+'\n');process.exitCode=1;});
