import type { AgentResult, Recipe, RecipeStage } from './types.js';
export interface SourceManifest { source_commit:string|null;files:{path:string;sha256:string;size_bytes:number}[];excluded:{path:string;reason:string}[];total_bytes:number; }
export interface PreparedJob { attemptId:string;unitId:string;stage:RecipeStage;recipe:Recipe;workspace:string;source:SourceManifest;origin:'real'|'demo';timeoutMs:number;previousFailure:string|null;/** Runner-owned scratch for validators; never supplied to the proposing worker. */validationRoot?:string; }
export interface WorkerResult { result:unknown;usage:Record<string,unknown>|null;exitCode:number; }
export interface Worker { execute(job:PreparedJob,signal:AbortSignal,onProgress:(summary:string)=>Promise<void>):Promise<WorkerResult>; }
export function candidate(summary:string,paths:string[],logicalKey:string,title:string,kind:AgentResult['artifact_candidates'][number]['kind']='document'):AgentResult { return {schema_version:'1.0',outcome:'candidate',summary,artifact_candidates:[{logical_key:logicalKey,title,kind,paths,limitations:['Human review pending.']}],observations:[],blockers:[],proposed_next_unit:null}; }
