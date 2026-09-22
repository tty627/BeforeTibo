export interface BudgetView { max_dispatches: number; job_timeout_seconds: number; finalization_reserve_seconds: number; max_consecutive_no_progress: number; max_run_disk_mb: number; }
export class Deadline {
  private wall: number; private mono: number;
  constructor(readonly deadline: number, now = Date.now(), monotonic = performance.now()) { this.wall = now; this.mono = monotonic; }
  remaining(now = Date.now(), monotonic = performance.now()): { remaining: number; clockJump: boolean } {
    const elapsed = Math.max(0, monotonic - this.mono);
    const expected = this.wall + elapsed;
    return { remaining: Math.max(0, this.deadline - Math.max(now, expected)), clockJump: Math.abs(now - expected) > 5000 };
  }
}
export function dispatchBlock(budget: BudgetView, dispatches: number, noProgress: number, remainingMs: number, diskBytes: number): string | null {
  if (dispatches >= budget.max_dispatches) return 'max_dispatches';
  if (noProgress >= budget.max_consecutive_no_progress) return 'no_progress';
  if (remainingMs < (budget.job_timeout_seconds + budget.finalization_reserve_seconds) * 1000) return 'deadline';
  if (diskBytes >= budget.max_run_disk_mb * 1024 * 1024 * 0.95) return 'disk_limit';
  return null;
}
