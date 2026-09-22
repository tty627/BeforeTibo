import { quotaGate,type QuotaObservation,type QuotaMapping,type IdentityContext } from '../adapters/codex/quota.js';
/** Observer reads never dispatch a model and cannot expand the fixed RunConfig budget. */
export class QuotaMonitor {
 private current:QuotaObservation|null=null; private previous:QuotaObservation|null=null;
 constructor(private readonly read:()=>Promise<QuotaObservation>,private readonly identity:IdentityContext,private readonly mapping:QuotaMapping,private readonly reserve:number,private readonly staleMs:number){}
 async refresh():Promise<void>{this.previous=this.current;try{this.current=await this.read();}catch{this.current=null;}}
 decision(now=Date.now()){return quotaGate({snapshot:this.current,previous:this.previous,workerIdentity:this.identity,mapping:this.mapping,reservePercent:this.reserve,staleMs:this.staleMs,now});}
 async preDispatch():Promise<string|null>{await this.refresh();const d=this.decision();return d.dispatch?null:d.reason;}
 snapshot():QuotaObservation|null{return this.current;}
}
