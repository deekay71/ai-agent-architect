import fs from 'node:fs';
import path from 'node:path';
import { loadPublicDataset, loadEvaluatorOracle } from '../dist/src/evaluation/dataset.js';
import { prepareContext } from '../dist/src/evaluation/context-arms.js';
import { digest } from '../dist/src/contracts/canonical.js';
const [datasetRoot, outputRoot] = process.argv.slice(2);
if (!datasetRoot || !outputRoot || fs.existsSync(outputRoot)) throw Error('Expected dataset and NEW output directory');
fs.mkdirSync(outputRoot, { recursive: true });
const data = loadPublicDataset(datasetRoot), selected = [];
for (const task of data.cases.filter(row => row.split === 'dev')) for (const density of [0,8]) {
  const context = await prepareContext({root: path.join(outputRoot, `memory-${task.id}-${density}`), task, documents: data.documents,
    arm:'retrieval',role:'executor',modelConfigVersion:'phase3-timeboxed-closure',distractors:density,topK:3,trialId:`dev-${task.id}-${density}`});
  selected.push({caseId:task.id,density, selected:context.selected.map(d=>d.id), legacy:context.retrievalDiagnostics.retrieved10Ids.slice(0,3), diagnostics:context.retrievalDiagnostics});
}
// Oracle is loaded strictly after every selection, never passed to retrieval.
const gold = loadEvaluatorOracle(datasetRoot);
const rows=selected.map(row=>{const required=gold.find(g=>g.caseId===row.caseId).requiredEvidenceIds;return {...row,required,applicable:required.length>0,
  sufficient:required.length?required.every(id=>row.selected.includes(id)):null,
  legacySufficient:required.length?required.every(id=>row.legacy.includes(id)):null};});
const aggregate=[0,8].map(density=>{const subset=rows.filter(r=>r.density===density);return {density,cases:subset.length,applicable:subset.filter(r=>r.applicable).length,
  sufficient:subset.filter(r=>r.sufficient===true).length,notApplicable:subset.filter(r=>!r.applicable).length,
  regressions:subset.filter(r=>r.legacySufficient===true&&r.sufficient===false).length};});
const report={schemaVersion:'phase3-dev-selection/1',scope:'DEV-only offline measurement; no model calls; no new holdout',publicDatasetDigest:digest(data),
  selector:'public-critical-raw-anchor-mmr/1',aggregate,rows};
fs.writeFileSync(path.join(outputRoot,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({aggregate,report:path.join(outputRoot,'report.json')}));
