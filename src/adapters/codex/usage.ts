import { isRecord } from './jsonl.js';

export interface Usage {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_output_tokens: number | null;
}
export interface UsageReport extends Usage {
  usage_completeness: 'complete' | 'partial';
  coverage: 'completed_turns' | 'thread_cumulative' | 'unavailable';
  thread_id: string | null;
  turn_ids: string[];
}
const fields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'] as const;
const camel = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'] as const;
const unknownUsage = (): Usage => ({ input_tokens: null, cached_input_tokens: null, output_tokens: null, reasoning_output_tokens: null });
function count(value: unknown): number | null { return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null; }
export function normalizeUsage(value: unknown): Usage {
  if (!isRecord(value)) return unknownUsage();
  const result = unknownUsage();
  for (let i = 0; i < fields.length; i++) result[fields[i]!] = count(value[fields[i]!] ?? value[camel[i]!]);
  if (result.input_tokens !== null && result.cached_input_tokens !== null && result.cached_input_tokens > result.input_tokens) result.cached_input_tokens = null;
  return result;
}
/** Exec turn.completed is one completed-turn total. App-server total is cumulative, never summed with turns. */
export class UsageAccumulator {
  private turns = new Map<string, Usage>();
  private cumulative: Usage | null = null;
  private seenEvents = new Set<string>();
  private activeTurn: string | null = null;
  private turnOrdinal = 0;
  private incomplete = true;
  private overflow = false;
  private threadId: string | null = null;
  observe(value: unknown): void {
    if (!isRecord(value)) return;
    const eventId = typeof value.event_id === 'string' ? value.event_id : null;
    if (eventId && this.seenEvents.has(eventId)) return;
    if (eventId && this.seenEvents.size >= 10_000) { this.overflow = true; return; }
    if (eventId) this.seenEvents.add(eventId);
    if (value.type === 'thread.started' && typeof value.thread_id === 'string') this.threadId = value.thread_id;
    if (value.type === 'turn.started') {
      this.activeTurn = typeof value.turn_id === 'string' ? value.turn_id : `local-turn-${++this.turnOrdinal}`;
      this.incomplete = true;
    }
    if (value.type === 'turn.failed' || value.type === 'error') this.incomplete = true;
    if (value.type === 'turn.completed') {
      const id = typeof value.turn_id === 'string' ? value.turn_id : this.activeTurn ?? 'unidentified-turn';
      if (this.turns.size >= 10_000 && !this.turns.has(id)) { this.overflow = true; return; }
      this.turns.set(id, normalizeUsage(value.usage));
      this.incomplete = false;
    }
    if (value.method === 'thread/tokenUsage/updated' && isRecord(value.params)) {
      const params = value.params;
      if (typeof params.threadId === 'string') this.threadId = params.threadId;
      if (isRecord(params.tokenUsage)) this.cumulative = normalizeUsage(params.tokenUsage.total);
    }
  }
  report(processCompleted = true): UsageReport {
    const result = unknownUsage();
    if (this.cumulative) Object.assign(result, this.cumulative);
    else if (this.turns.size) {
      for (const field of fields) {
        const numbers = [...this.turns.values()].map(x => x[field]);
        const total = numbers.reduce<number>((sum, x) => sum + (x ?? 0), 0);
        result[field] = numbers.some(x => x === null) || !Number.isSafeInteger(total) ? null : total;
      }
    }
    return { ...result, usage_completeness: processCompleted && !this.incomplete && !this.overflow && result.input_tokens !== null && result.output_tokens !== null ? 'complete' : 'partial', coverage: this.cumulative ? 'thread_cumulative' : this.turns.size ? 'completed_turns' : 'unavailable', thread_id: this.threadId, turn_ids: [...this.turns.keys()] };
  }
}
