import { describe, expect, it } from 'vitest';
import { JsonlParser, UsageAccumulator, normalizeUsage } from '../../src/adapters/codex/index.js';

describe('AC-30..33 bounded Codex stream and usage', () => {
  it('handles split UTF-8, combined lines and final line without newline', () => {
    const bytes = Buffer.from('{"type":"message","text":"收获"}\n{"type":"turn.completed"}');
    const parser = new JsonlParser();
    const events = [...parser.push(bytes.subarray(0, 29)), ...parser.push(bytes.subarray(29, 32)), ...parser.push(bytes.subarray(32)), ...parser.finish()];
    expect(events).toEqual([{ type: 'message', text: '收获' }, { type: 'turn.completed' }]);
    expect(parser.diagnostics).toEqual([]);
  });
  it('bounds oversized lines, skips malformed content and continues parsing', () => {
    const parser = new JsonlParser(20, 1000);
    expect(parser.push('a'.repeat(80) + '\nnot json\n[]\n{"ok":true}\n')).toEqual([{ ok: true }]);
    expect(parser.diagnostics).toEqual(['line_too_long', 'malformed_json', 'non_object']);
  });
  it('bounds total output and records truncated tail without retaining source', () => {
    const parser = new JsonlParser(20, 40);
    parser.push(' '.repeat(30)); parser.push('secret'.repeat(10));
    expect(parser.finish()).toEqual([]);
    expect(parser.diagnostics).toContain('stream_truncated');
    const truncated = new JsonlParser(); truncated.push('{"bad":'); truncated.finish();
    expect(truncated.diagnostics).toEqual(['malformed_json']);
  });
  it('does not count cached input or reasoning output twice and deduplicates turns', () => {
    const accumulator = new UsageAccumulator();
    const completed = { type: 'turn.completed', turn_id: 't1', usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 25, reasoning_output_tokens: 10 } };
    accumulator.observe({ type: 'thread.started', thread_id: 'synthetic-demo' });
    accumulator.observe(completed); accumulator.observe(completed);
    expect(accumulator.report()).toMatchObject({ input_tokens: 100, output_tokens: 25, cached_input_tokens: 80, reasoning_output_tokens: 10, usage_completeness: 'complete', coverage: 'completed_turns', turn_ids: ['t1'] });
  });
  it('separates cumulative usage from per-turn totals and handles missing fields', () => {
    const accumulator = new UsageAccumulator();
    accumulator.observe({ type: 'turn.completed', usage: { input_tokens: 50, output_tokens: 20 } });
    accumulator.observe({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { inputTokens: 200, outputTokens: 60 } } } });
    expect(accumulator.report(false)).toMatchObject({ input_tokens: 200, output_tokens: 60, cached_input_tokens: null, reasoning_output_tokens: null, usage_completeness: 'partial', coverage: 'thread_cumulative' });
    expect(new UsageAccumulator().report()).toMatchObject({ input_tokens: null, usage_completeness: 'partial', coverage: 'unavailable' });
    expect(normalizeUsage({ input_tokens: -1, output_tokens: '0' }).input_tokens).toBeNull();
  });
  it('bounds event deduplication without throwing from a process stream callback', () => {
    const accumulator = new UsageAccumulator();
    expect(() => { for (let i = 0; i < 10_002; i++) accumulator.observe({ event_id: String(i), type: 'turn.completed', turn_id: 't1', usage: { input_tokens: 1, output_tokens: 1 } }); }).not.toThrow();
    expect(accumulator.report().usage_completeness).toBe('partial');
  });
  it('retains partial status when a later turn starts or fails', () => {
    const accumulator = new UsageAccumulator();
    accumulator.observe({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 5 } });
    accumulator.observe({ type: 'turn.started' });
    expect(accumulator.report().usage_completeness).toBe('partial');
  });
});
