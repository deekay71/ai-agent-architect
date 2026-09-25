import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { digest } from '../contracts/canonical.js';
import { isSafeRelativePath, isWithinScope } from '../foundation/permissions.js';

export const bytesDigest = (bytes: string | Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function workspacePath(workspace: string, relative: string, roots: readonly string[]): string {
  if (!isSafeRelativePath(relative) || !isWithinScope(relative, roots)) throw new Error('PATH_SCOPE_DENIED');
  const root = realpathSync(workspace);
  let next = root;
  for (const part of relative.split('/')) {
    next = path.join(next, part);
    try {
      const stat = lstatSync(next);
      if (stat.isSymbolicLink()) throw new Error('WORKSPACE_SYMLINK');
      if (stat.isFile() && stat.nlink !== 1) throw new Error('WORKSPACE_HARDLINK');
    }
    catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  }
  return next;
}
export function workspaceSnapshot(workspace: string): { path: string; hash: string; mode: number }[] {
  const root = realpathSync(workspace), files: { path: string; hash: string; mode: number }[] = [];
  let total = 0;
  const visit = (dir: string, rel: string): void => {
    if (rel.split('/').length > 64) throw new Error('WORKSPACE_LIMIT');
    for (const name of readdirSync(dir).sort()) {
      if (files.length >= 10000) throw new Error('WORKSPACE_LIMIT');
      const file = path.join(dir, name), relative = rel ? `${rel}/${name}` : name, stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('WORKSPACE_SYMLINK');
      if (stat.isFile() && stat.nlink !== 1) throw new Error('WORKSPACE_HARDLINK');
      if (stat.isDirectory()) { files.push({ path: `${relative}/`, hash: bytesDigest('directory'), mode: stat.mode & 0o777 }); visit(file, relative); }
      else {
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || files.length >= 10000 || (total += stat.size) > 64 * 1024 * 1024) throw new Error('WORKSPACE_LIMIT');
        files.push({ path: relative, hash: bytesDigest(readFileSync(file)), mode: stat.mode & 0o777 });
      }
    }
  };
  visit(root, '');
  return files;
}
export const workspaceDigest = (workspace: string): string => digest(workspaceSnapshot(workspace));
