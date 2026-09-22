// Capture real, synthetic DEMO pages. Never use this script with personal run data.
// Node 24: node scripts/capture-docs.mjs [demo-state-directory]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = resolve(process.argv[2] ?? join(project, '.local/delivery-demo'));
const destination = join(project, 'docs/assets');
await mkdir(destination, { recursive: true });
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const demos = [];
for (const id of await readdir(join(state, 'runs'))) {
  if (!/^run-[a-z0-9-]+$/u.test(id)) continue;
  const dir = join(state, 'runs', id);
  const metadata = await readJson(join(dir, 'run.json'));
  const runState = await readJson(join(dir, 'state.json'));
  if (metadata.data_origin === 'demo' && runState.artifacts.length) demos.push({ dir, metadata, runState });
}
demos.sort((a, b) => b.metadata.started_at.localeCompare(a.metadata.started_at));
const csv = demos.find(demo => demo.metadata.config.recipe_id === 'toolsmith-csv');
const report = demos.find(demo => demo.metadata.config.recipe_id === 'test-me-to-death' && demo.runState.status === 'COMPLETED');
assert.ok(csv && report, 'Create successful toolsmith-csv and test-me-to-death DEMOs before capture.');

const artifactRoot = join(csv.dir, 'artifacts', csv.runState.artifacts.at(-1));
const artifact = await readJson(join(artifactRoot, 'manifest.json'));
assert.equal(artifact.data_origin, 'demo');
assert.equal(artifact.kind, 'tool');
assert.ok(artifact.validations.every(check => !check.required || check.status === 'passed'));
for (const file of artifact.files) {
  assert.match(file.path, /^files\/out\/csv-diff\/[a-zA-Z0-9._-]+$/u);
  const data = await readFile(join(artifactRoot, file.path));
  assert.equal(data.length, file.size_bytes);
  assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
}

const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-sync'] });
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1100 }, deviceScaleFactor: 1, offline: true, serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', route => /^(?:file:|data:|blob:|about:)/u.test(route.request().url()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const verifyPublicText = async () => {
    const text = await page.locator('body').innerText();
    assert.match(text, /DEMO/u);
    assert.doesNotMatch(text, /(?:\/Users\/|\/home\/|file:\/\/|\bsk-[\w-]{12,}|\bgh[pousr]_[\w]{16,})/u);
  };
  await page.goto(pathToFileURL(join(artifactRoot, 'files/out/csv-diff/index.html')).href);
  for (const side of ['before', 'after']) {
    await page.locator(`#${side}-file`).setInputFiles({ name: `${side}.csv`, mimeType: 'text/csv', buffer: await readFile(join(project, 'examples/csv-fixture', `${side}.csv`)) });
  }
  await page.locator('#key-column').selectOption('id');
  await page.locator('#compare').click();
  assert.match(await page.locator('#status').innerText(), /1 added.*1 removed.*1 changed.*1 unchanged/u);
  const downloadReady = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadReady;
  const stream = await download.createReadStream();
  assert.ok(stream);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), await readJson(join(project, 'examples/csv-fixture/expected-diff.json')));
  await page.locator('h1').click();
  await verifyPublicText();
  await page.screenshot({ path: join(destination, 'csv-demo.png'), fullPage: true, animations: 'disabled' });

  await page.goto(pathToFileURL(join(report.dir, 'harvest/index.html')).href);
  await verifyPublicText();
  assert.match(await page.locator('header').innerText(), /COMPLETED/u);
  assert.match(await page.locator('header').innerText(), /3 logical artifacts · 3 dispatch intents/u);
  const firstArtifact = await page.locator('article').first().boundingBox();
  assert.ok(firstArtifact);
  // An honest viewport crop: header plus the first complete artifact. No DOM or CSS rewriting.
  const height = Math.ceil(firstArtifact.y + firstArtifact.height + 12);
  await page.setViewportSize({ width: 1180, height });
  await page.screenshot({ path: join(destination, 'harvest-demo.png'), animations: 'disabled' });
  console.log(JSON.stringify({ origin: 'DEMO', csv: { file: 'docs/assets/csv-demo.png', run: csv.metadata.run_id, expectedDiff: 'verified' }, harvest: { file: 'docs/assets/harvest-demo.png', run: report.metadata.run_id, artifacts: 3, dispatches: 3 }, note: 'Real screenshots of synthetic fixtures; no model or personal account was used.' }, null, 2));
} finally {
  await browser.close();
}
