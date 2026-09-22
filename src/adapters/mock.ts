import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { candidate, type PreparedJob, type Worker, type WorkerResult } from '../core/worker.js';
import { writeCsvDemo } from '../validators/csv.js';
import type { EvidenceIndex } from '../core/types.js';
export type MockMode='normal'|'invalid-json'|'failure'|'no-progress'|'delay'|'missing-usage'|'duplicate';
export class MockWorker implements Worker {
  constructor(readonly mode:MockMode='normal',readonly latency=0){}
  async execute(job:PreparedJob,signal:AbortSignal,onProgress:(summary:string)=>Promise<void>):Promise<WorkerResult>{
    await onProgress('DEMO: synthetic worker started'); if(this.latency||this.mode==='delay')await delay(this.latency||60000,undefined,{signal});signal.throwIfAborted();
    if(this.mode==='failure')throw new Error('DEMO injected worker failure');
    if(this.mode==='invalid-json')return {result:'{broken',usage:null,exitCode:0};
    if(this.mode==='no-progress')return {result:{schema_version:'1.0',outcome:'no_progress',summary:'DEMO no progress',artifact_candidates:[],observations:[],blockers:[],proposed_next_unit:null},usage:null,exitCode:0};
    if(job.recipe.id==='toolsmith-csv') {
      const result=job.stage.id==='complete-tool'?await writeCsvDemo(job.workspace):{schema_version:'1.0',outcome:'no_progress',summary:'DEMO template already implements the fixed scope; no synthetic improvement claimed.',artifact_candidates:[],observations:[],blockers:[],proposed_next_unit:null};
      return {result,usage:null,exitCode:0};
    }
    if(job.recipe.id==='test-me-to-death') {
      const testPath=`project/tests/before-tibo/${job.unitId}.test.js`;
      const tests=job.stage.id==='boundary-tests'?['expect(add(0, 0)).toBe(0);','expect(add(-2, 3)).toBe(1);']:job.stage.id==='state-tests'?['expect(add(2, 3)).toBe(5);','expect(add(2, 3)).toBe(5);']:['for (let i=-10; i<=10; i++) expect(add(i, 0)).toBe(i);'];
      const content=`import {test, expect} from 'vitest';\nimport {add} from '../../sum.js';\ntest('DEMO ${job.stage.id} addition behavior',()=>{${tests.join('')}});\n`;
      await mkdir(dirname(join(job.workspace,testPath)),{recursive:true});await writeFile(join(job.workspace,testPath),content);
      const scenario='out/test-me-to-death/scenarios.md';await mkdir(dirname(join(job.workspace,scenario)),{recursive:true});await writeFile(join(job.workspace,scenario),`# DEMO ${job.stage.title}\nThe fixture defines pure numeric addition. Check zero, negative and repeated inputs without changing production code. Synthetic generation; actual tests must pass independent validation.\n`);
      return {result:candidate('DEMO tests pending actual isolated execution',[testPath,scenario],`tests.${job.unitId}`,`DEMO ${job.stage.title}`,'test_patch'),usage:null,exitCode:0};
    }
    const file=job.source.files.find(f=>/\.(?:[cm]?[jt]sx?|py|rs|go|java|c|cpp)$/.test(f.path));if(!file)throw new Error('No identifiable source');
    const content=await readFile(join(job.workspace,'project',file.path),'utf8');
    const title=job.stage.title;
    const page=job.stage.id==='overview'?'index.md':job.stage.id==='debugging'?'debugging.md':job.stage.id==='module-guides'?`modules/${job.unitId}.md`:`lifecycles/${job.unitId}.md`;
    const rel=`out/repo-book/${page}`;
    const text=`# ${title} — DEMO\n\nThis synthetic guide inspects the committed example snapshot.\n\nThe selected source module is \`${file.path}\`, containing ${content.split('\n').length} lines. Reference: claim-source.\n\n## Entry and behavior\n\nThe example exports a pure addition function. This statement is for the synthetic fixture; explanations still require human review.\n\n## Limitations\n\nNo project commands were executed. Author intent is unverified.\n`;
    const evidence:EvidenceIndex={schema_version:'1.0',data_origin:'demo',source_commit:job.source.source_commit!,claims:[{claim_id:'claim-source',claim:`The source snapshot contains ${file.path}.`,evidence_kind:'source_reference',source_path:file.path,source_blob_sha256:file.sha256,line_start:1,line_end:Math.min(3,content.split('\n').length),symbol:null,check_evidence_path:null,limitations:['Reference integrity does not prove explanation semantics.']}]};
    const files:Record<string,string>={[rel]:text,'out/repo-book/evidence.json':JSON.stringify(evidence,null,2),'out/repo-book/limitations.md':'# DEMO limitations\nSynthetic worker. No model call, no project commands. Human review pending.\n'};
    for(const [p,v] of Object.entries(files)){await mkdir(dirname(join(job.workspace,p)),{recursive:true});await writeFile(join(job.workspace,p),v);}
    const result=candidate('DEMO guide candidate',Object.keys(files),`repo-book.${job.unitId}`,`${title} (DEMO)`);
    if(this.mode==='duplicate')await onProgress('DEMO: duplicate progress (does not increment work)');
    return {result,usage:this.mode==='missing-usage'?null:{id:job.attemptId,input_tokens:120,cached_input_tokens:20,output_tokens:80,reasoning_output_tokens:null,completeness:'complete',data_origin:'demo'},exitCode:0};
  }
}
