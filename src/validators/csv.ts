import { access, copyFile, lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { candidate, type PreparedJob } from '../core/worker.js';
import type { AgentResult, CsvDiffResult, ValidationResult } from '../core/types.js';
import { resourcePath } from '../core/resources.js';
import { validateContract } from '../core/contracts.js';
import { executeSandboxed, probeSandbox } from '../sandbox/index.js';
import { resolveSafePath } from '../workspace/index.js';
import { check, walkFiles } from './structural.js';
import { hash, pinArtifactFiles } from '../storage/artifacts.js';

const templateFiles = ['index.html', 'app.js', 'styles.css', 'README.md', 'sample-a.csv', 'sample-b.csv', 'expected-diff.json'] as const;
export async function createCsvTool(destination: string, options: { overwrite?: boolean } = {}): Promise<string[]> {
  await mkdir(destination, { recursive: true });
  for (const file of templateFiles) {
    try { await copyFile(resourcePath('templates', 'csv-diff', file), join(destination, file), options.overwrite === false ? constants.COPYFILE_EXCL : 0); }
    catch (error) { if (options.overwrite !== false || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; const stat = await lstat(join(destination, file)); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe seeded tool file'); }
  }
  return [...templateFiles];
}
export async function writeCsvDemo(workspace: string): Promise<AgentResult> {
  const destination = join(workspace, 'out/csv-diff');
  const files = await createCsvTool(destination);
  const html = await readFile(join(destination, 'index.html'), 'utf8');
  await writeFile(join(destination, 'index.html'), html.replace('<!-- origin-marker -->', '<p class="notice"><strong>DEMO</strong> — deterministic template worker; no model was called. Uploaded files are processed locally.</p>'));
  return candidate('DEMO: complete offline CSV Diff candidate, pending fixed browser validation.', files.map(file => `out/csv-diff/${file}`), 'csv-diff', 'DEMO — CSV Diff local tool', 'tool');
}

/** This fixed suite lives outside the candidate directory and is never selected by a Recipe. */
export const CSV_BROWSER_CHECK_SOURCE = String.raw`
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const { chromium } = require(process.argv[2]);
const target = process.argv[3], scratch = process.argv[4];
const expected = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
const privateProbePath = process.argv[9], forbiddenWritePath = process.argv[10];
const before = fs.readFileSync(process.argv[6], 'utf8'), after = fs.readFileSync(process.argv[7], 'utf8');
let phase = 'browser-launch';
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[8], headless: true, chromiumSandbox: false, downloadsPath: scratch, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
  try {
    phase = 'browser-context';
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
    const external = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(file:|data:|blob:|about:)/.test(url)) return route.continue();
      external.push('blocked-external-request'); return route.abort('blockedbyclient');
    });
    let privateReadDenied = false, outsideWriteDenied = false;
    try { fs.readFileSync(privateProbePath); } catch (error) { privateReadDenied = ['EPERM','EACCES'].includes(error.code); }
    try { fs.writeFileSync(forbiddenWritePath, 'must-not-write'); } catch (error) { outsideWriteDenied = ['EPERM','EACCES'].includes(error.code); }
    assert.equal(privateReadDenied, true); assert.equal(outsideWriteDenied, true);
    const privatePage = await context.newPage();
    let browserPrivateReadDenied = false;
    try { await privatePage.goto(pathToFileURL(privateProbePath).href); } catch { browserPrivateReadDenied = true; }
    assert.equal(browserPrivateReadDenied, true); await privatePage.close();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    phase = 'page-load';
    await page.goto(target, { waitUntil: 'load' });
    const upload = async (side, text) => page.locator('#' + side + '-file').setInputFiles({ name: side + '.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
    phase = 'file-input';
    await upload('before', before); await upload('after', after);
    await page.waitForFunction(() => !document.getElementById('compare').disabled);
    await page.locator('#compare').click();
    assert.match(await page.locator('#error').textContent(), /primary key/i);
    await page.locator('#key-column').selectOption('id'); await page.locator('#compare').click();
    assert.match(await page.locator('#status').textContent(), /1 added.*1 removed.*1 changed.*1 unchanged/);
    const downloadEvent = page.waitForEvent('download'); await page.locator('#export').click();
    const download = await downloadEvent; const downloadPath = path.join(scratch, 'actual-export.json'); await download.saveAs(downloadPath);
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8')); assert.deepEqual(exported, expected);
    const checks = ['file-input', 'explicit-key', 'four-result-categories', 'json-download'];
    phase = 'csv-boundary';
    const edgeResults = await page.evaluate(() => {
      const { parseCsv, diffCsv } = globalThis.BeforeTiboCsv;
      const failures = [];
      function test(name, body) { try { if (!body()) failures.push(name); } catch { failures.push(name); } }
      function rejected(body) { try { body(); return false; } catch { return true; } }
      test('bom-quotes-crlf-multiline', () => {
        const parsed = parseCsv('\uFEFFid,note\r\n001,"a,b"\r\n002,"line1\nline2"\r\n003,"say ""hi"""\r\n');
        return parsed.rows.length === 3 && parsed.rows[0].note === 'a,b' && parsed.rows[1].note === 'line1\nline2' && parsed.rows[2].note === 'say "hi"';
      });
      test('leading-zero-whitespace', () => { const r = diffCsv('id,v\n001, x\n','id,v\n1, x\n','id'); return r.summary.added === 1 && r.summary.removed === 1; });
      test('empty-key', () => rejected(() => diffCsv('id,v\n,x','id,v\n1,x','id')));
      test('duplicate-key', () => rejected(() => diffCsv('id,v\n1,x\n1,y','id,v\n1,x','id')));
      test('column-mismatch', () => rejected(() => diffCsv('id,v\n1,x','id,w\n1,x','id')));
      test('empty-header', () => rejected(() => parseCsv('id,\n1,x')));
      test('duplicate-header', () => rejected(() => parseCsv('id,id\n1,x')));
      test('row-width', () => rejected(() => parseCsv('id,v\n1')));
      test('bad-quotes', () => rejected(() => parseCsv('id,v\n1,"broken')));
      test('byte-limit', () => rejected(() => parseCsv('id,v\n1,' + 'x'.repeat(5 * 1024 * 1024))));
      test('row-limit', () => rejected(() => parseCsv('id\n' + Array.from({length:20001}, (_,i) => String(i)).join('\n'))));
      test('prototype-columns', () => { const r = diffCsv('id,__proto__\n1,a','__proto__,id\nb,1','id'); return r.changed[0].before.__proto__ === 'a' && r.changed[0].after.__proto__ === 'b' && r.changed[0].changed_columns[0] === '__proto__'; });
      test('code-unit-sort', () => { const r = diffCsv('id,v','id,v\n2,x\n10,x\n001,x','id'); return r.added.map(x=>x.id).join(',') === '001,10,2'; });
      test('changed-column-order', () => { const r = diffCsv('id,z,a\n1,old,old','a,id,z\nnew,1,new','id'); return r.changed[0].changed_columns.join(',') === 'z,a'; });
      return { failures, count: 14 };
    });
    assert.deepEqual(edgeResults.failures, []); checks.push('14-csv-boundary-cases');
    phase = 'html-input';
    const malicious = 'id,note\n1,<img src=x onerror=globalThis.injected=1>\n';
    await upload('before', 'id,note\n'); await upload('after', malicious);
    await page.waitForFunction(() => !document.getElementById('compare').disabled);
    await page.locator('#key-column').selectOption('id'); await page.locator('#compare').click();
    assert.ok((await page.locator('#results').textContent()).includes('<img src=x onerror=globalThis.injected=1>'));
    assert.equal(await page.locator('#results img').count(), 0);
    assert.equal(await page.evaluate(() => globalThis.injected ?? null), null); checks.push('html-input-is-text');
    phase = 'network';
    const networkDenied = await page.evaluate(async () => { try { await fetch('https://example.invalid/beforetibo-fixed-probe'); return false; } catch { return true; } });
    assert.equal(networkDenied, true); assert.deepEqual(external, []); checks.push('csp-network-denied', 'no-external-tool-requests');
    console.log(JSON.stringify({ passed: true, checks, exported, networkDenied, privateReadDenied, outsideWriteDenied, browserPrivateReadDenied }));
  } finally { await browser.close(); }
})().catch(() => { console.log(JSON.stringify({passed:false,phase})); process.exitCode = 1; });
`;

export async function validateCsvTool(job: PreparedJob, candidateResult?: AgentResult, signal?: AbortSignal): Promise<ValidationResult[]> {
  const unavailable = (message: string) => [check('csv-tool-functional', 'skipped', message), check('no-external-network', 'skipped', message)];
  const probe = await probeSandbox({ allowUnixSockets: true, allowBrowserIPC: true });
  if (!probe.available) return unavailable(`Required browser check not run: ${probe.reason}`);
  if (!job.validationRoot) return unavailable('Required browser check not run: runner-owned disk-budgeted validation root is unavailable.');
  let playwrightPath: string;
  let browserPath: string;
  try {
    const require = createRequire(import.meta.url);
    playwrightPath = require.resolve('playwright');
    const playwright = require('playwright') as { chromium: { executablePath(): string } };
    browserPath = playwright.chromium.executablePath(); await access(browserPath);
  } catch { return unavailable('Required browser check not run: install the supported Playwright and Chromium validation backend.'); }
  const cleanup: string[] = [];
  const temporary = async (prefix: string, parent = job.validationRoot!): Promise<string> => {
    const root = await mkdtemp(join(parent, prefix)); cleanup.push(root); return root;
  };
  try {
    // Product runs supply a runner-owned root outside the worker workspace, included in its disk budget.
    const trusted = await temporary('csv-check-');
    // Stop Node's package-scope discovery here instead of reading an arbitrary state-directory ancestor.
    await writeFile(join(trusted, 'package.json'), '{"type":"commonjs"}\n', { mode: 0o400, flag: 'wx' });
    const fresh = await temporary('csv-fresh-');
    const restricted = await temporary('csv-private-');
    await writeFile(join(restricted, 'private.txt'), 'synthetic private-read probe');
    const execution = await temporary('csv-exec-');
    // macOS AF_UNIX paths are short. This private alias holds no browser data: its target is budgeted above.
    let chromiumTemporary = execution;
    if (process.platform === 'darwin') {
      const alias = await temporary('btc-', '/private/tmp');
      chromiumTemporary = join(alias, 'w');
      await symlink(execution, chromiumTemporary, 'dir');
    }
    const candidateRoot = await resolveSafePath(job.workspace, 'out/csv-diff', { mustExist: true });
    const evidencePath = 'out/csv-diff/validation.json';
    const paths = (await walkFiles(candidateRoot)).map(file => `out/csv-diff/${file}`).filter(file => file !== evidencePath);
    if (paths.length > 3000) throw new Error('CSV tool file bound exceeded');
    const pinned = await pinArtifactFiles(job.workspace, paths);
    for (const file of pinned) {
      const bytes = await readFile(await resolveSafePath(job.workspace, file.path, { mustExist: true }));
      if (hash(bytes) !== file.sha256 || bytes.length !== file.size_bytes) throw new Error('Candidate changed before independent validation');
      const destination = await resolveSafePath(fresh, file.path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx', mode: 0o400 });
    }
    const index = await resolveSafePath(fresh, 'out/csv-diff/index.html', { mustExist: true });
    const script = join(trusted, 'fixed-check.cjs');
    await writeFile(script, CSV_BROWSER_CHECK_SOURCE);
    const expectedPath = resourcePath('examples/csv-fixture/expected-diff.json');
    const output = await executeSandboxed({ command: process.execPath, args: [script, playwrightPath, pathToFileURL(index).href, execution, expectedPath, resourcePath('examples/csv-fixture/before.csv'), resourcePath('examples/csv-fixture/after.csv'), browserPath, join(restricted, 'private.txt'), join(restricted, 'forbidden.txt')], cwd: execution, writableRoots: [execution], allowUnixSockets: true, allowBrowserIPC: true, readableRoots: [trusted, fresh, resourcePath('examples/csv-fixture'), resolve(dirname(playwrightPath), '..'), resolve(dirname(browserPath), '../../..')], timeoutMs: Math.min(job.timeoutMs, 60_000), maxOutputBytes: 1_048_576, signal, env: { TMPDIR: execution, HOME: execution, MAC_CHROMIUM_TMPDIR: chromiumTemporary, CFFIXED_USER_HOME: execution } });
    if (output.exitCode !== 0 || output.timedOut || output.cancelled || output.outputTruncated) {
      let phase = 'unknown';
      try { const parsed: unknown = JSON.parse(output.stdout.trim()); if (typeof parsed === 'object' && parsed && 'phase' in parsed && typeof parsed.phase === 'string' && ['browser-launch','browser-context','page-load','file-input','csv-boundary','html-input','network'].includes(parsed.phase)) phase = parsed.phase; } catch { /* Bounded sanitized diagnostics only. */ }
      return [check('csv-tool-functional', 'failed', `Fixed sandboxed browser suite failed, timed out or was interrupted (phase: ${phase}).`), check('no-external-network', 'passed', 'Independent sandbox network-denial probe passed; browser process had no task network.')];
    }
    const result: unknown = JSON.parse(output.stdout.trim());
    if (typeof result !== 'object' || result === null || !('passed' in result) || result.passed !== true || !('exported' in result) || !('networkDenied' in result) || result.networkDenied !== true || !('privateReadDenied' in result) || result.privateReadDenied !== true || !('outsideWriteDenied' in result) || result.outsideWriteDenied !== true || !('browserPrivateReadDenied' in result) || result.browserPrivateReadDenied !== true) throw new Error('Invalid fixed browser suite result');
    try { await access(join(restricted, 'forbidden.txt')); throw new Error('Sandbox allowed an outside write'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const unchanged = JSON.stringify(pinned) === JSON.stringify(await pinArtifactFiles(job.workspace, paths));
    const copyUnchanged = JSON.stringify(pinned) === JSON.stringify(await pinArtifactFiles(fresh, paths));
    const afterPaths = (await walkFiles(candidateRoot)).map(file => `out/csv-diff/${file}`).filter(file => file !== evidencePath);
    if (!unchanged || !copyUnchanged || JSON.stringify(paths) !== JSON.stringify(afterPaths)) throw new Error('Candidate file set or bytes changed during independent validation');
    const exported = validateContract<CsvDiffResult>('csv-diff-result', result.exported);
    const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as unknown;
    if (JSON.stringify(exported) !== JSON.stringify(expected)) throw new Error('CSV export differs from immutable runner expectation');
    const evidenceDestination = await resolveSafePath(job.workspace, evidencePath);
    await unlink(evidenceDestination).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    await writeFile(evidenceDestination, JSON.stringify({ schema_version: '1.0', data_origin: job.origin, validator: 'csv-tool-functional', validator_version: '1.0', verified_files: pinned, checks: ['real-file-input','explicit-primary-key','four-difference-categories','json-download','14-boundary-cases','html-input-inert','private-read-denied','outside-write-denied','external-network-denied'], limitation: 'Passing these listed checks does not prove all possible behavior correct. Human review remains required.' }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    if (candidateResult?.artifact_candidates[0]) candidateResult.artifact_candidates[0].paths = [...new Set([...candidateResult.artifact_candidates[0].paths, evidencePath])];
    return [{ ...check('csv-tool-functional', 'passed', 'Fresh-copy browser import, explicit key, comparison, JSON download, 14 boundary cases, inert HTML and pinned-file integrity checks passed.'), evidence_paths: [evidencePath] }, check('no-external-network', 'passed', 'OS network denial, exact browser/driver private-read and outside-write denials, browser CSP and zero external tool requests passed.')];
  } catch { return [check('csv-tool-functional', 'failed', 'Fixed browser validation could not complete safely.'), check('no-external-network', 'passed', 'Independent sandbox probe denied external network.')]; }
  finally { for (const root of cleanup.reverse()) await rm(root, { recursive: true, force: true }); }
}
