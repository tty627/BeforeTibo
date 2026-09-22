import { it, expect } from 'vitest';
import { Deadline, dispatchBlock } from '../../src/core/budget.js';
const b={max_dispatches:4,job_timeout_seconds:10,finalization_reserve_seconds:5,max_consecutive_no_progress:2,max_run_disk_mb:50};
it('AC-41 AC-42 AC-43 bounds dispatch, deadline, disk and no progress',()=>{expect(dispatchBlock(b,4,0,999999,0)).toBe('max_dispatches');expect(dispatchBlock(b,1,2,999999,0)).toBe('no_progress');expect(dispatchBlock(b,1,0,10000,0)).toBe('deadline');expect(dispatchBlock(b,1,0,999999,50*1024*1024)).toBe('disk_limit');});
it('AC-77 wall clock rollback cannot extend a live deadline',()=> {const d=new Deadline(30000,10000,0);expect(d.remaining(5000,15000)).toEqual({remaining:5000,clockJump:true});expect(d.remaining(50000,100)).toEqual({remaining:0,clockJump:true});});
