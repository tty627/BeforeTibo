import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, matchesGlob } from 'node:path';
import { validateContract } from '../core/contracts.js';
import type { AgentResult, EvidenceIndex, Recipe, RecipeStage, ValidationResult } from '../core/types.js';
import type { SourceManifest } from '../core/worker.js';
import { resolveSafePath } from '../workspace/index.js';
import { hash } from '../storage/artifacts.js';

export async function walkFiles(root:string,prefix=''):Promise<string[]> {
  const out:string[]=[];
  for(const e of await readdir(join(root,prefix),{withFileTypes:true})) {const path=prefix?`${prefix}/${e.name}`:e.name; if(e.isSymbolicLink() || (!e.isFile()&&!e.isDirectory())) throw new Error('Unsafe file type'); if(e.isDirectory()) out.push(...await walkFiles(root,path)); else out.push(path);}
  return out.sort();
}
export function check(id:string,status:ValidationResult['status'],summary:string):ValidationResult {return {id,version:'1.0',required:true,status,summary,evidence_paths:[]};}
export async function validateStructural(workspace:string,result:AgentResult,recipe:Recipe,stage:RecipeStage,source:SourceManifest):Promise<ValidationResult[]> {
  const checks:ValidationResult[]=[];
  const run=async(id:string,fn:()=>Promise<void>)=>{try{await fn();checks.push(check(id,'passed','Passed the runner-owned check.'));}catch(e){checks.push(check(id,'failed',(e as Error).message));}};
  const listed=result.artifact_candidates.flatMap(c=>c.paths);
  let all:string[]=[];
  await run('output-scope',async()=>{
    all=await walkFiles(workspace); if(all.length>3000) throw new Error('Workspace file count exceeded');
    const protectedPaths=new Set(source.files.map(f=>`project/${f.path}`));
    for(const p of all) if(!protectedPaths.has(p)&&!recipe.permissions.writes.some(g=>matchesGlob(p,g))) throw new Error(`Unapproved output: ${p}`);
    for(const p of listed) {await resolveSafePath(workspace,p,{mustExist:true});if(!recipe.permissions.writes.some(g=>matchesGlob(p,g))) throw new Error('Candidate outside write scope');}
    for(const c of result.artifact_candidates) if(!recipe.artifact_kinds.includes(c.kind)) throw new Error('Unapproved artifact kind');
  });
  await run('protected-inputs',async()=>{for(const f of source.files){const p=await resolveSafePath(workspace,`project/${f.path}`,{mustExist:true});if(hash(await readFile(p))!==f.sha256)throw new Error(`Protected source changed: ${f.path}`);}});
  await run('required-files',async()=>{
    if(result.artifact_candidates.length!==1) throw new Error('One logical candidate is required per unit');
    for(const pattern of stage.expected_paths) if(!listed.some(p=>matchesGlob(p,pattern))) throw new Error(`Missing required output: ${pattern}`);
    for(const p of listed) {const st=await lstat(await resolveSafePath(workspace,p,{mustExist:true}));if(!st.isFile()||st.size===0||st.size>5*1024*1024)throw new Error('Output empty, too large or not a regular file');}
  });
  if(recipe.id==='repo-book') {
    await run('source-references',async()=>{
      const e=validateContract<EvidenceIndex>('evidence',JSON.parse(await readFile(await resolveSafePath(workspace,'out/repo-book/evidence.json',{mustExist:true}),'utf8')));
      if(e.source_commit!==source.source_commit) throw new Error('Evidence references the wrong snapshot');
      let references=0;
      for(const c of e.claims){
        if(c.evidence_kind==='executed_check') throw new Error('Repo Book has no runner-authorized executable checks');
        if(c.evidence_kind==='inference') {if(!c.limitations.length)throw new Error('Inference must disclose limitations');continue;}
        const f=source.files.find(f=>f.path===c.source_path); if(!f||f.sha256!==c.source_blob_sha256) throw new Error('Source reference missing or hash mismatch');
        const content=await readFile(await resolveSafePath(workspace,`project/${f.path}`,{mustExist:true}),'utf8');
        if(c.line_start!==null && c.line_end!==null) {if(c.line_start<1||c.line_end<c.line_start||c.line_end>content.split('\n').length)throw new Error('Invalid source line range');}
        else if(!c.symbol||!content.includes(c.symbol))throw new Error('Missing source range or symbol');
        references++;
      }
      if(!references)throw new Error('At least one source reference is required');
    });
    await run('safe-markdown',async()=>{
      for(const p of listed.filter(p=>p.endsWith('.md'))) {
        const text=await readFile(await resolveSafePath(workspace,p,{mustExist:true}),'utf8');
        if(/<\s*(script|iframe|object|embed|img|svg|link|style)\b|javascript\s*:|data\s*:\s*text\/html/i.test(text))throw new Error('Unsafe active content in Markdown');
        for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {const target=m[1]!; if(/^(?:https?:|mailto:|#)/i.test(target))continue;if(target.includes('..')||target.startsWith('/')||target.includes('\\'))throw new Error('Unsafe Markdown link');}
      }
    });
  }
  return checks;
}
