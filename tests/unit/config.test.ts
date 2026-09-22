import { it,expect } from 'vitest';
import { defaults,resolveConfig } from '../../src/core/config.js';
it('AC-08 all presets preserve the same one-worker execution and spending boundaries',()=>{const a=defaults('.','repo-book','gentle'),b=defaults('.','repo-book','tibo');expect(b.budget.max_dispatches).toBe(24);expect(b.execution).toEqual(a.execution);expect(b.billing).toEqual(a.billing);expect(()=>defaults('.','repo-book','infinite')).toThrow();});
it('AC-27 configuration cannot express implicit consent or a yes override',async()=>{const c=await resolveConfig('.',{maxDispatches:'1'});expect(c.budget.max_dispatches).toBe(1);expect(c.billing.require_user_acknowledgement).toBe(true);await expect(resolveConfig('.',{maxDispatches:'NaN'})).rejects.toThrow();});
