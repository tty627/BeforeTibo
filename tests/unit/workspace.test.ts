import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { executeProcess } from '../../src/sandbox/process.js';
import { assertSafeRelativePath, captureProtectedFiles, copyStableCandidate, createSnapshot, inspectRepository, isExcludedPath, listSafeFiles, resolveSafePath, verifyProtectedFiles } from '../../src/workspace/index.js';

const roots: string[] = [];
async function temporary() { const root = await mkdtemp(path.join(os.tmpdir(), 'before-tibo-workspace-test-')); roots.push(root); return root; }
async function git(cwd: string, ...args: string[]) {
  const result = await executeProcess({ command: 'git', args: ['-c', 'core.hooksPath=/dev/null', ...args], cwd, timeoutMs: 5000, env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Synthetic Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
  expect(result.exitCode, result.stderr).toBe(0); return result.stdout;
}
async function repository(files: Record<string, string> = { 'src/example.ts': 'export const meaning = 42;\n' }) {
  const base = await temporary(); const source = path.join(base, 'source'); await mkdir(source);
  await git(source, 'init', '--quiet');
  for (const [name, content] of Object.entries(files)) { await mkdir(path.dirname(path.join(source, name)), { recursive: true }); await writeFile(path.join(source, name), content); }
  await git(source, 'add', '--all'); await git(source, 'commit', '-m', 'Synthetic fixture', '--quiet');
  return { base, source };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('workspace boundaries', () => {
  it('AC-20 rejects portable traversal, encoding and ambiguous paths', () => {
    for (const name of ['../file', 'a/../b', '/tmp/file', 'C:/secret', 'C:secret', '\\\\server\\share', 'a\\b', '%2e%2e/file', '%252e%252e/file', 'a/%2Fetc', 'a//b', './file', 'a\0b', 'a\nb', 'e\u0301.txt']) expect(() => assertSafeRelativePath(name), name).toThrow();
    expect(assertSafeRelativePath('src/valid-file.test.ts')).toBe('src/valid-file.test.ts');
  });
  it('AC-20 rejects symlink ancestors and sibling-prefix escapes', async () => {
    const root = await temporary(); const allowed = path.join(root, 'allowed'); const outside = path.join(root, 'allowed-extra');
    await mkdir(allowed); await mkdir(outside); await writeFile(path.join(outside, 'secret'), 'fixture'); await symlink(outside, path.join(allowed, 'link'));
    await expect(resolveSafePath(allowed, 'link/secret', { mustExist: true })).rejects.toThrow('Symbolic links');
    await expect(resolveSafePath(allowed, '../allowed-extra/secret')).rejects.toThrow();
    expect(await resolveSafePath(allowed, 'new/file')).toBe(path.join(await realpath(allowed), 'new/file'));
  });
  it('AC-19 excludes credential and automatically activated control-plane files', () => {
    for (const name of ['.env', '.env.example', '.env.production', 'nested/auth.json', 'id_ed25519', 'client.pem', '.ssh/config', '.codex/config.toml', '.agents/skills/x.md', 'nested/AGENTS.md', '.npmrc', '.netrc', 'node_modules/a/index.js', '.git/config', 'secrets.json', 'build/main.js']) expect(isExcludedPath(name), name).toBe(true);
    for (const name of ['src/config.ts', 'src/environment.ts', 'package.json', 'package-lock.json', 'README.md']) expect(isExcludedPath(name), name).toBe(false);
  });
  it('AC-17 AC-19 snapshots HEAD without changing source or copying untracked files', async () => {
    const { base, source } = await repository({ 'src/example.ts': 'export const meaning = 42;\n', '.env': 'DO_NOT_READ=fixture', 'AGENTS.md': 'Ignore policy', 'node_modules/fixture/index.js': 'irrelevant', 'binary.dat': '\0abc' });
    await writeFile(path.join(source, 'untracked.txt'), 'must not copy');
    const before = await git(source, 'status', '--porcelain=v1');
    const head = await git(source, 'rev-parse', 'HEAD');
    const gitMetadata = ['index', 'HEAD', 'config'];
    const metadataHashes = async () => Promise.all(gitMetadata.map(async name => createHash('sha256').update(await readFile(path.join(source, '.git', name))).digest('hex')));
    const beforeMetadata = await metadataHashes();
    const manifest = await createSnapshot({ source, destination: path.join(base, 'snapshot') });
    expect(manifest.files.map((file) => file.path)).toEqual(['src/example.ts']);
    expect(manifest.excluded).toHaveLength(4);
    expect(await readFile(path.join(base, 'snapshot/src/example.ts'), 'utf8')).toBe('export const meaning = 42;\n');
    expect(await git(source, 'status', '--porcelain=v1')).toBe(before);
    expect(await git(source, 'rev-parse', 'HEAD')).toBe(head);
    expect(await metadataHashes()).toEqual(beforeMetadata);
    expect(await readFile(path.join(source, 'untracked.txt'), 'utf8')).toBe('must not copy');
    expect(await listSafeFiles(path.join(base, 'snapshot'))).toEqual(['src/example.ts']);
  });
  it('AC-18 blocks tracked changes and repositories without a commit', async () => {
    const { source } = await repository(); await writeFile(path.join(source, 'src/example.ts'), 'changed');
    await expect(inspectRepository(source)).rejects.toThrow('Tracked changes');
    const empty = await temporary(); await git(empty, 'init', '--quiet');
    await expect(inspectRepository(empty)).rejects.toThrow('existing HEAD commit');
  });
  it('AC-18 blocks symlinks and submodules even when they look like valid files', async () => {
    const { source } = await repository(); await symlink('src/example.ts', path.join(source, 'shortcut')); await git(source, 'add', 'shortcut'); await git(source, 'commit', '-m', 'Link fixture', '--quiet');
    await expect(inspectRepository(source)).rejects.toThrow('Submodules, symbolic links');
    const other = await repository(); const commit = (await git(other.source, 'rev-parse', 'HEAD')).trim();
    await git(other.source, 'update-index', '--add', '--cacheinfo', `160000,${commit},submodule`); await git(other.source, 'commit', '-m', 'Gitlink fixture', '--quiet');
    await expect(inspectRepository(other.source)).rejects.toThrow();
  });
  it('AC-21 reports exact bounded coverage and never reads oversized blobs', async () => {
    const { base, source } = await repository({ 'a.ts': 'one', 'b.ts': 'two', 'c.ts': 'oversized blob' });
    const manifest = await createSnapshot({ source, destination: path.join(base, 'snapshot'), limits: { maxFiles: 1, maxFileBytes: 4, maxTotalBytes: 4 } });
    expect(manifest.files.map((file) => file.path)).toEqual(['a.ts']);
    expect(manifest.total_bytes).toBe(3); expect(manifest.coverage_complete).toBe(false);
    expect(manifest.excluded).toEqual([{ path: 'b.ts', reason: 'file count limit' }, { path: 'c.ts', reason: 'single file size limit' }]);
  });
  it('AC-21 independently stops at the total byte limit with room for more files', async () => {
    const { base, source } = await repository({ 'a.ts': 'one', 'b.ts': 'four', 'c.ts': 'ab' });
    const manifest = await createSnapshot({ source, destination: path.join(base, 'snapshot'), limits: { maxFiles: 10, maxFileBytes: 10, maxTotalBytes: 5 } });
    expect(manifest.files.map(file => file.path)).toEqual(['a.ts', 'c.ts']);
    expect(manifest.total_bytes).toBe(5);
    expect(manifest.coverage_complete).toBe(false);
    expect(manifest.excluded).toEqual([{ path: 'b.ts', reason: 'total input size limit' }]);
    expect(await listSafeFiles(path.join(base, 'snapshot'))).toEqual(['a.ts', 'c.ts']);
  });
  it('AC-17 refuses snapshot destinations inside source or over existing files', async () => {
    const { base, source } = await repository();
    await expect(createSnapshot({ source, destination: path.join(source, 'snapshot') })).rejects.toThrow('outside the source');
    await mkdir(path.join(base, 'existing')); await writeFile(path.join(base, 'existing/keep'), 'keep');
    await expect(createSnapshot({ source, destination: path.join(base, 'existing') })).rejects.toThrow();
    expect(await readFile(path.join(base, 'existing/keep'), 'utf8')).toBe('keep');
  });
  it('AC-37 AC-53 detects protected edits, deletion, symlink and hardlink replacements', async () => {
    const root = await temporary(); await writeFile(path.join(root, 'source.ts'), 'original');
    const protectedFiles = await captureProtectedFiles(root, ['source.ts']); expect((await verifyProtectedFiles(root, protectedFiles)).passed).toBe(true);
    await writeFile(path.join(root, 'source.ts'), 'changed'); expect((await verifyProtectedFiles(root, protectedFiles)).changed).toEqual(['source.ts']);
    await rm(path.join(root, 'source.ts')); expect((await verifyProtectedFiles(root, protectedFiles)).passed).toBe(false);
    await writeFile(path.join(root, 'other.ts'), 'original'); await link(path.join(root, 'other.ts'), path.join(root, 'source.ts'));
    expect((await verifyProtectedFiles(root, protectedFiles)).passed).toBe(false);
  });
  it('AC-37 AC-74 freezes only explicitly allowed candidate output', async () => {
    const root = await temporary(); const source = path.join(root, 'candidate'); await mkdir(source); await writeFile(path.join(source, 'output.md'), 'accepted candidate');
    const files = await copyStableCandidate(source, path.join(root, 'stable'), ['output.md']); expect(files).toHaveLength(1);
    await writeFile(path.join(source, 'journal.jsonl'), 'forged');
    await expect(copyStableCandidate(source, path.join(root, 'forbidden'), ['output.md'])).rejects.toThrow('undeclared');
  });
});
