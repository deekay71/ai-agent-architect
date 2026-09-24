/** A design-time permission model, not an OS sandbox. Runtime enforcement is Phase 2. */
export const roles = [
  'planner', 'executor', 'critic', 'verificationRunner', 'gateController', 'policyOwner', 'memoryPromoter',
] as const;
export type ActorRole = typeof roles[number];
export type StoreKind = 'candidate' | 'policy' | 'oracle' | 'evidence' | 'verdict' | 'promotedMemory';
export interface Principal {
  readonly id: string;
  readonly role: ActorRole;
  readonly projectIds: readonly string[];
}

const writers: Readonly<Record<StoreKind, readonly ActorRole[]>> = {
  candidate: ['executor'],
  policy: ['policyOwner'],
  oracle: ['policyOwner'],
  evidence: ['verificationRunner'],
  verdict: ['gateController'],
  promotedMemory: ['memoryPromoter'],
};

export function canWrite(principal: Principal | undefined, store: StoreKind, projectId: string): boolean {
  return !!principal && principal.projectIds.includes(projectId) && writers[store].includes(principal.role);
}

/** Scopes are repository-relative POSIX roots, not globs. */
export function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
  if (/^[A-Za-z]:/.test(value) || /[*?\[\]{}]/.test(value)) return false;
  return value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

export function isWithinScope(path: string, roots: readonly string[]): boolean {
  return isSafeRelativePath(path) && roots.some(root =>
    isSafeRelativePath(root) && (path === root || path.startsWith(`${root}/`)),
  );
}
