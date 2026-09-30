import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { digest } from '../contracts/canonical.js';
import { claimAssertionDigest, sourceContentDigest, type MemoryNamespace, type MemoryStore, type PromotionEvidence } from '../memory/index.js';

export const UNITY_CLI_VERSION = '1.0.0-beta.8';
export const UNITY_CLI_EXECUTABLE = path.join(os.homedir(), '.unity/bin/unity');
export const UNITY_VERSION = '6000.0.84f1';
export const UNITY_EXECUTABLE = `/Applications/Unity/Hub/Editor/${UNITY_VERSION}/Unity.app/Contents/MacOS/Unity`;
export const WALKING_SKELETON_VERSION = 'unity-walking-skeleton/1';

export interface UnityTaskManifest { taskId: string; requirement: string; targetFile: string; signature: string; stub: string; expectedTests: number }
/** Planner/critic receive these requirements and signatures only. The protected NUnit assertions remain outside their context. */
export const UNITY_TASK_MANIFEST: readonly UnityTaskManifest[] = [
  { taskId: 'integer-clamp', requirement: 'Clamp an integer inclusively; reject an inverted range.', targetFile: 'Assets/WalkingSkeleton/Tasks/IntegerClamp.cs', signature: 'int Clamp(int value, int minimum, int maximum)', stub: 'throw new ArgumentException("range") when minimum > maximum', expectedTests: 3 },
  { taskId: 'cell-bounds', requirement: 'Report whether a cell lies inside a positive rectangular grid.', targetFile: 'Assets/WalkingSkeleton/Tasks/CellBounds.cs', signature: 'bool Contains(int x, int y, int width, int height)', stub: 'return false for non-positive dimensions', expectedTests: 3 },
  { taskId: 'coordinate-index', requirement: 'Map a valid row-major grid coordinate to a linear index.', targetFile: 'Assets/WalkingSkeleton/Tasks/CoordinateIndex.cs', signature: 'int ToIndex(int x, int y, int width, int height)', stub: 'throw ArgumentOutOfRangeException for invalid coordinate or dimensions', expectedTests: 3 },
  { taskId: 'row-full', requirement: 'Determine whether every supplied row cell is occupied.', targetFile: 'Assets/WalkingSkeleton/Tasks/RowFull.cs', signature: 'bool IsFull(bool[] cells)', stub: 'return false for null or empty input', expectedTests: 3 },
  { taskId: 'deterministic-seed', requirement: 'Produce a stable non-negative seed for supplied text.', targetFile: 'Assets/WalkingSkeleton/Tasks/DeterministicSeed.cs', signature: 'int FromText(string value)', stub: 'treat null as empty text', expectedTests: 3 },
  { taskId: 'score-accumulation', requirement: 'Add a score delta without overflowing Int32.', targetFile: 'Assets/WalkingSkeleton/Tasks/ScoreAccumulation.cs', signature: 'int Add(int score, int delta)', stub: 'saturate at Int32 bounds', expectedTests: 3 },
  { taskId: 'json-state-roundtrip', requirement: 'Serialize and recover a small Unity JSON state without data loss.', targetFile: 'Assets/WalkingSkeleton/Tasks/JsonStateRoundtrip.cs', signature: 'State RoundTrip(State state)', stub: 'throw ArgumentNullException for null state', expectedTests: 2 },
  { taskId: 'vector2-grid-position', requirement: 'Map integer grid coordinates to a scaled Unity Vector2 position.', targetFile: 'Assets/WalkingSkeleton/Tasks/Vector2GridPosition.cs', signature: 'Vector2 ToWorld(int x, int y, float cellSize)', stub: 'throw ArgumentOutOfRangeException for non-positive cellSize', expectedTests: 3 },
  { taskId: 'duplicate-position', requirement: 'Detect duplicate Vector2Int positions in a collection.', targetFile: 'Assets/WalkingSkeleton/Tasks/DuplicatePosition.cs', signature: 'bool HasDuplicate(Vector2Int[] positions)', stub: 'return false for null or fewer than two positions', expectedTests: 3 },
  { taskId: 'placement-bounds', requirement: 'Check that a positive rectangular placement stays wholly within a positive board.', targetFile: 'Assets/WalkingSkeleton/Tasks/PlacementBounds.cs', signature: 'bool CanPlace(Vector2Int origin, Vector2Int size, Vector2Int board)', stub: 'return false for non-positive size or board dimensions', expectedTests: 3 },
];

