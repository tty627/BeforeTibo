import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { executeProcess } from '../sandbox/process.js';
import { assertSafeRelativePath, exclusionReason, isWithinRoot, resolveSafePath } from './paths.js';

export interface InputLimits { maxFiles: number; maxFileBytes: number; maxTotalBytes: number }
export const DEFAULT_INPUT_LIMITS: Readonly<InputLimits> = Object.freeze({ maxFiles: 2000, maxFileBytes: 2 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 });
export interface SourceFile { path: string; sha256: string; size_bytes: number }
export interface SourceManifest {
  schema_version: '1.0';
  source_commit: string;
  files: SourceFile[];
  excluded: Array<{ path: string; reason: string }>;
  total_bytes: number;
  coverage_complete: boolean;
  untracked_policy: 'not-read';
}
interface TreeFile { path: string; oid: string; size: number; executable: boolean }
export interface RepositoryInspection { source_commit: string; files: TreeFile[]; excluded: SourceManifest['excluded']; total_bytes: number; coverage_complete: boolean }

export class WorkspaceBlockedError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'WorkspaceBlockedError'; }
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function git(source: string, args: string[], maxOutputBytes = 8 * 1024 * 1024) {
  const result = await executeProcess({ command: 'git', args: ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.quotePath=false', ...args], cwd: source, timeoutMs: 30_000, maxOutputBytes, env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' } });
  if (result.exitCode !== 0 || result.timedOut || result.outputTruncated) throw new WorkspaceBlockedError('BLOCKED_GIT', 'Git inspection failed or exceeded its bounded output/time limit');
  return result.stdout;
}

function inputLimits(partial: Partial<InputLimits> = {}): InputLimits {
  const limits = { ...DEFAULT_INPUT_LIMITS, ...partial };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0 || value > DEFAULT_INPUT_LIMITS[key as keyof InputLimits]) throw new WorkspaceBlockedError('BLOCKED_INPUT_LIMIT', 'Input limits must be positive integers within the documented maximum');
  return limits;
}

export async function inspectRepository(source: string, partialLimits?: Partial<InputLimits>): Promise<RepositoryInspection> {
  const limits = inputLimits(partialLimits);
  const root = await realpath(source);
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  if (await realpath(top) !== root) throw new WorkspaceBlockedError('BLOCKED_REPOSITORY_ROOT', 'Select the repository root, not a subdirectory');
  let commit: string;
  try { commit = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim(); }
  catch { throw new WorkspaceBlockedError('BLOCKED_NO_COMMIT', 'The repository needs an existing HEAD commit'); }
  if (!/^[a-f0-9]{40,64}$/u.test(commit)) throw new WorkspaceBlockedError('BLOCKED_GIT', 'Invalid commit identity');
  if ((await git(root, ['status', '--porcelain=v1', '--untracked-files=no', '--ignore-submodules=none'])).length) throw new WorkspaceBlockedError('BLOCKED_TRACKED_DIRTY', 'Tracked changes must be resolved by the user before execution');
  const tree = (await git(root, ['ls-tree', '-r', '-l', '-z', '--full-tree', commit])).split('\0').filter(Boolean);
  const files: TreeFile[] = [];
  const excluded: SourceManifest['excluded'] = [];
  let totalBytes = 0;
  let complete = true;
  for (const entry of tree) {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40,64}) +([\d-]+)\t(.+)$/u.exec(entry);
    if (!match) throw new WorkspaceBlockedError('BLOCKED_TREE_ENTRY', 'Unsupported Git tree entry');
    const mode = match[1]!; const kind = match[2]!; const oid = match[3]!; const bytes = match[4]!; const relative = match[5]!;
    assertSafeRelativePath(relative);
    if (kind !== 'blob' || (mode !== '100644' && mode !== '100755')) throw new WorkspaceBlockedError('BLOCKED_SPECIAL_FILE', 'Submodules, symbolic links and special files are unsupported');
    const reason = exclusionReason(relative);
    if (reason) { excluded.push({ path: relative, reason }); continue; }
    const size = Number(bytes);
    if (!Number.isSafeInteger(size) || size < 0) throw new WorkspaceBlockedError('BLOCKED_TREE_ENTRY', 'Invalid blob size');
    let limitReason: string | null = null;
    if (size > limits.maxFileBytes) limitReason = 'single file size limit';
    else if (files.length >= limits.maxFiles) limitReason = 'file count limit';
    else if (totalBytes + size > limits.maxTotalBytes) limitReason = 'total input size limit';
    if (limitReason) { complete = false; excluded.push({ path: relative, reason: limitReason }); continue; }
    files.push({ path: relative, oid, size, executable: mode === '100755' });
    totalBytes += size;
  }
  return { source_commit: commit, files, excluded, total_bytes: totalBytes, coverage_complete: complete };
}

function excludedContent(text: string): string | null {
  if (text.includes('\0') || text.includes('\uFFFD')) return 'binary or invalid UTF-8 content';
  if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u.test(text) || /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})\b/u.test(text)) return 'potential credential content';
  return null;
}

