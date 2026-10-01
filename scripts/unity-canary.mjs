// One deliberately narrow Terra canary.  It is inert until --live is supplied.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runNativeCodexUnityTask } from '../dist/src/unity/native-codex.js';
import { auditUnityCanaryReceipts } from '../dist/src/unity/comparison.js';

const repo = path.resolve(import.meta.dirname, '..');
const template = path.join(repo, 'unity/walking-skeleton');
const output = path.resolve(process.argv[2] ?? '.local/unity-canary');
const live = process.argv.includes('--live');
if (fs.existsSync(output)) throw Error('CANARY_OUTPUT_MUST_BE_NEW');
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const task = JSON.parse(fs.readFileSync(path.join(template, 'tasks.json'), 'utf8')).find(value => value.id === 'integer-clamp');
if (!task || task.expectedTestCount !== 3) throw Error('CANARY_INTEGER_CLAMP_MANIFEST_REQUIRED');
const project = path.join(output, 'public'), target = path.join(project, task.targetFile), evaluation = path.join(output, 'private-eval');
for (const folder of ['Packages', 'ProjectSettings']) fs.cpSync(path.join(template, folder), path.join(project, folder), { recursive: true });
fs.mkdirSync(path.join(project, 'Assets/WalkingSkeleton/Tasks'), { recursive: true });
fs.copyFileSync(path.join(template, 'Assets/WalkingSkeleton/WalkingSkeleton.asmdef'), path.join(project, 'Assets/WalkingSkeleton/WalkingSkeleton.asmdef'));
for (const manifestTask of JSON.parse(fs.readFileSync(path.join(template, 'tasks.json'), 'utf8'))) fs.writeFileSync(path.join(project, manifestTask.targetFile), manifestTask.stub);
fs.cpSync(project, evaluation, { recursive: true });
fs.cpSync(path.join(template, 'Assets/Tests'), path.join(evaluation, 'Assets/Tests'), { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const snapshot = spawnSync('/usr/bin/python3', ['-c', 'import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location("bridge",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(m.snapshot(Path(sys.argv[2]),Path(sys.argv[3])))', path.join(repo, 'scripts/unity-test-mcp.py'), project, target], { encoding: 'utf8' });
if (snapshot.status !== 0) throw Error('CANARY_BROKER_SNAPSHOT_FAILED');
const brokerOutput = path.join(output, 'broker');
const brokerArgs = [path.join(repo, 'scripts/unity-test-mcp.py'), project, target, snapshot.stdout.trim(), brokerOutput, evaluation, task.testFilter, '3', '2'];
const fixedMcpConfig = ['mcp_servers.unity_public.command="/usr/bin/python3"', `mcp_servers.unity_public.args=${JSON.stringify(brokerArgs)}`, 'mcp_servers.unity_public.startup_timeout_sec=20', 'mcp_servers.unity_public.tool_timeout_sec=210', 'mcp_servers.unity_public.tools.unity_compile_test.approval_mode="approve"'];
const preparation = { schemaVersion: 'unity-canary-preparation/1', status: live ? 'dispatching' : 'ready', task: { id: task.id, targetFile: task.targetFile, expectedTestCount: 3 }, session: { maxSessions: 1, maxTurns: 1, providerResponses: 'dynamic within one tool-driven turn', maxMcpCalls: 2, retries: 0 }, budget: { forecastCreditMicros: { low: 1000000, high: 1500000, basis: 'prior IntegerClamp native run used 1014790 micros with one failed MCP attempt; current prompt is shorter but requires two calls' }, maxCreditMicros: 1500000, responseReserveCreditMicros: 500000, interruptAtCreditMicros: 1000000, telemetryLimitation: 'Cumulative telemetry requests interruption but cannot guarantee a provider hard cutoff for in-flight output.' }, approval: { configuredTool: 'unity_public.unity_compile_test', status: 'explicit-configured', setting: fixedMcpConfig.at(-1), failures: 'denied or transport error must be recorded from private raw events and fail closed' }, pins: { unityCli: '/Users/dmobin/.unity/bin/unity 1.0.0-beta.8', editor: '/Applications/Unity/Hub/Editor/6000.0.84f1/Unity.app/Contents/MacOS/Unity' }, quotaSnapshot: { observedPercent: 32, observedAt: '2026-10-01T02:28:00Z', preparationStopPercent: 34 } };
save('preparation.json', preparation);
if (!live) { console.log(JSON.stringify({ status: 'ready', output, modelsInvoked: 0 })); process.exit(0); }
const artifacts = path.join(output, 'native-' + randomUUID());
const prompt = `Implement only ${task.targetFile}. Requirement: ${task.requirement} Start from the supplied throwing stub. In this same single turn, call unity_public.unity_compile_test exactly twice: first while the supplied stub still throws, then implement the requirement and call it once more. Do not call it again. The first result must be a failing three-test receipt and the second a passing three-test receipt. Do not modify tests or any file other than the target. Minimize shell/context/actions and final output.`;
const receipt = await runNativeCodexUnityTask({ projectPath: project, targetFile: task.targetFile, prompt, artifactDirectory: artifacts, maxCreditMicros: 1500000, responseReserveCreditMicros: 500000, fixedMcpConfig });
const brokerReceipts = fs.existsSync(brokerOutput) ? fs.readdirSync(brokerOutput).map(id => path.join(brokerOutput, id, 'receipt.json')).filter(fs.existsSync).map(file => JSON.parse(fs.readFileSync(file, 'utf8'))).sort((a, b) => a.callIndex - b.callIndex) : [];
const failure = auditUnityCanaryReceipts(brokerReceipts, hashFrom(task.stub), hash(target));
const eventsFile = path.join(artifacts, 'app-server.events.ndjson');
const approvals = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(event => event.method === 'item/completed' && event.params?.item?.type === 'mcpToolCall').map(event => {
  const item = event.params.item, error = item.error?.message ?? null, denied = typeof error === 'string' && /denied|rejected|approval.*refused/i.test(error);
  return { id: item.id ?? null, server: item.server ?? null, tool: item.tool ?? null, status: item.status ?? null, error, approval: item.status === 'completed' && !error && item.result?.isError !== true ? 'approved' : denied ? 'denied' : 'error' };
}) : [];
save('result.json', { receipt, brokerReceipts, receiptAudit: failure, approvals });
if (receipt.status !== 'completed' || failure) process.exitCode = 1;
function hashFrom(text) { return createHash('sha256').update(text).digest('hex'); }