export interface CheckedPlanArtifact { kind: 'checked-plan'; digest: string; taskIds: readonly string[]; criticDigest: string }
export interface CriticArtifact { kind: 'critic'; digest: string; approved: boolean; findings: readonly string[] }
export interface ExecutionArtifact { kind: 'execution'; digest: string; checkedPlanDigest: string; taskIds: readonly string[] }
export interface UnityTestSummary { total: number; passed: number; failed: number; skipped: number; inconclusive: number }
export interface UnityEvidence {
  schemaVersion: 'unity-evidence/1'; evidenceId: string; projectPath: string; unityVersion: string; unityCliVersion: string; sourceSnapshotDigest: string;
  sourceSnapshotAfterDigest: string;
  commandDigest: string; testXmlDigest: string; testSummary: UnityTestSummary; logDigest: string; outcome: 'pass' | 'fail' | 'unknown';
  checkedPlanDigest: string; executionDigest: string;
}
export interface UnityRunResult { evidence: UnityEvidence; artifactDirectory: string; command: readonly string[]; stdout: string; stderr: string; exitCode: number | null }
export interface UnityRunner { run(projectPath: string, artifacts: { plan: CheckedPlanArtifact; critic: CriticArtifact; execution: ExecutionArtifact }, outputRoot: string, options?: { testFilter?: string; expectedTestCount?: number }): UnityRunResult }

const sha256 = (bytes: string | Buffer): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const requiredTaskCount = 10;
const xmlAttribute = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const count = (tags: readonly string[], result: string): number => tags.filter(tag => xmlAttribute(tag, 'result') === result).length;

/** Parses NUnit's test-case records. A process exit code is deliberately insufficient evidence. */
export function parseUnityTestResults(xml: string): UnityTestSummary {
  const cases = [...xml.matchAll(/<test-case\b[^>]*>/g)].map(match => match[0]);
  if (!cases.length) throw new Error('UNITY_TEST_XML_NO_CASES');
  const summary = { total: cases.length, passed: count(cases, 'Passed'), failed: count(cases, 'Failed'), skipped: count(cases, 'Skipped'), inconclusive: count(cases, 'Inconclusive') };
  if (summary.total !== summary.passed + summary.failed + summary.skipped + summary.inconclusive) throw new Error('UNITY_TEST_XML_UNKNOWN_RESULT');
  return summary;
}

export function requireVerifiedUnityTests(summary: UnityTestSummary, expectedTests: number): void {
  if (!Number.isSafeInteger(expectedTests) || expectedTests <= 0) throw new Error('UNITY_TEST_EXPECTATION_INVALID');
  if (summary.total === 0 || summary.passed === 0) throw new Error('UNITY_TESTS_NO_POSITIVE_PASS');
  if (summary.failed || summary.skipped || summary.inconclusive) throw new Error('UNITY_TESTS_NOT_CLEAN');
  if (summary.total !== expectedTests || summary.passed !== expectedTests) throw new Error('UNITY_TESTS_INCOMPLETE_FIXTURE');
}

function sourceFiles(root: string): string[] {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return ['Library', 'Logs', 'Temp', 'obj', 'UserSettings'].includes(entry.name) ? [] : walk(file);
    return entry.isFile() && !entry.name.endsWith('.meta') ? [file] : [];
  });
  return ['Assets', 'Packages', 'ProjectSettings'].flatMap(name => {
    const candidate = path.join(root, name);
    return existsSync(candidate) && statSync(candidate).isDirectory() ? walk(candidate) : [];
  }).sort();
}

/** Hashes the source tree, excluding Unity-generated directories and unstable meta GUIDs. */
export function unitySourceSnapshot(projectPath: string): string {
  const root = path.resolve(projectPath);
  return digest(sourceFiles(root).map(file => ({ path: path.relative(root, file).split(path.sep).join('/'), digest: sha256(readFileSync(file)) })));
}

