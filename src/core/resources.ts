import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

/** src/core and packaged dist/core have the same depth. Never resolve from cwd. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function resourcePath(...segments: string[]): string {
  const resolved = resolve(packageRoot, ...segments);
  const within = relative(packageRoot, resolved);
  if (within === '..' || within.startsWith('../') || isAbsolute(within)) throw new Error('Resource path escapes package');
  return resolved;
}
export function readResourceJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resourcePath(relativePath), 'utf8')) as unknown;
}
