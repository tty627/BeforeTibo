import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeProcess, type ProcessOptions, type ProcessResult } from './process.js';
import { isWithinRoot } from '../workspace/paths.js';
export * from './process.js';

export interface SandboxProbe {
  backend: 'macos-seatbelt' | 'unavailable';
  available: boolean;
  outside_write_denied: boolean;
  external_network_denied: boolean;
  private_read_denied: boolean;
  inside_write_allowed: boolean;
  unix_socket_allowed?: boolean;
  reason: string;
  checked_at: string;
}
export interface SandboxedProcessOptions extends ProcessOptions {
  writableRoots: readonly string[];
  readableRoots?: readonly string[];
  /** Local IPC only, scoped to the runner-approved writable roots. TCP remains denied. */
  allowUnixSockets?: boolean;
  /** Fixed Chromium/Crashpad IPC namespaces; never grants general Mach registration. */
  allowBrowserIPC?: boolean;
}
export class SandboxUnavailableError extends Error {
  readonly code = 'BLOCKED_SANDBOX_UNAVAILABLE';
  constructor(message: string) { super(message); this.name = 'SandboxUnavailableError'; }
}

// Every interpolated value is a JSON string literal, which also safely quotes Seatbelt strings.
const literal = (value: string) => JSON.stringify(value);
async function sandboxArguments(options: SandboxedProcessOptions): Promise<{ args: string[]; environment: NodeJS.ProcessEnv }> {
  const cwd = await realpath(options.cwd);
  const executable = await realpath(options.command);
  const writable = await Promise.all(options.writableRoots.map((root) => realpath(root)));
  const readable = await Promise.all((options.readableRoots ?? []).map((root) => realpath(root)));
  if (writable.some((root) => root === '/' || root === os.homedir())) throw new SandboxUnavailableError('Broad writable roots are forbidden');
  const runtimeDirectories = ['/System', '/usr', '/bin', '/sbin', '/Library/Apple', '/private/var/db/dyld', '/opt/homebrew/lib', '/opt/homebrew/opt', '/opt/homebrew/Cellar', path.dirname(executable)];
  const readClauses = [...new Set([...runtimeDirectories, cwd, ...readable, ...writable])].map((root) => `(subpath ${literal(root)})`).join(' ');
  const writeClauses = writable.map((root) => `(subpath ${literal(root)})`).join(' ');
  const profile = [
    '(version 1)', '(deny default)',
    '(allow process-exec process-fork)', '(allow signal (target same-sandbox))', '(allow process-info* (target same-sandbox))', '(allow sysctl-read)', '(allow mach-lookup)',
    '(allow ipc-posix-sem)', '(allow iokit-open (iokit-registry-entry-class "RootDomainUserClient"))',
    ...(options.allowBrowserIPC ? ['(allow mach-register (global-name-prefix "com.google.chrome.for.testing.MachPortRendezvousServer."))', '(allow mach-register (global-name-prefix "org.chromium.crashpad.child_port_handshake."))'] : []),
    // Socket construction alone does not authorize bind/connect. IP networking remains denied.
    '(allow system-socket (socket-domain AF_INET))', '(allow system-socket (socket-domain AF_INET6))',
    '(allow file-read-metadata)',
    `(allow file-read* ${readClauses} (literal "/") (literal "/private/etc/hosts") (literal "/private/etc/services") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))`,
    ...(writable.length ? [`(allow file-write* ${writeClauses} (literal "/dev/null"))`] : ['(allow file-write* (literal "/dev/null"))']),
    // Closed-by-default network policy; explicit Unix IPC never allows IP endpoints.
    ...(options.allowUnixSockets ? ['(allow system-socket (socket-domain AF_UNIX))', ...writable.flatMap((root) => [`(allow network-bind (local unix-socket (subpath ${literal(root)})))`, `(allow network-outbound (remote unix-socket (subpath ${literal(root)})))`])] : []),
  ].join('\n');
  return { args: ['-p', profile, executable, ...options.args], environment: { ...options.env, HOME: cwd, TMPDIR: writable[0] ?? cwd } };
}

async function invokeSandbox(options: SandboxedProcessOptions): Promise<ProcessResult> {
  const prepared = await sandboxArguments(options);
  return executeProcess({ ...options, command: '/usr/bin/sandbox-exec', args: prepared.args, env: prepared.environment });
}

