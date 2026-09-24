import { createFoundationScenario } from '../../../dist/fixtures/foundation.js';
import { auditContractBundle } from '../../../dist/src/foundation/audit.js';
import { digest, digestOmitting } from '../../../dist/src/contracts/canonical.js';
const cases = [];
const add=(name,mutate)=>{const {bundle:b,authority:a}=createFoundationScenario();mutate(b,a);const r=auditContractBundle(b,a);cases.push({name,valid:r.valid,issues:r.issues});};
function resealContext(b){b.ContextManifest.taskSpecDigest=digest(b.TaskSpec);b.ContextManifest.manifestDigest=digestOmitting(b.ContextManifest,'manifestDigest');b.ContextBundle.manifestDigest=b.ContextManifest.manifestDigest;b.HandoffPacket.contextManifestDigest=b.ContextManifest.manifestDigest;b.SkillBinding.contextManifestDigest=b.ContextManifest.manifestDigest;}
add('gate with OLD task/context input digests accepts CHANGED goal',b=>{b.TaskSpec.goal='Replace protected configuration';resealContext(b)});
add('gate with OLD task/context inputs accepts task + handoff path widening',b=>{b.TaskSpec.allowedPaths.push('policy');b.ContextManifest.scope.allowedPaths.push('policy');b.HandoffPacket.allowedScope.allowedPaths.push('policy');b.ToolCall.permissionScope.allowedPaths=['policy'];resealContext(b)});
add('ownership resource points to other project',b=>{b.OwnershipRecord.resourceId='other-project'});
add('context snapshot points to unrelated snapshot',b=>{b.ContextBundle.snapshotId='snapshot-other'});
add('readOnly result changed workspace digest',b=>{b.ToolResult.workspaceSnapshot.digest=digest('different-workspace')});
add('tool call grants commands outside plan allowedTools',b=>{b.ToolCall.permissionScope.allowedCommands=['arbitrary-shell'];b.ToolCall.permissionScope.networkDestinations=['https://unapproved.example']});
add('committed operation has a failed matching attempt',b=>{b.OperationRecord.attempts[0].status='failed'});
add('skill swapped to arbitrary descriptor, binding self-resealed',b=>{b.SkillDescriptor.source.repository='https://unreviewed.example/repo';b.SkillDescriptor.source.revision='unreviewed';b.SkillDescriptor.resources[0].contentHash=digest('unreviewed body');b.SkillDescriptor.contentDigest=digest(b.SkillDescriptor.resources);b.SkillBinding.descriptorDigest=digest(b.SkillDescriptor);b.SkillBinding.loadedResources=structuredClone(b.SkillDescriptor.resources)});
add('incompatible skill profile accepted by integrated audit',b=>{b.ProjectProfile.editorVersion='9999.0.0';b.SkillBinding.projectProfileDigest=digest(b.ProjectProfile)});
add('unloaded body substituted with reference',b=>{b.SkillDescriptor.resources.push({path:'ref.md',kind:'reference',contentHash:digest('ref')});b.SkillDescriptor.contentDigest=digest(b.SkillDescriptor.resources);b.SkillBinding.descriptorDigest=digest(b.SkillDescriptor);b.SkillBinding.loadedResources=[b.SkillDescriptor.resources[1]]});
add('unused Checkpoint node accepted',b=>{b.Checkpoint.completedNodeIds=['invented-node']});
add('context evidence source/revision mismatched',b=>{b.ContextManifest.evidenceBindings[0].sourceRevision='nonexistent-revision';b.ContextBundle.evidenceItems[0].sourceRef='nonexistent-source';resealContext(b)});
console.log(JSON.stringify(cases,null,2));
