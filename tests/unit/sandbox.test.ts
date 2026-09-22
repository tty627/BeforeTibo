import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { executeProcess, executeSandboxed, probeSandbox, safeEnvironment } from '../../src/sandbox/index.js';

const roots: string[] = [];
async function temporary() { const root = await mkdtemp(path.join(os.tmpdir(), 'before-tibo-process-test-')); roots.push(root); return root; }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('bounded process execution', () => {
  it('AC-25 preserves argv literally and isolates inherited secrets', async () => {
    const cwd = await temporary(); const value = '$(touch should-not-exist); `echo injected`';
    const result = await executeProcess({ command: process.execPath, args: ['-e', 'console.log(process.argv[1]); console.log(process.env.OPENAI_API_KEY ?? "unavailable")', value], cwd, timeoutMs: 2000, env: { OPENAI_API_KEY: 'synthetic-secret', NODE_OPTIONS: '--inspect=0' } });
    expect(result.exitCode).toBe(0); expect(result.stdout).toBe(`${value}\nunavailable\n`);
    expect(safeEnvironment({ CUSTOM_API_KEY: 'x', NODE_OPTIONS: '--inspect' })).not.toHaveProperty('CUSTOM_API_KEY');
  });
  it('AC-25 terminates runaway processes on timeout and output overflow', async () => {
    const cwd = await temporary();
    const timeout = await executeProcess({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd, timeoutMs: 100 });
    expect(timeout.timedOut).toBe(true); expect(timeout.durationMs).toBeLessThan(3000);
    const overflow = await executeProcess({ command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'], cwd, timeoutMs: 2000, maxOutputBytes: 1024 });
    expect(overflow.outputTruncated).toBe(true); expect(Buffer.byteLength(overflow.stdout)).toBeLessThanOrEqual(1024);
  });
  it('AC-46 cancellation kills owned descendants without accepting a persisted PID', async () => {
    const cwd = await temporary(); const marker = path.join(cwd, 'escaped.txt');
    const controller = new AbortController();
    const childCode = `setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'escaped'),500);`;
    const script = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)},process.argv[1]],{stdio:'ignore'}); console.log('ready'); setInterval(()=>{},1000);`;
    const result = await executeProcess({ command: process.execPath, args: ['-e', script, marker], cwd, timeoutMs: 3000, signal: controller.signal, onStdout: () => controller.abort() });
    expect(result.cancelled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    await expect(readFile(marker)).rejects.toThrow();
  });
  it('streaming consumers can avoid retaining raw output', async () => {
    const cwd = await temporary(); const chunks: string[] = [];
    const result = await executeProcess({ command: process.execPath, args: ['-e', 'console.log("structured")'], cwd, timeoutMs: 2000, captureOutput: false, onStdout: (chunk) => chunks.push(chunk.toString('utf8')) });
    expect(chunks.join('')).toBe('structured\n'); expect(result.stdout).toBe('');
  });
});

describe('actual sandbox boundary', () => {
  it('AC-22 AC-23 AC-24 probes actual restrictions and never falls back to host execution', async () => {
    const probe = await probeSandbox();
    if (process.env.BEFORE_TIBO_EXPECT_EXECUTION === '1') expect(probe.available).toBe(true);
    if (probe.available) {
      expect(probe.outside_write_denied).toBe(true); expect(probe.external_network_denied).toBe(true); expect(probe.private_read_denied).toBe(true); expect(probe.inside_write_allowed).toBe(true);
    } else {
      const cwd = await temporary();
      await expect(executeSandboxed({ command: process.execPath, args: ['-e', 'process.exit(0)'], cwd, writableRoots: [cwd], timeoutMs: 3000 })).rejects.toThrow('blocked');
    }
  }, 15_000);
  it('AC-74 protects runner files from a validator under the verified backend', async () => {
    const root = await temporary(); const workspace = path.join(root, 'workspace'); await mkdir(workspace); const policy = path.join(root, 'policy.json'); await writeFile(policy, '{"budget":1}');
    const probe = await probeSandbox();
    if (!probe.available) {
      await expect(executeSandboxed({ command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: workspace, writableRoots: [workspace], timeoutMs: 3000 })).rejects.toThrow();
      return;
    }
    const result = await executeSandboxed({ command: process.execPath, args: ['-e', 'try {require("node:fs").writeFileSync(process.argv[1],"forged");process.exit(2)} catch(e) {process.exit(["EPERM","EACCES"].includes(e.code)?0:3)}', policy], cwd: workspace, writableRoots: [workspace], timeoutMs: 3000 });
    expect(result.exitCode).toBe(0); expect(await readFile(policy, 'utf8')).toBe('{"budget":1}');
  }, 15_000);
  it('AC-24 optional workspace Unix IPC does not grant external network access', async () => {
    const probe = await probeSandbox({ allowUnixSockets: true });
    if (probe.available) { expect(probe.unix_socket_allowed).toBe(true); expect(probe.external_network_denied).toBe(true); expect(probe.outside_write_denied).toBe(true); }
    else { const cwd = await temporary(); await expect(executeSandboxed({ command: process.execPath, args: ['-e', 'process.exit(0)'], cwd, writableRoots: [cwd], allowUnixSockets: true, timeoutMs: 3000 })).rejects.toThrow(); }
  }, 15_000);
});
