import { isAbsolute, relative } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { executeProcess } from '../../sandbox/process.js';
import { JsonlParser, type JsonRecord } from './jsonl.js';
import { UsageAccumulator, type UsageReport } from './usage.js';
import type { IdentityContext } from './quota.js';

export interface CapabilityReport {
  executable: string; version: string | null; exec: boolean; jsonl: boolean; outputSchema: boolean;
  sandboxPolicies: string[]; explicitApprovalPolicy: boolean; ignoreUserConfig: boolean; ignoreRules: boolean;
  ephemeral: boolean; readOnlyObserverProtocol: boolean; authIdentifiable: boolean;
  extensionsIsolation: 'unverified'; realExecutionReady: false; reasons: string[];
}
export const VERIFIED_PROTOCOL_VERSION = '0.154.0';
export async function probeCodex(executable = 'codex', cwd = process.cwd()): Promise<CapabilityReport> {
  const empty: CapabilityReport = { executable, version: null, exec: false, jsonl: false, outputSchema: false, sandboxPolicies: [], explicitApprovalPolicy: false, ignoreUserConfig: false, ignoreRules: false, ephemeral: false, readOnlyObserverProtocol: false, authIdentifiable: false, extensionsIsolation: 'unverified', realExecutionReady: false, reasons: [] };
  try {
    const [version, help, server] = await Promise.all([
      executeProcess({ command: executable, args: ['--version'], cwd, timeoutMs: 5000, maxOutputBytes: 64_000 }),
      executeProcess({ command: executable, args: ['exec', '--help'], cwd, timeoutMs: 5000, maxOutputBytes: 128_000 }),
      executeProcess({ command: executable, args: ['app-server', '--help'], cwd, timeoutMs: 5000, maxOutputBytes: 128_000 }),
    ]);
    const parsedVersion = /codex-cli\s+([0-9]+\.[0-9]+\.[0-9]+)/.exec(version.stdout)?.[1] ?? null;
    const known = parsedVersion === VERIFIED_PROTOCOL_VERSION;
    return { ...empty, version: parsedVersion, exec: help.exitCode === 0 && help.stdout.includes('codex exec'), jsonl: help.stdout.includes('--json'), outputSchema: help.stdout.includes('--output-schema'), sandboxPolicies: ['read-only', 'workspace-write'].filter(x => help.stdout.includes(x)), explicitApprovalPolicy: known && help.stdout.includes('--config'), ignoreUserConfig: help.stdout.includes('--ignore-user-config'), ignoreRules: help.stdout.includes('--ignore-rules'), ephemeral: help.stdout.includes('--ephemeral'), readOnlyObserverProtocol: known && server.exitCode === 0 && server.stdout.includes('generate-json-schema'), reasons: [...(known ? [] : ['Codex version has no verified protocol fixture']), 'Effective worker identity has not been verified', 'Extension isolation has not been verified for this installation', 'Sandbox protections require an independent runtime probe', 'Real model integration has not been run'] };
  } catch { return { ...empty, reasons: ['Codex unavailable or capability probe failed'] }; }
}
export function codexEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'CODEX_HOME']) if (source[key] !== undefined) result[key] = source[key];
  return result;
}
export interface ExecOptions {
  executable?: string; cwd: string; prompt: string; schemaPath: string; resultPath: string;
  capabilities: CapabilityReport; identity: IdentityContext; sandboxVerified: boolean; extensionsDisabledVerified: boolean;
  ackSpendRisk: boolean; ackExecutionRisk: boolean; requireZeroIncrementalCharge?: boolean;
  timeoutMs: number; signal?: AbortSignal; model?: string; env?: NodeJS.ProcessEnv;
  /** Exact overrides established by the metadata preflight, never Recipe input. */
  controlledConfig?: readonly string[];
  /** Resolve effective project layers at the actual attempt cwd before any model call. */
  verifyExecutionCwd?: (cwd: string) => Promise<void>;
  onEvent?: (event: JsonRecord) => void;
  validateCandidate: (value: unknown) => boolean;
}
export interface ExecResult {
  status: 'candidate' | 'failed' | 'interrupted'; candidate: unknown | null;
  usage: UsageReport; exitCode: number | null; diagnostics: string[];
}
export function buildExecArgs(options: ExecOptions): string[] {
  const cap = options.capabilities;
  if (options.requireZeroIncrementalCharge) throw new Error('BLOCKED_NO_HARD_BILLING_GUARD');
  if (!options.ackSpendRisk || !options.ackExecutionRisk) throw new Error('BLOCKED_CONSENT_REQUIRED');
  if (options.identity.authType !== 'chatgpt' || !options.identity.verified || !options.identity.accountIdHash || !options.identity.contextId) throw new Error('BLOCKED_AUTH_UNVERIFIED');
  if (!options.sandboxVerified || !options.extensionsDisabledVerified) throw new Error('BLOCKED_EXECUTION_BOUNDARY_UNVERIFIED');
  if (cap.version !== VERIFIED_PROTOCOL_VERSION || !cap.exec || !cap.jsonl || !cap.outputSchema || !cap.explicitApprovalPolicy || !cap.ignoreRules || !cap.ignoreUserConfig || !cap.ephemeral || !cap.sandboxPolicies.includes('workspace-write')) throw new Error('BLOCKED_UNSUPPORTED_CODEX_CAPABILITIES');
  if (![options.cwd, options.schemaPath, options.resultPath].every(isAbsolute)) throw new Error('Absolute execution paths required');
  const destination = relative(options.cwd, options.resultPath);
  if (!destination || destination.startsWith('..') || isAbsolute(destination)) throw new Error('Candidate result must be inside isolated attempt');
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error('Invalid attempt timeout');
  if (options.model !== undefined && (!options.model.trim() || options.model.length > 200 || /[\r\n\0]/.test(options.model))) throw new Error('Invalid explicit model');
  return ['exec', '--json', '--ephemeral', ...(options.controlledConfig ? ['--strict-config', '--skip-git-repo-check', ...options.controlledConfig.flatMap(value => ['-c', value])] : ['--ignore-user-config']), '--ignore-rules', ...(options.controlledConfig ? [] : ['--sandbox', 'workspace-write']), '-c', 'approval_policy="never"', '-c', 'shell_environment_policy.inherit="none"', ...(options.controlledConfig ? [] : ['-c', 'sandbox_workspace_write.network_access=false']), '--color', 'never', '--cd', options.cwd, '--output-schema', options.schemaPath, '--output-last-message', options.resultPath, ...(options.model ? ['--model', options.model] : []), '-'];
}
export class CodexExecAdapter {
  probe(executable = 'codex', cwd = process.cwd()): Promise<CapabilityReport> { return probeCodex(executable, cwd); }
  async execute(options: ExecOptions): Promise<ExecResult> {
    const args = buildExecArgs(options);
    await options.verifyExecutionCwd?.(options.cwd);
    const parser = new JsonlParser();
    const usage = new UsageAccumulator();
    let unknownEvents = 0;
    const consume = (records: JsonRecord[]): void => {
      for (const event of records) {
        usage.observe(event);
        // Never forward source, shell arguments, reasoning or arbitrary upstream messages.
        if (typeof event.type === 'string' && ['thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'item.started', 'item.completed', 'error'].includes(event.type)) options.onEvent?.({ type: event.type });
        else unknownEvents++;
      }
    };
    const result = await executeProcess({ command: options.executable ?? 'codex', args, cwd: options.cwd, timeoutMs: options.timeoutMs, maxOutputBytes: 20_971_520, signal: options.signal, env: codexEnvironment(options.env), input: options.prompt, captureOutput: false, onStdout: chunk => consume(parser.push(chunk)) });
    consume(parser.finish());
    const diagnostics: string[] = [...parser.diagnostics];
    if (unknownEvents) diagnostics.push('unknown_events_ignored');
    if (result.outputTruncated) diagnostics.push('stream_truncated');
    if (result.timedOut) diagnostics.push('attempt_timeout');
    if (result.cancelled) diagnostics.push('attempt_cancelled');
    if (result.exitCode !== 0) diagnostics.push('worker_nonzero_exit');
    let candidate: unknown = null;
    if (result.exitCode === 0 && !diagnostics.includes('stream_truncated') && !parser.diagnostics.length) {
      try {
        const stat = await lstat(options.resultPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) throw new Error('Invalid candidate file');
        const parsed: unknown = JSON.parse(await readFile(options.resultPath, 'utf8'));
        if (!options.validateCandidate(parsed)) throw new Error('Invalid candidate schema');
        candidate = parsed;
      } catch { diagnostics.push('candidate_missing_or_invalid'); }
    }
    const interrupted = result.cancelled || result.timedOut;
    return { status: interrupted ? 'interrupted' : candidate !== null ? 'candidate' : 'failed', candidate, usage: usage.report(result.exitCode === 0 && !interrupted), exitCode: result.exitCode, diagnostics };
  }
}
