import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(readFileSync(path.join(root,'MANIFEST.json'),'utf8'));
const actual=[];
function walk(dir,base='') {
  for (const name of readdirSync(dir).sort()) {
    const relative=base+name,target=path.join(dir,name),s=lstatSync(target);
    if (s.isSymbolicLink()) throw Error('Distribution symlink: '+relative);
    if (s.isDirectory()) walk(target,relative+'/');
    else if (s.isFile()) actual.push(relative);
    else throw Error('Distribution special file: '+relative);
  }
}
walk(root);
const expected=['MANIFEST.json',...manifest.files.map(f=>f.path)].sort();
if (JSON.stringify(actual.sort())!==JSON.stringify(expected)) throw Error('Distribution file inventory mismatch');
for (const f of manifest.files) {
  if (!f.path || f.path.startsWith('/') || f.path.includes('\\') || f.path.split('/').some(p=>!p||p==='.'||p==='..')) throw Error('Unsafe manifest path');
  const bytes=readFileSync(path.join(root,f.path));
  if (bytes.length!==f.bytes || hash(bytes)!==f.sha256) throw Error('Distribution content mismatch: '+f.path);
}
console.log(JSON.stringify({ version:manifest.version,files:manifest.files.length,manifestSha256:hash(readFileSync(path.join(root,'MANIFEST.json'))),status:'content-consistent',assurance:'requires-independently-provided-archive-or-manifest-hash' }));
