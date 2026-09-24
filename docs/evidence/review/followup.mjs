import {createFoundationScenario} from '../../../dist/fixtures/foundation.js';
import {auditContractBundle} from '../../../dist/src/foundation/audit.js';
import {digest} from '../../../dist/src/contracts/canonical.js';
const results=[];
{
 const {bundle:b,authority:a}=createFoundationScenario();
 b.SkillDescriptor.version='1.0.1';b.SkillBinding.skillVersion='1.0.1';b.SkillBinding.descriptorDigest=digest(b.SkillDescriptor);
 // Simulate a legitimately updated reviewed registry; the existing gate is intentionally left unchanged.
 a.skillDescriptors=[structuredClone(b.SkillDescriptor)];a.skillSelections=[structuredClone(b.SkillBinding)];
 const r=auditContractBundle(b,a);results.push({name:'new reviewed catalog version cannot reuse old gate',valid:r.valid,codes:r.issues.map(x=>x.code)});
}
{
 const {bundle:b,authority:a}=createFoundationScenario();
 b.ProjectProfile.uiSystem='uitk';b.SkillBinding.projectProfileDigest=digest(b.ProjectProfile);
 a.projectProfiles=[structuredClone(b.ProjectProfile)];a.skillSelections=[structuredClone(b.SkillBinding)];
 const r=auditContractBundle(b,a);results.push({name:'new observed profile cannot reuse old gate even if compatible',valid:r.valid,codes:r.issues.map(x=>x.code)});
}
{
 const {bundle:b,authority:a}=createFoundationScenario();
 delete b.OperationRecord.receiptRef;delete b.ToolResult.receiptRef;
 b.OperationRecord.postconditionRefs=['postcondition-A'];b.ToolResult.postconditionRefs=['postcondition-B'];
 const r=auditContractBundle(b,a);results.push({name:'absent receipts cannot mask contradictory postconditions',valid:r.valid,codes:r.issues.map(x=>x.code)});
}
console.log(JSON.stringify(results,null,2));
if(results.some(x=>x.valid))process.exitCode=1;