/** Snapshot bytes come only from filtered Git blobs, never from untracked working files. */
export async function createSnapshot(options: { source: string; destination: string; limits?: Partial<InputLimits> }): Promise<SourceManifest> {
  const sourceRoot = await realpath(options.source);
  const destination = path.resolve(options.destination);
  const destinationParent = await realpath(path.dirname(destination));
  if (isWithinRoot(sourceRoot, path.join(destinationParent, path.basename(destination)))) throw new WorkspaceBlockedError('BLOCKED_SNAPSHOT_LOCATION', 'Snapshot must be outside the source repository');
  const inspection = await inspectRepository(sourceRoot, options.limits);
  await mkdir(destination, { mode: 0o700 }); // Exclusive creation prevents overwriting unrelated data.
  const manifest: SourceManifest = { schema_version: '1.0', source_commit: inspection.source_commit, files: [], excluded: [...inspection.excluded], total_bytes: 0, coverage_complete: inspection.coverage_complete, untracked_policy: 'not-read' };
  try {
    for (const file of inspection.files) {
      const text = await git(sourceRoot, ['cat-file', 'blob', file.oid], Math.max(1, file.size + 1));
      const reason = excludedContent(text);
      if (reason) { manifest.excluded.push({ path: file.path, reason }); continue; }
      const bytes = Buffer.from(text, 'utf8');
      if (bytes.length !== file.size) { manifest.excluded.push({ path: file.path, reason: 'non UTF-8 blob' }); continue; }
      const target = await resolveSafePath(destination, file.path);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 });
      manifest.files.push({ path: file.path, sha256: digest(bytes), size_bytes: bytes.length });
      manifest.total_bytes += bytes.length;
    }
    // Recheck HEAD and tracked changes after object reads, refusing a moving baseline.
    if ((await git(sourceRoot, ['rev-parse', 'HEAD'])).trim() !== manifest.source_commit || (await git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=no', '--ignore-submodules=none'])).length) throw new WorkspaceBlockedError('BLOCKED_SOURCE_CHANGED', 'Source baseline changed while creating the snapshot');
    return manifest;
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}

async function readRegularFile(root: string, relative: string): Promise<Buffer> {
  const file = await resolveSafePath(root, relative, { mustExist: true });
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > DEFAULT_INPUT_LIMITS.maxFileBytes) throw new WorkspaceBlockedError('BLOCKED_SPECIAL_FILE', 'Expected a bounded regular file without hard links');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) throw new WorkspaceBlockedError('BLOCKED_FILE_CHANGED', 'File changed during verification');
    return bytes;
  } finally { await handle.close(); }
}

export async function captureProtectedFiles(root: string, relativePaths: readonly string[]): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for (const relative of [...new Set(relativePaths)].sort()) {
    const bytes = await readRegularFile(root, relative);
    files.push({ path: relative, sha256: digest(bytes), size_bytes: bytes.length });
  }
  return files;
}

export async function verifyProtectedFiles(root: string, manifest: Pick<SourceManifest, 'files'> | readonly SourceFile[]): Promise<{ passed: boolean; changed: string[] }> {
  const expected = Array.isArray(manifest) ? manifest : (manifest as Pick<SourceManifest, 'files'>).files;
  const changed: string[] = [];
  for (const file of expected) {
    try {
      const bytes = await readRegularFile(root, file.path);
      if (bytes.length !== file.size_bytes || digest(bytes) !== file.sha256) changed.push(file.path);
    } catch { changed.push(file.path); }
  }
  return { passed: changed.length === 0, changed };
}

/** Inspect every candidate entry; directory symlinks are never traversed. */
export async function listSafeFiles(root: string, limits: Partial<InputLimits> = {}): Promise<string[]> {
  const bounds = inputLimits(limits);
  const files: string[] = [];
  let bytes = 0;
  const visit = async (relative: string): Promise<void> => {
    const directory = relative ? await resolveSafePath(root, relative, { mustExist: true }) : await realpath(root);
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      assertSafeRelativePath(name);
      if (item.isSymbolicLink()) throw new WorkspaceBlockedError('BLOCKED_SPECIAL_FILE', 'Candidate contains a symbolic link');
      if (item.isDirectory()) { await visit(name); continue; }
      if (!item.isFile()) throw new WorkspaceBlockedError('BLOCKED_SPECIAL_FILE', 'Candidate contains a special file');
      const metadata = await lstat(await resolveSafePath(root, name, { mustExist: true }));
      if (metadata.nlink !== 1 || metadata.size > bounds.maxFileBytes || files.length >= bounds.maxFiles || bytes + metadata.size > bounds.maxTotalBytes) throw new WorkspaceBlockedError('BLOCKED_INPUT_LIMIT', 'Candidate exceeds file, link, or byte limits');
      files.push(name); bytes += metadata.size;
    }
  };
  await visit('');
  return files.sort();
}

/** Freeze a stopped candidate into an exclusive stable copy before execution or promotion. */
export async function copyStableCandidate(source: string, destination: string, allowedPaths: readonly string[]): Promise<SourceFile[]> {
  const actual = await listSafeFiles(source);
  const allowed = new Set(allowedPaths.map(assertSafeRelativePath));
  if (actual.some((file) => !allowed.has(file))) throw new WorkspaceBlockedError('BLOCKED_OUTPUT_SCOPE', 'Candidate contains undeclared output files');
  const expected = await captureProtectedFiles(source, actual);
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const file of expected) {
      const bytes = await readRegularFile(source, file.path);
      if (digest(bytes) !== file.sha256) throw new WorkspaceBlockedError('BLOCKED_FILE_CHANGED', 'Candidate changed while copying');
      const output = await resolveSafePath(destination, file.path);
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await writeFile(output, bytes, { flag: 'wx', mode: 0o400 });
    }
    return expected;
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}

/** Store runner-owned source metadata outside the worker's writable directory. */
export async function saveSourceManifest(filename: string, manifest: SourceManifest): Promise<void> {
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(temporary, filename);
  await chmod(filename, 0o400);
}
