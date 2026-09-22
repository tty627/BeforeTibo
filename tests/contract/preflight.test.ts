import { describe, expect, it } from 'vitest';
import { bindIdentity, deriveQuotaMapping, executionConfigHash, extensionDisableOverrides, isolatedFeatures, isolationOverrides, permissionProfile, permissionProfileName, prepareRealExecution, verifyIsolation, type Inspection } from '../../src/adapters/codex/preflight.js';
import { defaults } from '../../src/core/config.js';
function safe(recipeId = 'repo-book'): Inspection {
  return {
    config: {
      features: Object.fromEntries(isolatedFeatures.map(feature => [feature, false])), mcp_servers: { synthetic: { enabled: false, command: 'unused' } },
      forced_login_method: 'chatgpt', model_provider: 'openai', model_providers: {}, openai_base_url: null, chatgpt_base_url: 'https://chatgpt.com/backend-api/',
      approval_policy: 'never', sandbox_mode: null, sandbox_workspace_write: null, default_permissions: permissionProfileName, permissions: { [permissionProfileName]: permissionProfile(recipeId) },
      web_search: 'disabled', project_doc_max_bytes: 0, developer_instructions: '', allow_login_shell: false, notify: [],
      shell_environment_policy: { inherit: 'none', include_only: ['PATH', 'LANG', 'LC_ALL'], set: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }, model: 'synthetic-model',
    },
    requirements: null, skills: [{ path: '/synthetic/skills/example/SKILL.md', enabled: false }],
    account: { account: { type: 'chatgpt', email: 'synthetic@example.invalid', planType: 'unknown' }, requiresOpenaiAuth: true },
    rateLimits: { accountId: '11111111-1111-1111-1111-111111111111', rateLimitsByLimitId: { synthetic: { limitId: 'synthetic', normalModelSlug: 'synthetic-model', primary: { usedPercent: 50, windowDurationMins: 60, resetsAt: 1999999999 } } } },
  };
}
describe('AC-22 AC-28 preflight effective configuration checks', () => {
  it.each(['repo-book', 'test-me-to-death', 'toolsmith-csv'])('permits fully verified controls for %s', recipe => { expect(() => verifyIsolation(safe(recipe), recipe)).not.toThrow(); });
  it('requires real invocation consent before any capability or account probe', async () => { await expect(prepareRealExecution(defaults('/synthetic'), { ackSpendRisk: false, ackExecutionRisk: true }, 'missing-cli')).rejects.toThrow('BLOCKED_CONSENT_REQUIRED'); });
  it('rejects a zero-charge demand before any capability or account probe', async () => { const config = defaults('/synthetic'); config.billing.require_zero_incremental_charge = true; await expect(prepareRealExecution(config, { ackSpendRisk: true, ackExecutionRisk: true }, 'missing-cli')).rejects.toThrow('BLOCKED_NO_HARD_BILLING_GUARD'); });
  it.each(isolatedFeatures)('requires effective %s=false', feature => { const evidence = safe(); (evidence.config.features as Record<string, unknown>)[feature] = true; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_FEATURE_ISOLATION'); });
  it('checks MCP entries rather than assuming an empty override clears inherited servers', () => { const evidence = safe(); evidence.config.mcp_servers = { synthetic: { command: 'unused' } }; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_EXTENSION_ISOLATION'); });
  it('checks enabled skills rather than trusting skip_host_skill_discovery', () => { const evidence = safe(); evidence.skills[0]!.enabled = true; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_EXTENSION_ISOLATION'); });
  it('generates explicit disables for actual discovered servers and skill paths', () => { const controls = extensionDisableOverrides(safe()); expect(controls).toContain('mcp_servers.synthetic.enabled=false'); expect(controls.some(value => value.startsWith('skills.config=') && value.includes('enabled=false'))).toBe(true); expect(controls).not.toContain('mcp_servers={}'); });
  it('rejects MCP keys whose dotted override semantics were not verified', () => { const evidence = safe(); evidence.config.mcp_servers = { 'unsafe.name': { enabled: true } }; expect(() => extensionDisableOverrides(evidence)).toThrow('BLOCKED_MCP_ID_UNSUPPORTED'); });
  it.each([['forced_login_method', 'api'], ['model_provider', 'custom'], ['openai_base_url', 'https://example.invalid/v1'], ['chatgpt_base_url', 'https://example.invalid']])('rejects unsupported provider setting %s', (key, value) => { const evidence = safe(); evidence.config[key] = value; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_PROVIDER_CONTEXT'); });
  it('rejects a custom provider hidden behind the openai provider name', () => { const evidence = safe(); evidence.config.model_providers = { openai: { base_url: 'https://example.invalid' } }; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_PROVIDER_CONTEXT'); });
  it('rejects legacy sandbox settings that would override a named permission profile', () => { const evidence = safe(); evidence.config.sandbox_mode = 'workspace-write'; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_SANDBOX_CONFIG'); });
  it('rejects an additional workspace root even if all expected profile rules remain', () => { const evidence = safe(); const profile = (evidence.config.permissions as Record<string, Record<string, unknown>>)[permissionProfileName]!; profile.workspace_roots = { '/': 'extra' }; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_SANDBOX_CONFIG'); });
  it('accepts protocol-normalized null defaults but rejects non-null profile escalation', () => { const evidence = safe(); const profile = (evidence.config.permissions as Record<string, Record<string, unknown>>)[permissionProfileName]!; profile.extends = null; profile.description = null; expect(() => verifyIsolation(evidence)).not.toThrow(); profile.extends = ':workspace'; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_SANDBOX_CONFIG'); });
  it('allows new tests only in the test recipe and preserves baseline read-only rules', () => {
    const repo = permissionProfile().filesystem as Record<string, unknown>; const tests = permissionProfile('test-me-to-death').filesystem as Record<string, unknown>;
    expect(repo[':workspace_roots']).toEqual({ '.': 'write', project: 'read' }); expect(tests[':workspace_roots']).toEqual({ '.': 'write', project: 'read', 'project/tests/before-tibo': 'write' });
  });
  it('does not mix named profiles with legacy sandbox controls', () => { const controls = isolationOverrides(); expect(controls.some(value => value.startsWith('sandbox_mode=') || value.startsWith('sandbox_workspace_write.'))).toBe(false); expect(controls).toContain(`default_permissions="${permissionProfileName}"`); });
  it('rejects inherited notification commands', () => { const evidence = safe(); evidence.config.notify = ['/synthetic/unapproved']; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_INHERITED_EXECUTION_CONFIG'); });
  it('filters even inherited shell set values through a fixed allowlist', () => { const evidence = safe(); const shell = evidence.config.shell_environment_policy as Record<string, unknown>; (shell.set as Record<string, unknown>).SYNTHETIC_SECRET = 'synthetic-only'; expect(() => verifyIsolation(evidence)).not.toThrow(); shell.include_only = ['PATH', 'LANG', 'LC_ALL', 'SYNTHETIC_SECRET']; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_INHERITED_EXECUTION_CONFIG'); });
  it('does not silently override organization requirements', () => { const evidence = safe(); evidence.requirements = { featureRequirements: { hooks: true } }; expect(() => verifyIsolation(evidence)).toThrow('BLOCKED_MANAGED_REQUIREMENTS_REVIEW'); });
  it('binds effective model, reasoning and price tier configuration without persisting it', () => {
    const evidence = safe(); const baseline = executionConfigHash(evidence);
    for (const [key, value] of [['model', 'another-model'], ['model_reasoning_effort', 'high'], ['service_tier', 'fast']]) { const changed = structuredClone(evidence); changed.config[key!] = value; expect(executionConfigHash(changed)).not.toBe(baseline); }
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
  });
});
describe('AC-60 account binding and AC-64 explicit quota mapping', () => {
  it('binds a backend workspace ID and member hash without exposing email or credentials', () => { const result = bindIdentity(safe(), 'context-synthetic'); expect(result.identity.verified).toBe(true); expect(result.identity.accountIdHash).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(result)).not.toContain('synthetic@example.invalid'); });
  it('rejects an unknown account, absent workspace identity or missing member identity', () => {
    const cases = [safe(), safe(), safe()]; cases[0]!.account = { account: { type: 'apiKey' }, requiresOpenaiAuth: true }; cases[1]!.rateLimits = { accountId: null }; cases[2]!.account = { account: { type: 'chatgpt', email: null }, requiresOpenaiAuth: true };
    for (const value of cases) expect(() => bindIdentity(value, 'context')).toThrow('BLOCKED_AUTH_UNVERIFIED');
  });
  it('changes persisted execution context even when users share the same workspace', () => { const before = safe(); const after = safe(); after.account = { account: { type: 'chatgpt', email: 'other@example.invalid' }, requiresOpenaiAuth: true }; expect(bindIdentity(before, 'same').memberHash).not.toBe(bindIdentity(after, 'same').memberHash); expect(bindIdentity(before, 'same').identity.contextId).not.toBe(bindIdentity(after, 'same').identity.contextId); });
  it('accepts a model mapping explicitly returned by backend metadata', () => { expect(deriveQuotaMapping(safe(), ['synthetic'])).toEqual({ verified: true, model: 'synthetic-model', windows: [{ limitId: 'synthetic', name: 'primary' }] }); });
  it('refuses to infer a generic codex bucket from an arbitrary model name', () => { const evidence = safe(); evidence.rateLimits = { rateLimitsByLimitId: { codex: { limitId: 'codex', primary: { usedPercent: 50 } } } }; expect(deriveQuotaMapping(evidence, ['codex']).verified).toBe(false); });
  it('does not map a missing model, missing bucket or empty window set', () => { const missing = safe(); missing.config.model = null; expect(deriveQuotaMapping(missing, ['synthetic']).verified).toBe(false); expect(deriveQuotaMapping(safe(), ['missing']).verified).toBe(false); const empty = safe(); empty.rateLimits = { rateLimitsByLimitId: { synthetic: { normalModelSlug: 'synthetic-model' } } }; expect(deriveQuotaMapping(empty, ['synthetic']).verified).toBe(false); });
  it('requires windows for every requested bucket, even when another bucket is complete', () => { const evidence = safe(); (evidence.rateLimits as { rateLimitsByLimitId: Record<string, unknown> }).rateLimitsByLimitId.empty = { normalModelSlug: 'synthetic-model' }; expect(deriveQuotaMapping(evidence, ['synthetic', 'empty']).verified).toBe(false); });
});
