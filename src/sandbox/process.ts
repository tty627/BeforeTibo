import { spawn } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export interface ProcessOptions {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  input?: string;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
  captureOutput?: boolean;
}
export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  outputTruncated: boolean;
  durationMs: number;
}

/** Never inherit API keys, loader injection variables, auth files or npm lifecycle configuration. */
export function safeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  for (const [key, value] of Object.entries(extra)) {
    if (/^(?:NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|BASH_ENV|ENV|.*(?:TOKEN|SECRET|API_KEY|PASSWORD|CREDENTIAL).*)$/iu.test(key)) continue;
    environment[key] = value;
  }
  return environment;
}

/** Trusted infrastructure only. Untrusted tests and tools MUST use executeSandboxed. */
export async function executeProcess(options: ProcessOptions): Promise<ProcessResult> {
  if (!path.isAbsolute(options.cwd)) throw new Error('Process cwd must be absolute');
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 86_400_000) throw new Error('Invalid process timeout');
  const limit = options.maxOutputBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100 * 1024 * 1024) throw new Error('Invalid process output limit');
  if (options.command.includes('\0') || options.args.some((arg) => arg.includes('\0'))) throw new Error('Invalid process argument');
  const start = performance.now();
  if (options.signal?.aborted) return { exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: true, outputTruncated: false, durationMs: 0 };
  return new Promise((resolve, reject) => {
    // Only processes created here are cancellable. No persisted PID is accepted or signalled.
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd, env: safeEnvironment(options.env), shell: false,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let timedOut = false;
    let cancelled = false;
    let outputTruncated = false;
    let captured = 0;
    let finished = false;
    let live = true;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const terminate = () => {
      if (!live || !child.pid) return;
      try {
        // One immediate group signal avoids delayed escalation against a recycled PID.
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, options.timeoutMs);
    const abort = () => { cancelled = true; terminate(); };
    options.signal?.addEventListener('abort', abort, { once: true });
    const collect = (chunks: Buffer[], chunk: Buffer) => {
      const remaining = Math.max(0, limit - captured);
      if (remaining) { const retained = chunk.subarray(0, remaining); if (options.captureOutput !== false) chunks.push(retained); captured += retained.byteLength; }
      if (chunk.byteLength > remaining) { outputTruncated = true; terminate(); }
    };
    const stream = (chunks: Buffer[], chunk: Buffer, callback?: (value: Buffer) => void) => {
      if (finished) return;
      collect(chunks, chunk);
      if (!outputTruncated) {
        try { callback?.(chunk); }
        catch (error) { terminate(); cleanup(); reject(error); }
      }
    };
    child.stdout.on('data', (chunk: Buffer) => stream(stdout, chunk, options.onStdout));
    child.stderr.on('data', (chunk: Buffer) => stream(stderr, chunk, options.onStderr));
    // Clean up inherited-pipe children as soon as the owned group leader exits.
    child.once('exit', () => { terminate(); live = false; });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); finished = true; live = false; };
    child.once('error', (error) => { if (!finished) { cleanup(); reject(error); } });
    child.once('close', (exitCode, signal) => {
      if (finished) return;
      cleanup();
      resolve({ exitCode, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), timedOut, cancelled, outputTruncated, durationMs: Math.round(performance.now() - start) });
    });
    child.stdin.on('error', () => { /* A child may reject stdin before the bounded producer finishes. */ });
    child.stdin.end(options.input);
  });
}
