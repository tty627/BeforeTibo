import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { validateContract } from '../../src/core/contracts.js';
import { resourcePath } from '../../src/core/resources.js';
import type { CsvDiffResult } from '../../src/core/types.js';

// Only the fixed, version-controlled template is evaluated here, never generated/user code.
const context: { TextEncoder: typeof TextEncoder; BeforeTiboCsv?: { parseCsv(input: string): { columns: string[]; rows: Record<string, string>[] }; diffCsv(before: string, after: string, key: string): CsvDiffResult } } = { TextEncoder };
runInNewContext(readFileSync(resourcePath('templates/csv-diff/app.js'), 'utf8'), context, { timeout: 1000 });
const api = context.BeforeTiboCsv!;
describe('AC-56..59 trusted CSV template semantics', () => {
  it('produces all four categories and contract-valid stable JSON matching fixed fixture', () => {
    const result = api.diffCsv(readFileSync(resourcePath('examples/csv-fixture/before.csv'), 'utf8'), readFileSync(resourcePath('examples/csv-fixture/after.csv'), 'utf8'), 'id');
    const expected = JSON.parse(readFileSync(resourcePath('examples/csv-fixture/expected-diff.json'), 'utf8')) as unknown;
    expect(JSON.parse(JSON.stringify(result))).toEqual(expected);
    expect(validateContract('csv-diff-result', result)).toBe(result);
  });
  it('handles BOM, escaped quotes, commas, CRLF, multiline fields and no last newline', () => {
    const result = api.parseCsv('\uFEFFid,note\r\n001,"a,b"\r\n002,"say ""hi"""\r\n003,"line1\r\nline2"');
    expect(result.rows.map(row => row.note)).toEqual(['a,b', 'say "hi"', 'line1\r\nline2']);
  });
  it('allows reordered columns, preserves zeros and whitespace, sorts by code units', () => {
    const result = api.diffCsv('id,v\n001, x\n1,x','v,id\nx,2\nx,10\n x,001','id');
    expect(result.added.map(row => row.id)).toEqual(['10', '2']);
    expect(result.removed.map(row => row.id)).toEqual(['1']);
    expect(result.summary.unchanged).toBe(1);
    expect(api.diffCsv('id,v\n1,x','id,v\n1, x','id').changed[0]?.changed_columns).toEqual(['v']);
  });
  it('handles special column names as data and preserves changed-column order', () => {
    const result = api.diffCsv('id,__proto__,constructor\n1,old,old','constructor,id,__proto__\nnew,1,new','id');
    expect(result.changed[0]?.before['__proto__']).toBe('old');
    expect(result.changed[0]?.changed_columns).toEqual(['__proto__', 'constructor']);
    validateContract('csv-diff-result', result);
  });
  it.each([
    ['id,v\n,x','id,v\n1,x','id',/empty primary key/],
    ['id,v\n1,x\n1,y','id,v\n1,x','id',/duplicate primary key/],
    ['id,v\n1,x','id,z\n1,x','id',/same column/],
    ['id,v\n1,x','id,v\n1,x','',/explicit primary key/],
  ])('rejects invalid keys or columns (%s)', (before, after, key, message) => expect(() => api.diffCsv(before as string, after as string, key as string)).toThrow(message as RegExp));
  it.each(['', 'id,\n1,x', 'id,id\n1,x', 'id,v\n1', 'id,v\n1,"broken', 'id,v\n1,bad"quote', 'id,v\n1,"quoted"suffix', 'id,v\n1,x\n\n'])('rejects malformed input without silently dropping data (%s)', input => expect(() => api.parseCsv(input)).toThrow());
  it('enforces 5 MiB and 20,000 data row caps', () => {
    expect(() => api.parseCsv('id,v\n1,' + 'x'.repeat(5 * 1024 * 1024))).toThrow(/5 MiB/);
    expect(api.parseCsv('id\n' + Array.from({ length: 20000 }, (_, i) => String(i)).join('\n')).rows).toHaveLength(20000);
    expect(() => api.parseCsv('id\n' + Array.from({ length: 20001 }, (_, i) => String(i)).join('\n'))).toThrow(/20,000/);
  });
  it('does not interpret HTML or formulas in string values', () => {
    const input = 'id,v\n1,<img src=x onerror=alert(1)>\n2,=1+1';
    const result = api.diffCsv('id,v', input, 'id');
    expect(result.added[0]?.v).toBe('<img src=x onerror=alert(1)>');
    expect(result.added[1]?.v).toBe('=1+1');
  });
});
