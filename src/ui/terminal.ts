import type { RunState } from '../core/state.js';
import { quotaReceipt } from '../harvest/report.js';
const clean=(value:string):string=>value.replace(/[\p{Cc}\p{Cf}]/gu,'');
export function renderState(state:RunState,maxDispatches?:number):string {
 const attempts=Object.values(state.attempts);
 const active=attempts.find(a=>['intent','running','candidate'].includes(a.status));
 const counts=['accepted','candidate','quarantined','rejected','interrupted'].map(status=>`${status}: ${attempts.filter(attempt=>attempt.status===status).length}`).join(' | ');
 const recent=attempts.slice(-3).map(attempt=>`${clean(attempt.unit)}: ${attempt.status}`).join(' · ');
 const quota=quotaReceipt(state);
 const windows=quota.buckets.flatMap(bucket=>bucket.windows.map(window=>`${clean(bucket.limit_id??'unknown')}/${clean(window.name??'unknown')}: ${window.remaining_percent===null?'unavailable':`${window.remaining_percent}% remaining`} | window ${window.window_duration_minutes??'unavailable'} min | resets ${window.resets_at_unix_seconds??'unavailable'} Unix s`));
 const quotaDetails=windows.length?`\n${windows.join('\n')}\nQuota source: ${clean(quota.source??'unavailable')} | observed ${quota.observed_at??'unavailable'} | account-wide; windows independent`:'\nQuota windows: unavailable';
 return `BEFORE TIBO · ${state.origin.toUpperCase()}\nRun ID: ${clean(state.runId)}\nCurrent unit: ${clean(active?.unit??'none')}\nState: ${state.status} | Dispatches: ${state.dispatches}${maxDispatches?` / ${maxDispatches}`:''} | Started: ${state.startedWorkers}\nAttempts: ${counts}\nRecent: ${recent||'none'}\nArtifacts: ${state.artifacts.length} accepted | Quota: ${clean(quota.status)} | Usage: ${state.usage.length?'observed (may be partial)':'unavailable'}${quotaDetails}\nStop: Ctrl+C to drain, twice to cancel. ${clean(state.stopReason??'')}`;
}