/** Probe actual denials, not merely the existence of a binary or advertised flag. */
export async function probeSandbox(options: { allowUnixSockets?: boolean; allowBrowserIPC?: boolean } = {}): Promise<SandboxProbe> {
  const unavailable = (reason: string): SandboxProbe => ({ backend: 'unavailable', available: false, outside_write_denied: false, external_network_denied: false, private_read_denied: false, inside_write_allowed: false, reason, checked_at: new Date().toISOString() });
  if (process.platform !== 'darwin') return unavailable('No verified sandbox backend is implemented on this platform; untrusted execution is blocked');
  try { await access('/usr/bin/sandbox-exec', constants.X_OK); } catch { return unavailable('macOS sandbox-exec is unavailable'); }
  const root = await mkdtemp(path.join(os.tmpdir(), 'before-tibo-probe-'));
  const workspace = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  await mkdir(workspace); await mkdir(outside);
  await writeFile(path.join(outside, 'private.txt'), 'synthetic probe data');
  const probeScript = `
    const fs = require('node:fs'); const net = require('node:net');
    let inside=false, outside=false, privateRead=false;
    try { fs.writeFileSync(process.argv[1], 'probe'); inside=true; } catch {}
    try { fs.writeFileSync(process.argv[2], 'probe'); } catch(e) { outside=['EACCES','EPERM'].includes(e.code); }
    try { fs.readFileSync(process.argv[3]); } catch(e) { privateRead=['EACCES','EPERM'].includes(e.code); }
    const done=(network)=>{ const finish=(unixSocket)=>{console.log(JSON.stringify({inside,outside,privateRead,network,unixSocket}));process.exit(0)}; if(process.argv[4]!=='yes')return finish(false); const server=net.createServer();server.on('error',()=>finish(false));server.listen(process.argv[5],()=>server.close(()=>finish(true))); };
    const socket=net.createConnection({host:'1.1.1.1',port:443});
    socket.on('connect',()=>{socket.destroy();done(false);});
    socket.on('error',(e)=>done(['EACCES','EPERM'].includes(e.code)));
    setTimeout(()=>{socket.destroy();done(false);},1500);
  `;
  try {
    const result = await invokeSandbox({ command: process.execPath, args: ['-e', probeScript, path.join(workspace, 'inside.txt'), path.join(outside, 'forbidden.txt'), path.join(outside, 'private.txt'), options.allowUnixSockets ? 'yes' : 'no', path.join(workspace, 's')], cwd: workspace, writableRoots: [workspace], allowUnixSockets: options.allowUnixSockets, allowBrowserIPC: options.allowBrowserIPC, timeoutMs: 5000, maxOutputBytes: 16_384 });
    if (result.exitCode !== 0 || result.timedOut || result.outputTruncated) return unavailable('Sandbox probe process could not complete; untrusted execution is blocked');
    const checks: unknown = JSON.parse(result.stdout.trim());
    if (typeof checks !== 'object' || !checks) return unavailable('Malformed sandbox probe result');
    const values = checks as Record<string, unknown>;
    const inside = values.inside === true && await readFile(path.join(workspace, 'inside.txt'), 'utf8') === 'probe';
    let outsideMissing = false;
    try { await access(path.join(outside, 'forbidden.txt')); } catch { outsideMissing = true; }
    const outsideDenied = values.outside === true && outsideMissing;
    const network = values.network === true;
    const privateRead = values.privateRead === true;
    const unixOkay = !options.allowUnixSockets || values.unixSocket === true;
    return { backend: 'macos-seatbelt', available: inside && outsideDenied && network && privateRead && unixOkay, outside_write_denied: outsideDenied, external_network_denied: network, private_read_denied: privateRead, inside_write_allowed: inside, ...(options.allowUnixSockets ? { unix_socket_allowed: values.unixSocket === true } : {}), reason: inside && outsideDenied && network && privateRead && unixOkay ? 'Actual write, private-read and external-network probes passed' : 'One or more sandbox protections failed; untrusted execution is blocked', checked_at: new Date().toISOString() };
  } catch { return unavailable('Sandbox probe failed; untrusted execution is blocked'); }
  finally { await rm(root, { recursive: true, force: true }); }
}

/** Executing validators cannot bypass the same process boundary used for generated tools. */
export async function executeSandboxed(options: SandboxedProcessOptions): Promise<ProcessResult> {
  const probe = await probeSandbox({ allowUnixSockets: options.allowUnixSockets, allowBrowserIPC: options.allowBrowserIPC });
  if (!probe.available) throw new SandboxUnavailableError(probe.reason);
  // Prevent a writable parent from granting write permission over an independently protected input.
  const cwd = await realpath(options.cwd);
  for (const root of options.writableRoots) {
    const actual = await realpath(root);
    if (!isWithinRoot(cwd, actual)) throw new SandboxUnavailableError('Writable paths must be scoped inside the isolated execution directory');
  }
  return invokeSandbox(options);
}
