import type { Claim, MemoryDelta, SourceRecord } from '../contracts/schemas.js';
import type { Principal } from '../foundation/permissions.js';

export type MemoryScope = Claim['applicableScope'];
export interface MemoryNamespace extends MemoryScope { branchId: string; lineageId: string }
export interface SourceBinding { sourceId: string; sourceRevision: string; contentDigest: string }
export interface SourceProvenance {
  kind: 'primary' | 'derived'; originId: string; derivedFrom?: SourceBinding[];
}
export interface SourceInput {
  record: SourceRecord; content: string; namespace: MemoryNamespace; provenance: SourceProvenance;
  purpose: 'knowledge' | 'holdout';
}
export interface MemoryOptions { principals: readonly Principal[]; namespaces: readonly MemoryNamespace[]; now?: () => string; minimumIndependentOrigins?: number }
export type MemoryNodeKind = 'source' | 'claim' | 'context' | 'plan' | 'handoff' | 'artifact';
export interface MemoryNode {
  id: string; kind: MemoryNodeKind; label: string; content: string; sourceRef?: string;
  scope: MemoryScope; branchId: string; lineageId: string; revision: string;
  /** SHA256 of raw UTF-8 content, suitable for ContextResource pins. */
  contentDigest: string;
  /** Canonical record digest; distinct from materialized content bytes. */
  recordDigest: string;
  provenance: { sourceRefs: string[]; originIds: string[]; derived: boolean; assertionType?: Claim['assertionType'] };
  status: { lifecycle: string; freshness: Claim['freshness']; validity: 'valid' | 'invalidated'; reasons: string[] };
  current: boolean;
}
export type MemoryEdgeType = 'depends_on' | 'implements' | 'tested_by' | 'justified_by' | 'supersedes' | 'conflicts_with';
/** from depends on to. Invalidation propagates from to → from. */
export interface MemoryEdge {
  id: string; from: string; to: string; type: MemoryEdgeType;
  assertion: 'explicit' | 'inferred'; provenanceRef: string;
}
export interface MemorySnapshot {
  schemaVersion: 'memory-snapshot/1'; namespace: MemoryNamespace;
  memoryVersion: string; generatedAt: string; nodes: MemoryNode[]; edges: MemoryEdge[]; digest: string;
}
export interface MemoryQuery { namespace: MemoryNamespace; text?: string; limit?: number; includeUnusable?: boolean; expandHops?: number }
export interface PromotionEvidence {
  evidenceId: string; claimId: string; assertionDigest: string; assertionType: Claim['assertionType'];
  namespace: MemoryNamespace; sourceBindings: SourceBinding[];
  conclusion: 'supported' | 'contradicted' | 'insufficient';
  /** Evidence producer's attestation/ref, recorded only through a registered verificationRunner. */
  attestationRef: string;
}
export interface ReviewInput { reviewRef: string; decision: 'approve' | 'reject'; reason: string }
export interface Proposal {
  delta: MemoryDelta; namespace: MemoryNamespace; digest: string; proposedBy: string;
  sourceBindings: { claimId: string; sources: SourceBinding[] }[];
}
export interface ValidationReport { deltaId: string; proposalDigest: string; valid: boolean; issues: string[]; reviewRef: string; reviewedBy: string }
export interface DependencyInput {
  id: string; kind: 'context' | 'plan' | 'handoff' | 'artifact'; label: string; contentDigest: string;
  namespace: MemoryNamespace; dependsOn: { nodeId: string; contentDigest: string; type?: MemoryEdgeType }[];
  provenanceRef: string;
}
export interface TransitionInput {
  claimId: string; namespace: MemoryNamespace; to: 'quarantined' | 'revoked' | 'superseded';
  reason: string; reviewRef: string; expectedMemoryVersion: string; supersededBy?: string;
}
