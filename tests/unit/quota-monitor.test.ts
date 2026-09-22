import { it,expect } from 'vitest';
import { QuotaMonitor } from '../../src/core/quota-monitor.js';
it('AC-66 observer failures never silently enable bounded dispatch',async()=>{
 const m=new QuotaMonitor(async()=>{throw new Error('offline');},{authType:'chatgpt',accountIdHash:'demo-account',contextId:'demo-context',verified:true},{verified:true,model:'demo-model',windows:[{limitId:'codex',name:'primary'}]},10,60000);
 expect(await m.preDispatch()).toBeTruthy();expect(m.decision().dispatch).toBe(false);
});
