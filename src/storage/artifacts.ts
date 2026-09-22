import { mkdir, readdir, readFile, rename, writeFile, lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ArtifactManifest, ValidationResult } from '../core/types.js';
import { validateContract } from '../core/contracts.js';
import { resolveSafePath, isWithinRoot } from '../workspace/index.js';
import { atomicJson } from './journal.js';
export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export async function diskUsage(root: string, readonlyDependencyLinks?:ReadonlyMap<string,string>, validationScratchRoot?:string): Promise<number> {
  const scratch=validationScratchRoot===undefined?undefined:resolve(validationScratchRoot);
  if(scratch!==undefined&&scratch!==join(resolve(root),'validation-scratch'))throw new Error('Invalid validator scratch accounting root');
  const measure=async(directory:string,allowVanished:boolean):Promise<number>=>{
    let names:string[];try{names=await readdir(directory);}catch(error){if(allowVanished&&(error as NodeJS.ErrnoException).code==='ENOENT')return 0;throw error;}
    let bytes=0;
    for(const name of names){const filename=join(directory,name);let metadata;try{metadata=await lstat(filename);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      if(metadata.isSymbolicLink()){
        // Browser-owned profile links contain process socket paths. Count the link itself,
        // never traverse its target, and never apply this exception to the scratch root.
        if(scratch&&resolve(filename)!==scratch&&isWithinRoot(scratch,resolve(filename))){bytes+=metadata.size;continue;}
        const allowed=readonlyDependencyLinks?.get(resolve(filename));if(!allowed)throw new Error('Symlink in run data');
        let actual:string;try{actual=await realpath(filename);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        if(actual!==allowed)throw new Error('Read-only dependency link changed');continue;
      }if(metadata.isDirectory())bytes+=await measure(filename,true);else bytes+=metadata.size;
    }return bytes;
  };return measure(root,false);
}
export interface PinnedArtifactFile { path:string;sha256:string;size_bytes:number }
export type PromotionInput = Omit<ArtifactManifest, 'artifact_id' | 'created_at' | 'files' | 'schema_version' | 'status' | 'adoption'> & { workspace: string; paths: string[]; validations: ValidationResult[]; expectedFiles?:PinnedArtifactFile[] };
async function artifactBytes(workspace:string,path:string):Promise<Buffer>{
  const full=await resolveSafePath(workspace,path,{mustExist:true});const handle=await open(full,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const before=await handle.stat();const limit=5*1024*1024;if(!before.isFile()||before.nlink!==1||before.size>limit)throw new Error('Invalid artifact file');
    const buffer=Buffer.alloc(Math.min(limit+1,before.size+1));let count=0;
    while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,count);if(!bytesRead)break;count+=bytesRead;}
    const after=await handle.stat();if(count!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error('Artifact changed while reading');return buffer.subarray(0,count);
  }finally{await handle.close();}
}
export async function pinArtifactFiles(workspace:string,paths:readonly string[]):Promise<PinnedArtifactFile[]>{
  const files:PinnedArtifactFile[]=[];let total=0;
  for(const path of [...new Set(paths)].sort()){const bytes=await artifactBytes(workspace,path);total+=bytes.length;if(total>100*1024*1024)throw new Error('Artifact total size limit');files.push({path,sha256:hash(bytes),size_bytes:bytes.length});}return files;
}
export async function promote(runDir: string, input: PromotionInput, fault?: (point: string)=>void): Promise<ArtifactManifest> {
  if (!input.validations.length || input.validations.some(v=>v.required && v.status!=='passed')) throw new Error('Required validations must pass');
  const data: {path:string;bytes:Buffer}[]=[];
  let total=0;
  for(const path of [...new Set(input.paths)].sort()) { const bytes=await artifactBytes(input.workspace,path);total+=bytes.length;if(total>100*1024*1024)throw new Error('Artifact total size limit');const expected=input.expectedFiles?.find(file=>file.path===path);if(input.expectedFiles&&(!expected||expected.sha256!==hash(bytes)||expected.size_bytes!==bytes.length))throw new Error('Artifact changed after validation');data.push({path,bytes}); }
  if(input.expectedFiles&&input.expectedFiles.length!==data.length)throw new Error('Artifact file set changed after validation');
  const files=data.map(f=>({path:`files/${f.path}`,sha256:hash(f.bytes),size_bytes:f.bytes.length}));
  const id=`artifact-${hash(JSON.stringify([input.run_id,input.unit_id,input.attempt_id,files])).slice(0,32)}`;
  const root=join(runDir,'artifacts'); await mkdir(root,{recursive:true,mode:0o700}); const target=join(root,id);
  try { const existing=await readManifest(target); return existing; } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
  const staging=join(root,`.staging-${randomUUID()}`); await mkdir(staging,{mode:0o700});
  for(const f of data) { const p=join(staging,'files',f.path); await mkdir(dirname(p),{recursive:true,mode:0o700}); await writeFile(p,f.bytes,{mode:0o400}); }
  const {workspace:_workspace,paths:_paths,expectedFiles:_expectedFiles,...metadata}=input;
  const manifest:ArtifactManifest={...metadata,schema_version:'1.0',artifact_id:id,created_at:new Date().toISOString(),status:'accepted',adoption:'unreviewed',files};
  validateContract('artifact',manifest); await atomicJson(join(staging,'manifest.json'),manifest); fault?.('before-promotion');
  await rename(staging,target); fault?.('after-promotion'); return manifest;
}
export async function readManifest(dir: string):Promise<ArtifactManifest> {
  const m=validateContract<ArtifactManifest>('artifact',JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')));
  for(const f of m.files) { const path=await resolveSafePath(dir,f.path,{mustExist:true}); const bytes=await readFile(path); if(hash(bytes)!==f.sha256 || bytes.length!==f.size_bytes) throw new Error(`Artifact integrity failure: ${m.artifact_id}`); }
  return m;
}
export async function listArtifacts(runDir: string):Promise<ArtifactManifest[]> {
  let entries:string[]; try { entries=await readdir(join(runDir,'artifacts')); } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') return []; throw e; }
  const results:ArtifactManifest[]=[];
  for(const name of entries.sort()) if(!name.startsWith('.')) results.push(await readManifest(await resolveSafePath(join(runDir,'artifacts'),name,{mustExist:true})));
  return results;
}