export function checkWorkflowArtifacts(plan: CheckedPlanArtifact, critic: CriticArtifact, execution: ExecutionArtifact): void {
  if (!plan.digest.startsWith('sha256:') || !critic.digest.startsWith('sha256:') || !execution.digest.startsWith('sha256:')) throw new Error('UNITY_ARTIFACT_DIGEST');
  if (!critic.approved || plan.criticDigest !== critic.digest || execution.checkedPlanDigest !== plan.digest) throw new Error('UNITY_PLAN_CRITIC_BINDING');
  if (!plan.taskIds.length || plan.taskIds.length > requiredTaskCount || execution.taskIds.length !== plan.taskIds.length || new Set(plan.taskIds).size !== plan.taskIds.length ||
    plan.taskIds.some(id => !UNITY_TASK_MANIFEST.some(task => task.taskId === id)) || digest(plan.taskIds) !== digest(execution.taskIds)) throw new Error('UNITY_TASK_FIXTURE_BINDING');
}

export class UnityCliAdapter {
  constructor(readonly executable = UNITY_EXECUTABLE, readonly cli = UNITY_CLI_EXECUTABLE) {}
  run(projectPath: string, artifacts: { plan: CheckedPlanArtifact; critic: CriticArtifact; execution: ExecutionArtifact }, outputRoot: string,
    options?: { testFilter?: string; expectedTestCount?: number }): UnityRunResult {
    checkWorkflowArtifacts(artifacts.plan, artifacts.critic, artifacts.execution);
    if (!existsSync(this.executable) || !existsSync(this.cli)) throw new Error('UNITY_EXECUTABLE_MISSING');
    const cliVersion = spawnSync(this.cli, ['--version'], { encoding: 'utf8', timeout: 10_000 });
    if (cliVersion.status !== 0 || cliVersion.stdout.trim() !== UNITY_CLI_VERSION) throw new Error('UNITY_CLI_VERSION_MISMATCH');
    const project = path.resolve(projectPath), output = path.resolve(outputRoot);
    if (!existsSync(path.join(project, 'ProjectSettings', 'ProjectVersion.txt'))) throw new Error('UNITY_PROJECT_VERSION_FILE_MISSING');
    if (!readFileSync(path.join(project, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8').includes(UNITY_VERSION)) throw new Error('UNITY_PROJECT_VERSION_MISMATCH');
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const artifactDirectory = path.join(output, `unity-run-${randomUUID()}`); mkdirSync(artifactDirectory, { recursive: false, mode: 0o700 });
    const xmlPath = path.join(artifactDirectory, 'unity-test-results.xml'), logPath = path.join(artifactDirectory, 'unity-test.log');
    const expectedTests = options?.expectedTestCount ?? artifacts.plan.taskIds.reduce((total, id) => total + UNITY_TASK_MANIFEST.find(task => task.taskId === id)!.expectedTests, 0);
    const testFilter = options?.testFilter;
    if (testFilter !== undefined && !testFilter.trim()) throw new Error('UNITY_TEST_FILTER_INVALID');
    // Test Framework owns process exit after it writes the NUnit XML. `-quit` can end a first-import run before tests start.
    const command = ['--non-interactive', '--no-banner', 'test', project, '--mode', 'EditMode', ...(testFilter ? ['--filter', testFilter] : []),
      '--output', xmlPath, '--editor-path', this.executable.replace(/\/Contents\/MacOS\/Unity$/, ''), '--timeout', '180', '--retries', '0', '--', '-nographics', '-runSynchronously', '-logFile', logPath];
    const sourceSnapshotDigest = unitySourceSnapshot(project);
    const run = spawnSync(this.cli, command, { encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    const stdout = run.stdout ?? '', stderr = run.stderr ?? '';
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : `${stdout}\n${stderr}`;
    const xml = existsSync(xmlPath) ? readFileSync(xmlPath, 'utf8') : '';
    let summary: UnityTestSummary | null = null;
    let outcome: UnityEvidence['outcome'] = 'unknown';
    const sourceSnapshotAfterDigest = unitySourceSnapshot(project);
    try { summary = parseUnityTestResults(xml); requireVerifiedUnityTests(summary, expectedTests); if (run.status !== 0) throw new Error('UNITY_PROCESS_NONZERO'); if (/\berror CS\d+|Compilation failed/i.test(log)) throw new Error('UNITY_COMPILE_ERROR'); if (sourceSnapshotDigest !== sourceSnapshotAfterDigest) throw new Error('UNITY_PROTECTED_SOURCE_MUTATED'); outcome = 'pass'; }
    catch { outcome = xml ? 'fail' : 'unknown'; }
    const evidence: UnityEvidence = { schemaVersion: 'unity-evidence/1', evidenceId: `unity:${randomUUID()}`, projectPath: project, unityVersion: UNITY_VERSION, unityCliVersion: UNITY_CLI_VERSION,
      sourceSnapshotDigest, sourceSnapshotAfterDigest, commandDigest: digest({ executable: this.cli, editorExecutable: this.executable, command }), testXmlDigest: sha256(xml),
      testSummary: summary ?? { total: 0, passed: 0, failed: 0, skipped: 0, inconclusive: 0 }, logDigest: sha256(log), outcome,
      checkedPlanDigest: artifacts.plan.digest, executionDigest: artifacts.execution.digest };
    writeFileSync(path.join(artifactDirectory, 'unity-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    return { evidence, artifactDirectory, command, stdout, stderr, exitCode: run.status };
  }
}

/** Uses the existing MemoryStore review path. This adds only verified native observations; it never self-promotes. */
export function proposeVerifiedUnityObservation(input: { store: MemoryStore; namespace: MemoryNamespace; evidence: UnityEvidence; executorId: string; verifierId: string; promoterId: string; now?: string }) {
  const { store, namespace, evidence, executorId, verifierId, promoterId } = input;
  if (evidence.outcome !== 'pass') throw new Error('UNITY_MEMORY_UNVERIFIED_EVIDENCE');
  const content = JSON.stringify(evidence);
  const sourceId = `unity-evidence:${evidence.evidenceId}`;
  store.ingest({ namespace, purpose: 'knowledge', provenance: { kind: 'primary', originId: sourceId }, content,
    record: { schemaVersion: '0.5.0', sourceId, sourceType: 'evidence', sourceRef: `unity://${evidence.evidenceId}`, sourceRevision: evidence.sourceSnapshotDigest,
      contentDigest: sourceContentDigest(content), observedAt: input.now ?? new Date().toISOString(), freshnessPolicy: 'pinned', freshness: 'fresh' } }, promoterId);
  const scope = { repoId: namespace.repoId, allowedPaths: namespace.allowedPaths, taskClasses: namespace.taskClasses };
  const claimId = `unity-observation:${evidence.evidenceId}`;
  const claim = { schemaVersion: '0.5.0' as const, claimId, statement: `Observed Unity ${evidence.unityVersion} EditMode fixture execution passed ${evidence.testSummary.passed} test cases.`,
    assertionType: 'observed' as const, sourceRefs: [sourceId], applicableScope: scope, evidenceStatus: 'unverified' as const, lifecycle: 'proposed' as const,
    freshness: 'unknown' as const, promotionEvidenceRefs: [], dependentRefs: [] };
  const delta = { schemaVersion: '0.5.0' as const, deltaId: `unity-delta:${evidence.evidenceId}`, sourceEvidenceIds: [`unity-promotion:${evidence.evidenceId}`], expectedMemoryVersion: store.memoryVersion,
    claimsAdded: [claim], claimsSuperseded: [], claimsQuarantined: [], claimsRevoked: [], affectedPages: ['unity/walking-skeleton'], promotionReviewRef: `unity-review:${evidence.evidenceId}` };
  const proposal = store.propose(delta, namespace, executorId);
  const promotionEvidence: PromotionEvidence = { evidenceId: delta.sourceEvidenceIds[0]!, claimId, assertionDigest: claimAssertionDigest(claim), assertionType: 'observed', namespace,
    sourceBindings: proposal.sourceBindings[0]!.sources, conclusion: 'supported', attestationRef: `unity-evidence:${evidence.evidenceId}:${evidence.testXmlDigest}` };
  store.recordEvidence(promotionEvidence, verifierId);
  return { proposal, delta, promotionEvidence };
}
