import { homedir } from 'node:os';
import { resolve,join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { RunConfig } from './types.js';
import { validateRunConfig } from './contracts.js';
export function expandPath(value:string):string{return resolve(value==='~'?homedir():value.startsWith('~/')?join(homedir(),value.slice(2)):value);}
export function defaults(target:string,recipe='repo-book',preset='gentle'):RunConfig {
 const presets:Record<string,[number,number]>={gentle:[4,20],hard:[12,60],tibo:[24,120]};const p=presets[preset];if(!p)throw new Error('Unknown preset');
 return {schema_version:'1.0',recipe_id:recipe,mode:'bounded',target_path:expandPath(target),state_dir:join(homedir(),'.before-tibo'),budget:{max_dispatches:p[0],max_run_minutes:p[1],job_timeout_seconds:600,max_repairs_per_unit:2,max_consecutive_no_progress:2,finalization_reserve_seconds:30,max_run_disk_mb:500},quota:{required_buckets:[],reserve_percent:10,poll_seconds:15,stale_seconds:60},execution:{auth:'chatgpt',max_workers:1,sandbox:'required',task_network:'deny'},billing:{require_zero_incremental_charge:false,require_user_acknowledgement:true}};
}
export interface ConfigFlags { recipe?:string;preset?:string;config?:string;stateDir?:string;mode?:string;maxDispatches?:string;maxRunMinutes?:string;reservePercent?:string; }
export async function resolveConfig(target:string,flags:ConfigFlags):Promise<RunConfig>{
 const config=flags.config?validateRunConfig(JSON.parse(await readFile(flags.config,'utf8'))):defaults(target,flags.recipe,flags.preset);
 config.target_path=expandPath(target);config.state_dir=expandPath(flags.stateDir??config.state_dir);
 if(flags.recipe)config.recipe_id=flags.recipe;if(flags.mode)config.mode=flags.mode as RunConfig['mode'];
 if(flags.maxDispatches!==undefined)config.budget.max_dispatches=Number(flags.maxDispatches);
 if(flags.maxRunMinutes!==undefined)config.budget.max_run_minutes=Number(flags.maxRunMinutes);
 if(flags.reservePercent!==undefined)config.quota.reserve_percent=Number(flags.reservePercent);
 return validateRunConfig(config);
}
