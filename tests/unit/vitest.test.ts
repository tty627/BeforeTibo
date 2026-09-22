import { describe, expect, it } from 'vitest';
import { assessReproduction, newFilesPatch, parseVitestReport } from '../../src/validators/vitest.js';

const okay = { exitCode: 0, timedOut: false, cancelled: false, outputTruncated: false };
function report(statuses: string[], success = true) {
  return JSON.stringify({ success, numTotalTests: statuses.length, numPassedTests: statuses.filter((status) => status === 'passed').length, numFailedTests: statuses.filter((status) => status === 'failed').length, testResults: [{ name: '/isolated/project/tests/a.test.js', assertionResults: statuses.map((status, index) => ({ fullName: `scenario ${index}`, status, failureMessages: status === 'failed' ? ['Expected 3 but got 4'] : [] })) }] });
}
describe('Vitest protocol and evidence', () => {
  it('AC-52 AC-54 rejects zero tests, all skipped, missing JSON and mismatched counts', () => {
    for (const text of [report([]), report(['pending']), '{}', 'not JSON', report(['passed']).replace('"numTotalTests":1', '"numTotalTests":2')]) expect(parseVitestReport(text, okay, '4.1.11', '/isolated/project').passed_checks).toBe(false);
    expect(parseVitestReport(report(['passed']), okay, '4.1.11', '/isolated/project').passed_checks).toBe(true);
  });
  it('AC-52 fails timeouts, output overflow, nonzero exits and escaped test paths', () => {
    for (const overrides of [{ timedOut: true }, { outputTruncated: true }, { cancelled: true }, { exitCode: 1 }]) expect(parseVitestReport(report(['passed']), { ...okay, ...overrides }, '4.1.11', '/isolated/project').passed_checks).toBe(false);
    expect(parseVitestReport(report(['passed']).replace('/isolated/project/tests', '/outside'), okay, '4.1.11', '/isolated/project').passed_checks).toBe(false);
  });
  it('AC-55 differentiates stable reproduced differences, unstable behavior and missing expectations', () => {
    const failure = parseVitestReport(report(['failed'], false), { ...okay, exitCode: 1 }, '4.1.11', '/isolated/project');
    const passing = parseVitestReport(report(['passed']), okay, '4.1.11', '/isolated/project');
    const basis = 'The documented invariant requires a nonnegative returned value.';
    expect(assessReproduction(failure, failure, basis).status).toBe('reproduced_difference');
    expect(assessReproduction(failure, passing, basis).status).toBe('not_reproduced');
    expect(assessReproduction(failure, failure, '').status).toBe('unverified_expectation');
  });
  it('AC-53 creates only added-file patches, with explicit final newline semantics', () => {
    const patch = newFilesPatch({ 'tests/before-tibo/new.test.js': 'one\ntwo' });
    expect(patch).toContain('--- /dev/null'); expect(patch).toContain('@@ -0,0 +1,2 @@'); expect(patch).toContain('+one\n+two\n\\ No newline at end of file');
    expect(() => newFilesPatch({ '../escape': 'x' })).toThrow();
  });
});
