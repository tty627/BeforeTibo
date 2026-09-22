import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export class UnsafePathError extends Error {
  constructor(message: string) { super(message); this.name = 'UnsafePathError'; }
}

/** Paths in contracts are portable, literal POSIX paths, never URL-encoded paths. */
export function assertSafeRelativePath(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 512 ||
      /[\x00-\x1f\x7f\\:%]/u.test(value) || path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) || value.split('/').some((part) => !part || part === '.' || part === '..') ||
      value.normalize('NFC') !== value) {
    throw new UnsafePathError('Expected a literal, normalized relative path without traversal or encoding');
  }
  return value;
}

export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/** Reject every symlink component, including an existing final path. */
export async function resolveSafePath(root: string, relative: string, options: { mustExist?: boolean } = {}): Promise<string> {
  assertSafeRelativePath(relative);
  const canonicalRoot = await realpath(root);
  if (!(await lstat(canonicalRoot)).isDirectory()) throw new UnsafePathError('Path root must be a directory');
  const parts = relative.split('/');
  let candidate = canonicalRoot;
  for (const [index, part] of parts.entries()) {
    candidate = path.join(candidate, part);
    try {
      const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink()) throw new UnsafePathError('Symbolic links are not permitted');
      if (index < parts.length - 1 && !metadata.isDirectory()) throw new UnsafePathError('Non-directory path component');
      if (!isWithinRoot(canonicalRoot, await realpath(candidate))) throw new UnsafePathError('Path escapes allowed root');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || options.mustExist) throw error;
      // The remaining components do not yet exist; the nearest ancestor was checked above.
      return path.join(candidate, ...parts.slice(index + 1));
    }
  }
  if (!isWithinRoot(canonicalRoot, candidate)) throw new UnsafePathError('Path escapes allowed root');
  return candidate;
}

const excludedDirectories = new Set([
  '.git', '.codex', '.agents', '.claude', '.cursor', '.ssh', '.aws', '.azure', '.gcloud',
  '.config', '.npm', '.pnpm-store', 'node_modules', 'vendor', 'dist', 'build', 'coverage',
  '.cache', '.next', '.nuxt', '.turbo', '.before-tibo', 'before-tibo-runs', 'runs', 'hooks',
]);

export function exclusionReason(relative: string): string | null {
  assertSafeRelativePath(relative);
  const parts = relative.toLowerCase().split('/');
  const filename = parts.at(-1)!;
  if (parts.some((part) => excludedDirectories.has(part))) return 'excluded directory or control plane';
  if (/^(?:agents|claude|gemini)\.md$/u.test(filename) || /^(?:\.mcp\.json|mcp\.json|\.cursorrules|\.npmrc|\.netrc|\.gitmodules|\.gitattributes)$/u.test(filename)) return 'automatically loaded configuration';
  if (/^(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|cookies?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/u.test(filename)) return 'sensitive filename';
  if (/\.(?:pem|key|p12|pfx|keystore|jks|crt|cer)$/u.test(filename) || /(?:^|[._-])(?:secrets?|tokens?)(?:[._-]|$)/u.test(filename)) return 'potential secret or key material';
  return null;
}

export function isExcludedPath(relative: string): boolean { return exclusionReason(relative) !== null; }
