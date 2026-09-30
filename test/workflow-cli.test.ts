import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFoundationScenario } from '../fixtures/foundation.js';
import { createFixtureWorkflow, MockWorkflowRunner } from '../src/foundation/workflow.js';

const cli = path.resolve('dist/src/cli.js');
test('mock workflow exercises the model/tool/eval interfaces without mutating its inputs', async () => {
  const scenario = createFoundationScenario();
  const before = JSON.stringify(scenario);
  const result = await createFixtureWorkflow(scenario.bundle).run(scenario);
  assert.equal(result.conformance.valid, true);
  assert.deepEqual(result.steps, ['contract-preflight', 'fake-plan', 'fake-read-only-inspection', 'contract-audit']);
  assert.equal(result.dispatchAuthorized, false);
  assert.equal(JSON.stringify(scenario), before);
});
test('failed preflight calls neither model nor tool', async () => {
  const scenario = createFoundationScenario();
  scenario.bundle.GateReport.issuerId = 'fixture-executor';
  let calls = 0;
  const runner = new MockWorkflowRunner({ async plan() { calls++; return scenario.bundle.PlanPackage; } }, { async inspect() { calls++; return scenario.bundle.ToolResult; } });
  assert.equal((await runner.run(scenario)).conformance.valid, false);
  assert.equal(calls, 0);
});
test('a plan changed after preflight cannot invoke the inspection adapter', async () => {
  const scenario = createFoundationScenario();
  let inspections = 0;
  const runner = new MockWorkflowRunner({ async plan() { return { ...scenario.bundle.PlanPackage, version: 99 }; } },
    { async inspect() { inspections++; return scenario.bundle.ToolResult; } });
  const result = await runner.run(scenario);
  assert.equal(result.conformance.valid, false);
  assert.equal(inspections, 0);
});
test('adapter failure propagates without fabricating a successful result', async () => {
  const scenario = createFoundationScenario();
  const runner = new MockWorkflowRunner({ async plan() { throw new Error('fixture adapter unavailable'); } },
    { async inspect() { assert.fail('Tool must not run'); } });
  await assert.rejects(runner.run(scenario), /adapter unavailable/);
});
test('CLI demo and catalog demo are explicit offline conformance outputs', () => {
  const demo = JSON.parse(execFileSync(process.execPath, [cli, 'demo'], { encoding: 'utf8' }));
  assert.equal(demo.mode, 'offline-fixture');
  assert.equal(demo.conformance.valid, true);
  const skills = JSON.parse(execFileSync(process.execPath, [cli, 'skills-demo'], { encoding: 'utf8' }));
  assert.equal(skills.resolution, 'eligible');
  assert.equal(skills.binding.loadedResources.length, 1);
  assert.equal(skills.binding.policyReleaseId, null);
  assert.equal(skills.unityInvoked, false);
  assert.equal(skills.dispatchAuthorized, false);
});
test('CLI invalid syntax, tampered gate and malformed JSON all exit nonzero', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'architect-cli-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'broken.json');
  await writeFile(file, '{');
  for (const args of [['demo', '--tamper'], ['missing'], ['validate', 'TaskContract', file], ['validate', 'TaskSpec', file], ['demo', 'extra']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).dispatchAuthorized, false);
  }
});
test('CLI validates a contract and exports all structural schemas with an explicit limitation', async (t) => {
  const catalog = JSON.parse(execFileSync(process.execPath, [cli, 'contracts'], { encoding: 'utf8' }));
  assert.equal(catalog.schemaVersion, 'mixed');
  assert.equal(catalog.contracts.length, 33);
  assert.equal(catalog.contractVersions.TaskSpec, '0.5.0');
  assert.equal(catalog.contractVersions.PlanPackage, '0.6.0');
  assert.equal(catalog.contractVersions.GateReport, '0.6.0');
  assert.equal(catalog.contractVersions.ReadyChecklist, '0.6.0');
  assert.deepEqual(Object.keys(catalog.contractVersions).sort(), [...catalog.contracts].sort());
  const temp = await mkdtemp(path.join(os.tmpdir(), 'architect-schema-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'task.json');
  await writeFile(file, JSON.stringify(createFoundationScenario().bundle.TaskSpec));
  const validation = JSON.parse(execFileSync(process.execPath, [cli, 'validate', 'TaskSpec', file], { encoding: 'utf8' }));
  assert.equal(validation.schemaValid, true);
  assert.equal(validation.dispatchAuthorized, false);
  const exported = JSON.parse(execFileSync(process.execPath, [cli, 'schemas', path.join(temp, 'schemas')], { encoding: 'utf8' }));
  assert.equal(exported.written, 33);
  const schema = JSON.parse(await readFile(path.join(temp, 'schemas/ToolCall.schema.json'), 'utf8'));
  assert.match(schema.$comment, /Structure only/);
});
