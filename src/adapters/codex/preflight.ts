import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile, access } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { probeSandbox, type SandboxProbe } from '../../sandbox/index.js';
import { executeProcess } from '../../sandbox/process.js';
import type { RunConfig } from '../../core/types.js';
import { codexEnvironment, probeCodex, VERIFIED_PROTOCOL_VERSION, type CapabilityReport, type ExecOptions } from './exec.js';
import { isRecord, JsonlParser } from './jsonl.js';
import { normalizeQuota, quotaGate, type IdentityContext, type QuotaMapping, type QuotaObservation } from './quota.js';

export const isolatedFeatures = ['hooks', 'plugins', 'apps', 'multi_agent', 'multi_agent_v2', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'image_generation', 'in_app_browser', 'in_app_chat', 'in_app_local_automation', 'remote_plugin', 'recommended_plugins', 'skill_search', 'skill_mcp_dependency_install', 'workspace_dependencies', 'memories', 'goals', 'shell_snapshot', 'shell_snapshot_v2'] as const;
export const permissionProfileName = 'before-tibo-v010';
function toml(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(',')}]`;
  if (isRecord(value)) return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function permissionProfile(recipeId = 'repo-book'): Record<string, unknown> {
  return { filesystem: { ':root': 'deny', ':minimal': 'read', '/System': 'read', '/usr': 'read', '/bin': 'read', '/sbin': 'read', '/Library/Apple': 'read', ':tmpdir': 'deny', ':slash_tmp': 'deny', ':workspace_roots': { '.': 'write', project: 'read', ...(recipeId === 'test-me-to-death' ? { 'project/tests/before-tibo': 'write' } : {}) }, [process.execPath]: 'read' }, network: { enabled: false } };
}
export function isolationOverrides(recipeId = 'repo-book'): string[] {
  return [...isolatedFeatures.map(feature => `features.${feature}=false`), 'features.skip_host_skill_discovery=true', 'forced_login_method="chatgpt"', 'model_provider="openai"', 'project_doc_max_bytes=0', 'developer_instructions=""', 'web_search="disabled"', 'approval_policy="never"', `default_permissions="${permissionProfileName}"`, `permissions.${permissionProfileName}=${toml(permissionProfile(recipeId))}`, 'shell_environment_policy.inherit="none"', 'shell_environment_policy.include_only=["PATH","LANG","LC_ALL"]', 'shell_environment_policy.set.PATH="/usr/bin:/bin:/usr/sbin:/sbin"', 'shell_environment_policy.set.LANG="C.UTF-8"', 'shell_environment_policy.set.LC_ALL="C.UTF-8"', 'allow_login_shell=false', 'notify=[]', 'analytics.enabled=false', 'feedback.enabled=false', 'check_for_update_on_startup=false'];
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const cliOverrides = (values: readonly string[]): string[] => values.flatMap(value => ['-c', value]);
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).filter(key => value[key] !== null).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hasKeys = (value: unknown): boolean => isRecord(value) && Object.keys(value).length > 0;
export interface Inspection { config: Record<string, unknown>; requirements: unknown; skills: { path: string; enabled: boolean }[]; account?: unknown; rateLimits?: unknown }
/** Only the digest may be persisted; effective configuration can contain local paths. */
export const executionConfigHash = (evidence: Inspection): string => hash(stable(evidence.config));
function supportedCapabilities(capabilities: CapabilityReport): boolean {
  return capabilities.version === VERIFIED_PROTOCOL_VERSION && capabilities.readOnlyObserverProtocol && capabilities.exec && capabilities.jsonl && capabilities.outputSchema && capabilities.explicitApprovalPolicy && capabilities.ignoreRules && capabilities.ignoreUserConfig && capabilities.ephemeral && capabilities.sandboxPolicies.includes('workspace-write');
}
interface MetadataConnection { read(method: 'config/read' | 'configRequirements/read' | 'skills/list' | 'account/read' | 'account/rateLimits/read', params?: unknown): Promise<unknown>; close(): void }
/** A distinct metadata-only channel: no thread/start, turn/start, command, or account mutation. */
async function metadataConnection(executable: string, cwd: string, overrides: string[], env: NodeJS.ProcessEnv): Promise<MetadataConnection> {
  const child = spawn(executable, ['app-server', '--strict-config', '--listen', 'stdio://', ...cliOverrides(overrides)], { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  const parser = new JsonlParser(); let nextId = 1; let closed = false; let bytes = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const close = (): void => {
    if (closed) return; closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('BLOCKED_METADATA_TRANSPORT')); }
    pending.clear(); child.stdin.end();
    // Kill only this live, owned process group, including inherited-pipe children.
    if (child.pid) try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL'); }
  };
  child.on('error', close); child.on('exit', close); child.on('close', close); child.stdin.on('error', close);
  child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2_097_152) close(); });
  child.stdout.on('data', (chunk: Buffer) => {
    bytes += chunk.length; if (bytes > 2_097_152) { close(); return; }
    for (const message of parser.push(chunk)) {
      if ('method' in message) { if (typeof message.id === 'number' || typeof message.id === 'string') child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Metadata client rejects requests' } }) + '\n'); continue; }
      if (typeof message.id !== 'number') continue;
      const request = pending.get(message.id); if (!request) continue; pending.delete(message.id); clearTimeout(request.timer);
      if ('error' in message || !('result' in message)) request.reject(new Error('BLOCKED_METADATA_RPC')); else request.resolve(message.result);
    }
    if (parser.diagnostics.length) close();
  });
  const request = (method: string, params?: unknown): Promise<unknown> => {
    if (closed || !['initialize', 'config/read', 'configRequirements/read', 'skills/list', 'account/read', 'account/rateLimits/read'].includes(method)) return Promise.reject(new Error('BLOCKED_METADATA_METHOD'));
    const id = nextId++;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('BLOCKED_METADATA_TIMEOUT')); close(); }, 10_000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n'); });
  };
  try {
    await request('initialize', { clientInfo: { name: 'before_tibo_preflight', version: '0.1.0-alpha.1' }, capabilities: { experimentalApi: false } });
    child.stdin.write('{"method":"initialized"}\n');
    return { read: request, close };
  } catch (error) { close(); throw error; }
}
async function inspect(executable: string, cwd: string, overrides: string[], env: NodeJS.ProcessEnv, includeAccount: boolean): Promise<Inspection> {
  const connection = await metadataConnection(executable, cwd, overrides, env);
  try {
    const config = await connection.read('config/read', { includeLayers: false, cwd });
    const requirements = await connection.read('configRequirements/read', {});
    const rawSkills = await connection.read('skills/list', { cwds: [cwd], forceReload: true });
    if (!isRecord(config) || !isRecord(config.config) || !isRecord(requirements) || !Object.hasOwn(requirements, 'requirements') || !isRecord(rawSkills) || !Array.isArray(rawSkills.data)) throw new Error('BLOCKED_METADATA_SHAPE');
    const skills: Inspection['skills'] = [];
    for (const entry of rawSkills.data) {
      if (!isRecord(entry) || !Array.isArray(entry.errors) || entry.errors.length || !Array.isArray(entry.skills)) throw new Error('BLOCKED_SKILL_DISCOVERY');
      for (const skill of entry.skills) {
        if (!isRecord(skill) || typeof skill.path !== 'string' || !isAbsolute(skill.path) || typeof skill.enabled !== 'boolean') throw new Error('BLOCKED_SKILL_DISCOVERY');
        skills.push({ path: skill.path, enabled: skill.enabled });
      }
    }
    if (skills.length > 500) throw new Error('BLOCKED_SKILL_DISCOVERY_LIMIT');
    const result: Inspection = { config: config.config, requirements: requirements.requirements, skills };
    if (includeAccount) { result.account = await connection.read('account/read', { refreshToken: false }); result.rateLimits = await connection.read('account/rateLimits/read'); }
    return result;
  } finally { connection.close(); }
}
export function extensionDisableOverrides(evidence: Inspection): string[] {
  if (!isRecord(evidence.config.mcp_servers)) throw new Error('BLOCKED_MCP_CONFIG_UNKNOWN');
  const names = Object.keys(evidence.config.mcp_servers);
  if (names.length > 128 || names.some(name => !/^[a-zA-Z0-9_-]{1,100}$/.test(name))) throw new Error('BLOCKED_MCP_ID_UNSUPPORTED');
  const paths = [...new Set(evidence.skills.map(skill => skill.path))];
  if (paths.some(path => !isAbsolute(path) || /[\r\n\0]/.test(path))) throw new Error('BLOCKED_SKILL_PATH');
  return [...names.map(name => `mcp_servers.${name}.enabled=false`), `skills.config=[${paths.map(path => `{path=${JSON.stringify(path)},enabled=false}`).join(',')}]`];
}
export function verifyIsolation(evidence: Inspection, recipeId = 'repo-book'): void {
  const config = evidence.config;
  const features = config.features;
  if (!isRecord(features) || isolatedFeatures.some(feature => features[feature] !== false)) throw new Error('BLOCKED_FEATURE_ISOLATION');
  if (!isRecord(config.mcp_servers) || Object.values(config.mcp_servers).some(server => !isRecord(server) || server.enabled !== false) || evidence.skills.some(skill => skill.enabled)) throw new Error('BLOCKED_EXTENSION_ISOLATION');
  if (config.forced_login_method !== 'chatgpt' || config.model_provider !== 'openai' || hasKeys(isRecord(config.model_providers) ? config.model_providers.openai : null) || config.openai_base_url !== null || config.chatgpt_base_url !== 'https://chatgpt.com/backend-api/') throw new Error('BLOCKED_PROVIDER_CONTEXT');
  if (config.approval_policy !== 'never' || config.sandbox_mode !== null || config.sandbox_workspace_write !== null || config.default_permissions !== permissionProfileName || !isRecord(config.permissions) || stable(config.permissions[permissionProfileName]) !== stable(permissionProfile(recipeId))) throw new Error('BLOCKED_SANDBOX_CONFIG');
  if (config.web_search !== 'disabled' || config.project_doc_max_bytes !== 0 || config.developer_instructions !== '' || config.allow_login_shell !== false || !Array.isArray(config.notify) || config.notify.length || !isRecord(config.shell_environment_policy) || config.shell_environment_policy.inherit !== 'none' || stable(config.shell_environment_policy.include_only) !== stable(['PATH', 'LANG', 'LC_ALL']) || !isRecord(config.shell_environment_policy.set) || config.shell_environment_policy.set.PATH !== '/usr/bin:/bin:/usr/sbin:/sbin' || config.shell_environment_policy.set.LANG !== 'C.UTF-8' || config.shell_environment_policy.set.LC_ALL !== 'C.UTF-8') throw new Error('BLOCKED_INHERITED_EXECUTION_CONFIG');
  if (config.model_instructions_file || config.experimental_compact_prompt_file || config.instructions) throw new Error('BLOCKED_CUSTOM_INSTRUCTIONS_OR_PERMISSIONS');
  // Managed requirements may add a mandatory tool/hook or change sandbox behavior; do not override them.
  if (evidence.requirements !== null) throw new Error('BLOCKED_MANAGED_REQUIREMENTS_REVIEW');
}
export function bindIdentity(evidence: Inspection, contextId: string): { identity: IdentityContext; workspaceId: string; memberHash: string } {
  if (!isRecord(evidence.account) || !isRecord(evidence.account.account) || evidence.account.account.type !== 'chatgpt' || typeof evidence.account.account.email !== 'string' || !evidence.account.account.email || evidence.account.requiresOpenaiAuth !== true || !isRecord(evidence.rateLimits) || typeof evidence.rateLimits.accountId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(evidence.rateLimits.accountId)) throw new Error('BLOCKED_AUTH_UNVERIFIED');
  const memberHash = hash(evidence.account.account.email);
  return { memberHash, identity: { authType: 'chatgpt', accountIdHash: hash(evidence.rateLimits.accountId), contextId: hash(JSON.stringify([contextId, memberHash])), verified: true }, workspaceId: evidence.rateLimits.accountId };
}
export function deriveQuotaMapping(evidence: Inspection, requiredBuckets: readonly string[]): QuotaMapping {
  const model = typeof evidence.config.model === 'string' ? evidence.config.model : null;
  const raw = evidence.rateLimits; const windows: QuotaMapping['windows'] = [];
  if (!model || !isRecord(raw) || !isRecord(raw.rateLimitsByLimitId) || !requiredBuckets.length) return { verified: false, model, windows };
  for (const id of requiredBuckets) {
    const bucket = raw.rateLimitsByLimitId[id];
    if (!isRecord(bucket) || (bucket.normalModelSlug !== model && id !== model) || (bucket.limitId !== null && bucket.limitId !== undefined && bucket.limitId !== id)) return { verified: false, model, windows: [] };
    const before = windows.length;
    for (const name of ['primary', 'secondary'] as const) if (isRecord(bucket[name])) windows.push({ limitId: id, name });
    if (windows.length === before) return { verified: false, model, windows: [] };
  }
  return { verified: windows.length > 0, model, windows };
}
export async function probeCodexSandbox(executable: string, cwd: string, overrides: string[], env: NodeJS.ProcessEnv, recipeId = 'repo-book'): Promise<boolean> {
  const workspace = join(cwd, 'sandbox-workspace'); await mkdir(workspace);
  const privatePath = join(cwd, 'private-probe.txt'); await writeFile(privatePath, 'synthetic sandbox probe');
  const testDirectory = join(workspace, 'project', 'tests', 'before-tibo'); await mkdir(testDirectory, { recursive: true });
  const baselinePath = join(workspace, 'project', 'baseline.txt'); await writeFile(baselinePath, 'protected synthetic baseline');
  const script = `const fs=require('node:fs'),net=require('node:net');let inside=false,outside=false,privateRead=false,baselineProtected=false,testWrite=false;try{fs.writeFileSync(process.argv[1],'probe');inside=true}catch{};try{fs.writeFileSync(process.argv[2],'probe')}catch(e){outside=['EPERM','EACCES'].includes(e.code)};try{fs.readFileSync(process.argv[3])}catch(e){privateRead=['EPERM','EACCES'].includes(e.code)};try{fs.writeFileSync(process.argv[4],'bad')}catch(e){baselineProtected=['EPERM','EACCES'].includes(e.code)};try{fs.writeFileSync(process.argv[5],'test');testWrite=true}catch{};const done=network=>{console.log(JSON.stringify({inside,outside,privateRead,baselineProtected,testWrite,network}));process.exit(0)};const socket=net.createConnection({host:'1.1.1.1',port:443});socket.on('connect',()=>{socket.destroy();done(false)});socket.on('error',e=>done(['EPERM','EACCES'].includes(e.code)));setTimeout(()=>{socket.destroy();done(false)},1500)`;
  const controls = overrides;
  const result = await executeProcess({ command: executable, args: ['sandbox', '--permission-profile', permissionProfileName, '--include-managed-config', ...cliOverrides(controls), '--cd', workspace, process.execPath, '-e', script, join(workspace, 'inside.txt'), join(cwd, 'outside.txt'), privatePath, baselinePath, join(testDirectory, 'probe.test.js')], cwd: workspace, env, timeoutMs: 8000, maxOutputBytes: 32_768 });
  if (result.exitCode !== 0 || result.outputTruncated || result.timedOut) return false;
  try { const value: unknown = JSON.parse(result.stdout.trim()); let outsideExists = true; try { await access(join(cwd, 'outside.txt')); } catch { outsideExists = false; } return isRecord(value) && value.inside === true && value.outside === true && value.privateRead === true && value.network === true && value.baselineProtected === true && value.testWrite === (recipeId === 'test-me-to-death') && !outsideExists; } catch { return false; }
}
export interface ExecutionConsent { ackSpendRisk: boolean; ackExecutionRisk: boolean }
export type PreparedExecutionOptions = Omit<ExecOptions, 'cwd' | 'prompt' | 'schemaPath' | 'resultPath' | 'timeoutMs' | 'signal' | 'validateCandidate'>;
export interface RealExecution {
  execution: PreparedExecutionOptions; identity: IdentityContext; configHash: string; mapping: QuotaMapping;
  observation: QuotaObservation; capabilities: CapabilityReport; sandbox: SandboxProbe;
  /** Re-run before every dispatch; no model, credentials copied, login, or account writes. */
  preDispatch(): Promise<string | null>;
}
export async function prepareRealExecution(config: RunConfig, consent: ExecutionConsent, executable = 'codex'): Promise<RealExecution> {
  if (config.billing.require_zero_incremental_charge) throw new Error('BLOCKED_NO_HARD_BILLING_GUARD');
  if (!consent.ackSpendRisk || !consent.ackExecutionRisk) throw new Error('BLOCKED_CONSENT_REQUIRED');
  if (['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_PROFILE'].some(key => Boolean(process.env[key]))) throw new Error('BLOCKED_AMBIENT_PROVIDER_CREDENTIALS');
  const [capabilities, sandbox] = await Promise.all([probeCodex(executable), probeSandbox()]);
  if (!supportedCapabilities(capabilities)) throw new Error('BLOCKED_UNSUPPORTED_CODEX_CAPABILITIES');
  if (!sandbox.available) throw new Error('BLOCKED_SANDBOX_UNAVAILABLE');
  const contextRoot = await realpath(process.env.CODEX_HOME ?? join(homedir(), '.codex'));
  const env = codexEnvironment();
  const root = await mkdtemp(join(tmpdir(), 'before-tibo-preflight-'));
  try {
    const base = isolationOverrides(config.recipe_id);
    const discovered = await inspect(executable, root, base, env, false);
    const overrides = [...base, ...extensionDisableOverrides(discovered)];
    const isolated = await inspect(executable, root, overrides, env, true); verifyIsolation(isolated, config.recipe_id);
    const contextId = hash(JSON.stringify([await realpath(contextRoot), executable, VERIFIED_PROTOCOL_VERSION, overrides]));
    const { identity, workspaceId, memberHash } = bindIdentity(isolated, contextId);
    overrides.push(`forced_chatgpt_workspace_id=${JSON.stringify(workspaceId)}`);
    const bound = await inspect(executable, root, overrides, env, true); verifyIsolation(bound, config.recipe_id);
    const rebound = bindIdentity(bound, contextId);
    if (rebound.workspaceId !== workspaceId || rebound.memberHash !== memberHash || bound.config.forced_chatgpt_workspace_id !== workspaceId) throw new Error('BLOCKED_IDENTITY_CHANGED');
    if (!await probeCodexSandbox(executable, root, overrides, env, config.recipe_id)) throw new Error('BLOCKED_CODEX_SANDBOX_PROBE');
    const model = typeof bound.config.model === 'string' && bound.config.model ? bound.config.model : undefined;
    const mapping = deriveQuotaMapping(bound, config.quota.required_buckets);
    let observation = normalizeQuota(bound.rateLimits, identity);
    if (config.mode === 'quota') {
      const decision = quotaGate({ snapshot: observation, workerIdentity: identity, mapping, reservePercent: config.quota.reserve_percent, staleMs: config.quota.stale_seconds * 1000 });
      if (!decision.dispatch) throw new Error(`BLOCKED_${decision.reason}`);
    }
    const configHash = executionConfigHash(bound);
    const verifyExecutionCwd = async (cwd: string): Promise<void> => {
      const current = await inspect(executable, await realpath(cwd), overrides, env, true); verifyIsolation(current, config.recipe_id);
      const currentBinding = bindIdentity(current, contextId);
      if (currentBinding.workspaceId !== workspaceId || currentBinding.memberHash !== memberHash || current.config.forced_chatgpt_workspace_id !== workspaceId) throw new Error('BLOCKED_IDENTITY_CHANGED');
      if (executionConfigHash(current) !== configHash) throw new Error('BLOCKED_EXECUTION_CONFIGURATION_CHANGED');
      if (config.mode === 'quota') {
        const next = normalizeQuota(current.rateLimits, identity);
        const decision = quotaGate({ snapshot: next, previous: observation, workerIdentity: identity, mapping, reservePercent: config.quota.reserve_percent, staleMs: config.quota.stale_seconds * 1000 });
        observation = next;
        if (!decision.dispatch) throw new Error(`BLOCKED_${decision.reason}`);
      }
    };
    const execution: PreparedExecutionOptions = { executable, capabilities, identity, sandboxVerified: true, extensionsDisabledVerified: true, ...consent, env, controlledConfig: overrides, verifyExecutionCwd, ...(model ? { model } : {}) };
    return { execution, identity, configHash, mapping, get observation() { return observation; }, capabilities, sandbox, preDispatch: async () => {
      const checkRoot = await mkdtemp(join(tmpdir(), 'before-tibo-context-check-'));
      try {
        const current = await inspect(executable, checkRoot, overrides, env, true); verifyIsolation(current, config.recipe_id);
        const currentBinding = bindIdentity(current, contextId);
        if (currentBinding.workspaceId !== workspaceId || currentBinding.memberHash !== memberHash || current.config.forced_chatgpt_workspace_id !== workspaceId) return 'identity_changed';
        if (executionConfigHash(current) !== configHash) return 'execution_configuration_changed';
        const next = normalizeQuota(current.rateLimits, identity);
        if (config.mode !== 'quota') { observation = next; return null; }
        const decision = quotaGate({ snapshot: next, previous: observation, workerIdentity: identity, mapping, reservePercent: config.quota.reserve_percent, staleMs: config.quota.stale_seconds * 1000 });
        observation = next; return decision.dispatch ? null : decision.reason;
      } catch { return 'execution_context_unavailable_or_changed'; }
      finally { await rm(checkRoot, { recursive: true, force: true }); }
    } };
  } finally { await rm(root, { recursive: true, force: true }); }
}

export interface IsolationDoctorReport { status: 'verified' | 'blocked'; reason: string; disabledSkills: number | null; disabledMcpServers: number | null; codexSandboxProbe: boolean; modelCalls: 0 }
export async function doctorExecutionContext(executable = 'codex', recipeId = 'repo-book'): Promise<IsolationDoctorReport> {
  const root = await mkdtemp(join(tmpdir(), 'before-tibo-context-doctor-'));
  const blocked = (reason: string): IsolationDoctorReport => ({ status: 'blocked', reason, disabledSkills: null, disabledMcpServers: null, codexSandboxProbe: false, modelCalls: 0 });
  try {
    const capabilities = await probeCodex(executable, root);
    if (!supportedCapabilities(capabilities)) return blocked('Unsupported Codex protocol version or required CLI capability');
    const env = codexEnvironment(); const base = isolationOverrides(recipeId);
    const discovered = await inspect(executable, root, base, env, false);
    const overrides = [...base, ...extensionDisableOverrides(discovered)];
    const isolated = await inspect(executable, root, overrides, env, false); verifyIsolation(isolated, recipeId);
    const probe = await probeCodexSandbox(executable, root, overrides, env, recipeId);
    if (!probe) return blocked('Codex sandbox runtime probe failed');
    return { status: 'verified', reason: 'Effective feature, MCP, skill and filesystem/network controls verified; account and model execution are separate checks.', disabledSkills: isolated.skills.length, disabledMcpServers: Object.keys(isolated.config.mcp_servers as object).length, codexSandboxProbe: true, modelCalls: 0 };
  } catch (error) { return blocked(error instanceof Error && /^BLOCKED_[A-Z_]+$/.test(error.message) ? error.message : 'Configuration metadata probe failed'); }
  finally { await rm(root, { recursive: true, force: true }); }
}
