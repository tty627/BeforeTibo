import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = await mkdtemp(join(tmpdir(), 'before-tibo-pack-'));
function command(cmd,args,cwd=process.cwd(),env=process.env) { const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:120_000,env});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout; }
try {
 const packed=JSON.parse(command('npm',['pack','--json','--pack-destination',root]))[0];
 const packageFiles=new Set(packed.files.map(file=>file.path));
 for(const f of packed.files)assert.ok(!/(?:^|\/)(?:node_modules|\.before-tibo|\.local|auth\.json|\.env|journal\.jsonl|runs)(?:\/|$)/.test(f.path),f.path);
 for(const needed of ['dist/cli.js','contracts/recipe.schema.json','recipes/repo-book/SKILL.md','recipes/test-me-to-death/recipe.json','recipes/toolsmith-csv/recipe.json','templates/csv-diff/index.html'])assert.ok(packed.files.some(f=>f.path===needed),needed);
 // Verify local Markdown links and image paths in the package, not just in this checkout.
 for(const file of packed.files.filter(file=>file.path.endsWith('.md'))){
   const markdown=await readFile(file.path,'utf8');
   const links=[...markdown.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)].map(match=>match[1]??match[2]);
   const htmlAssets=[...markdown.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match=>match[1]);
   for(const reference of [...links,...htmlAssets]){
     if(!reference||reference.startsWith('#')||/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference))continue;
     const relative=decodeURIComponent(reference.split(/[?#]/)[0]);if(!relative)continue;
     const destination=posix.normalize(posix.join(posix.dirname(file.path),relative));
     assert.ok(!relative.startsWith('/')&&!destination.startsWith('../')&&packageFiles.has(destination),`${file.path}: linked asset missing from package: ${reference}`);
   }
 }
 // npm ci caches tarballs but may not cache the metadata needed for a fresh install.
 // Installation may reach the registry; the installed demo and harvest must remain offline.
 command('npm',['install','--ignore-scripts','--prefer-offline','--no-audit','--no-fund','--registry=https://registry.npmjs.org',join(root,packed.filename)],root);
 const cli=join(root,'node_modules','before-tibo','dist','cli.js');assert.equal(command(process.execPath,[cli,'--version'],root).trim(),'0.1.0-alpha.1');
 const metadata=JSON.parse(await readFile(join(root,'node_modules','before-tibo','package.json'),'utf8'));
 assert.equal(metadata.license,'MIT');assert.equal(metadata.repository.url,'git+https://github.com/tty627/BeforeTibo.git');
 assert.equal(metadata.homepage,'https://github.com/tty627/BeforeTibo#readme');assert.equal(metadata.bugs.url,'https://github.com/tty627/BeforeTibo/issues');
 assert.equal(command(join(root,'node_modules','.bin','before-tibo'),['--version'],root).trim(),'0.1.0-alpha.1');
 assert.equal(JSON.parse(command(process.execPath,[cli,'recipes','list','--json'],root)).length,3);
 const offlineEnvironment={PATH:'/nonexistent',HOME:root};
 const demo=JSON.parse(command(process.execPath,[cli,'demo','--state-dir',join(root,'state'),'--json'],root,offlineEnvironment));assert.equal(demo.status,'COMPLETED');
 const receipt=JSON.parse(await readFile(join(demo.runDir,'harvest','receipt.json'),'utf8'));assert.equal(receipt.artifacts.length,1);
 const harvest=JSON.parse(command(process.execPath,[cli,'harvest',demo.runId,'--state-dir',join(root,'state'),'--json'],root,offlineEnvironment));assert.equal(harvest.model_calls,0);
 process.stdout.write(`PASS: ${packed.filename} installed and ran outside source (${packed.files.length} files)\n`);
} finally {await rm(root,{recursive:true,force:true});}
