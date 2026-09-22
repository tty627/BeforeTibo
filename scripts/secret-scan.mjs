import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';
const git=(args)=>{const p=spawnSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});if(p.status!==0)throw new Error(p.stderr);return p.stdout;};
const files=git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
const stagedFiles=git(['ls-files','--cached','-z']).split('\0').filter(Boolean);
const forbidden=/(?:^|\/)(?:auth\.json|\.env(?:\..*)?|node_modules|\.before-tibo|\.local|journal\.jsonl)(?:\/|$)/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/,/\bAKIA[A-Z0-9]{16}\b/];
const findings=[];
for(const file of files){if(forbidden.test(file)){findings.push(file+': forbidden filename');continue;}if(['.png','.jpg','.woff','.ico'].includes(extname(file)))continue;const text=await readFile(file,'utf8');if(patterns.some(p=>p.test(text)))findings.push(file+': secret pattern');}
for(const file of stagedFiles){if(forbidden.test(file)){findings.push(file+': forbidden staged filename');continue;}const staged=git(['show',`:${file}`]);if(patterns.some(p=>p.test(staged)))findings.push(file+': staged secret pattern');}
const commits=spawnSync('git',['rev-list','--all'],{encoding:'utf8'});
if(commits.status!==0)throw new Error('Cannot inspect Git history');
for(const rev of commits.stdout.trim().split('\n').filter(Boolean)){const content=git(['show','--format=','--no-ext-diff',rev]);if(patterns.some(p=>p.test(content)))findings.push(rev+': history secret pattern');}
if(findings.length){process.stderr.write(findings.join('\n')+'\n');process.exitCode=1;}else process.stdout.write(`PASS: ${files.length} candidate files, ${stagedFiles.length} staged files and ${commits.stdout.trim()?commits.stdout.trim().split('\n').length:0} commits scanned. Heuristic scanner; manual diff review also required.\n`);
