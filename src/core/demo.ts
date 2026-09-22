import { mkdir, mkdtemp, writeFile, symlink, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { defaults } from './config.js';
import { hash } from '../storage/artifacts.js';
import { startRun, type RunHooks, type RunOutcome } from './runner.js';
import { MockWorker } from '../adapters/mock.js';
import { validateCsvTool } from '../validators/csv.js';
import { createVitestHooks } from '../validators/vitest.js';
import type { Journal } from '../storage/journal.js';
export async function demo(recipe:string,stateDir:string,onEvent?:(journal:Journal)=>void):Promise<RunOutcome>{
 const root=await mkdtemp(join(tmpdir(),'before-tibo-demo-input-'));const source=join(root,'project');await mkdir(source);
 const files:Record<string,string>={'sum.js':'export function add(a, b) { return a + b; }\n'};
 let hooks:RunHooks|undefined;
 if(recipe==='test-me-to-death'){
   const require=createRequire(import.meta.url);let vitest:string;try{vitest=require.resolve('vitest/package.json');}catch{throw new Error('DEMO test recipe needs the documented local Vitest 4.1.11 backend');}
   files['package.json']=JSON.stringify({name:'before-tibo-synthetic-example',version:'1.0.0',type:'module',devDependencies:{vitest:'4.1.11'}});
   files['package-lock.json']=JSON.stringify({name:'before-tibo-synthetic-example',version:'1.0.0',lockfileVersion:3,packages:{}});
   files['vitest.config.js']="export default { test: { include: ['tests/**/*.test.{js,mjs}'] } };\n";
   files['tests/base.test.js']="import {test, expect} from 'vitest'; import {add} from '../sum.js'; test('known addition',()=>expect(add(2,3)).toBe(5));\n";
   const version=(JSON.parse(await readFile(vitest,'utf8')) as {version:string}).version;if(version!=='4.1.11')throw new Error('DEMO requires Vitest 4.1.11');
   await symlink(dirname(dirname(vitest)),join(source,'node_modules'),'dir');hooks=createVitestHooks({sourcePath:source});
 }else if(recipe==='toolsmith-csv')hooks={validate:(job,result,signal)=>validateCsvTool(job,result,signal)};
 for(const [p,v] of Object.entries(files)){await mkdir(dirname(join(source,p)),{recursive:true});await writeFile(join(source,p),v);}
 const input=join(root,'snapshot');await mkdir(input);for(const [p,v]of Object.entries(files)){await mkdir(dirname(join(input,p)),{recursive:true});await writeFile(join(input,p),v);}
 const config=defaults(source,recipe);config.state_dir=stateDir;config.budget.job_timeout_seconds=60;
 const manifest={source_commit:hash(JSON.stringify(files)).slice(0,40),files:Object.entries(files).map(([p,v])=>({path:p,sha256:hash(v),size_bytes:Buffer.byteLength(v)})),excluded:[],total_bytes:Object.values(files).reduce((n,v)=>n+Buffer.byteLength(v),0)};
 // Preserve synthetic input outside the public project so interrupted demos can resume with dependencies.
 return startRun(config,{origin:'demo',worker:new MockWorker(),source:manifest,sourceDir:input,hooks,onEvent});
}
