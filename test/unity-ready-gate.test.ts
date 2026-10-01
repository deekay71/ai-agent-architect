import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.cwd();
const fixture = path.join(repo, 'docs/evidence/walking-skeleton-20261001-47');

for (const scenario of ['ready', 'not_ready', 'wrong_hash', 'missing_approval', 'changed_decision'] as const) {
  test(`two-case entrypoint admission: ${scenario}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unity-ready-'));
    try {
      const record = JSON.parse(fs.readFileSync(path.join(fixture, 'ready.json'), 'utf8'));
      const approval = JSON.parse(fs.readFileSync(path.join(fixture, 'approval.json'), 'utf8'));
      const protocolPath = path.join(dir, 'protocol.json');
      const readyPath = path.join(dir, 'ready.json');
      const approvalPath = path.join(dir, 'approval.json');
      fs.copyFileSync(path.join(fixture, 'protocol.json'), protocolPath);
      record.records.readyChecklist.plan.ref = protocolPath;
      record.approvalRef.ref = approvalPath;
      if (scenario === 'not_ready') {
        record.records.readyChecklist.outcome = 'not_ready';
        record.records.readyChecklist.checks.interfaceCompatibility.outcome = 'fail';
      }
      if (scenario === 'wrong_hash') fs.appendFileSync(protocolPath, '\n');
      if (scenario === 'missing_approval') delete record.approvalRef;
      if (scenario === 'changed_decision') approval.content = 'Unrelated approval';
      fs.writeFileSync(readyPath, JSON.stringify(record));
      fs.writeFileSync(approvalPath, JSON.stringify(approval));
      const output = path.join(dir, 'must-not-exist');
      const result = spawnSync(process.execPath, [path.join(repo, 'scripts/unity-comparison-local.mjs'), output,
        '--two-case', '--live', '--gate-only', '--ready-record', readyPath, '--protocol', protocolPath,
        '--approval-record', approvalPath], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
      assert.equal(result.error, undefined);
      assert.equal(fs.existsSync(output), false, 'Gate must run before project/tool side effects');
      if (scenario === 'ready') {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), { admission: 'ready', modelsInvoked: 0, toolsInvoked: 0 });
      } else {
        assert.notEqual(result.status, 0);
        const expected = scenario === 'not_ready' ? 'TWO_CASE_READY_REQUIRED'
          : scenario === 'wrong_hash' ? 'READY_PROTOCOL_BINDING_REQUIRED' : 'TWO_CASE_OWNER_APPROVAL_REQUIRED';
        assert.match(result.stderr, new RegExp(expected));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
