import { ProjectBrain } from './brain.js';
import { bootstrapProject, detectProject, loadProjectConfig, projectRoot, readProjectFile } from './project.js';
import { RELEASE_VERSION } from './templates.js';

export async function portableCommand(args:string[]): Promise<void> {
  const [command,flag,input,...rest] = args;
  if (!['bootstrap','status','resume','ingest','knowledge','plan','handoff','context'].includes(command ?? '') || flag !== '--project' || !input) throw Error('Use bootstrap|status|resume|ingest|knowledge|plan|handoff|context --project <root>; see SETUP.md for arguments.');
  const out = (v:unknown):void => { process.stdout.write(JSON.stringify(v,null,2)+'\n'); };
  if (command === 'bootstrap') { if (rest.length) throw Error('PORTABLE_CLI_ARGS'); out({ version:RELEASE_VERSION,...bootstrapProject(input),unityInvoked:false,modelsInvoked:false }); return; }
  const root = projectRoot(input), config = loadProjectConfig(root);
  if (command === 'status') { if (rest.length) throw Error('PORTABLE_CLI_ARGS'); out({ version:RELEASE_VERSION,projectId:config.projectId,profile:detectProject(root,config.projectId),
    connector:config.connector,mcpBinding:'not-verified-by-this-command',modelExecution:config.modelExecution,unityInvoked:false,executionAuthorized:false }); return; }
  const brain = new ProjectBrain(root);
  try {
    if (command === 'ingest') { if (rest.length !== 2) throw Error('PORTABLE_CLI_ARGS'); out(brain.ingestFile(rest[0]!,rest[1]!)); return; }
    if (command === 'knowledge') { if (rest.length > 1) throw Error('PORTABLE_CLI_ARGS'); out(brain.knowledge(rest[0])); return; }
    if (command === 'plan') { if (rest.length !== 3) throw Error('PORTABLE_CLI_ARGS');
      out(brain.recordPlan(JSON.parse(readProjectFile(root,rest[0]!)),readProjectFile(root,rest[1]!),rest[2]!.split(','))); return; }
    if (command === 'context') { if (rest.length !== 2) throw Error('PORTABLE_CLI_ARGS');
      out(await brain.context(JSON.parse(readProjectFile(root,rest[0]!)),rest[1]!.split(','))); return; }
    if (command === 'handoff') { if (rest.length !== 2) throw Error('PORTABLE_CLI_ARGS'); out(brain.handoff(rest[0]!.split(','),rest[1]!)); return; }
    if (rest.length) throw Error('PORTABLE_CLI_ARGS'); out(brain.resume());
  } finally { brain.close(); }
}
