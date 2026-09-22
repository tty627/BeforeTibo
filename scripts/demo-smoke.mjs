import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = await mkdtemp(join(tmpdir(), 'before-tibo-demo-smoke-'));
try {
  const cli = resolve('dist/cli.js');
  const result = spawnSync(process.execPath, [cli, 'demo', '--state-dir', root, '--json'], { encoding: 'utf8', env: { PATH: '/nonexistent', HOME: root }, timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  const run = JSON.parse(result.stdout);
  assert.equal(run.data_origin, 'demo'); assert.equal(run.status, 'COMPLETED');
  const receipt = JSON.parse(await readFile(join(run.runDir, 'harvest', 'receipt.json'), 'utf8'));
  assert.equal(receipt.artifacts.length, 1); assert.equal(receipt.data_origin, 'demo');
  const harvest = spawnSync(process.execPath, [cli, 'harvest', run.runId, '--state-dir', root, '--json'], { encoding: 'utf8', env: { PATH: '/nonexistent', HOME: root }, timeout: 10_000 });
  assert.equal(harvest.status, 0, harvest.stderr); assert.equal(JSON.parse(harvest.stdout).model_calls, 0);
  process.stdout.write('PASS: offline DEMO and harvest without Codex on PATH\n');
} finally { await rm(root, { recursive: true, force: true }); }
