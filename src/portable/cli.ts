import { ProjectBrain } from './brain.js';
import { bootstrapProject, detectProject, loadProjectConfig, projectRoot, readProjectFile } from './project.js';
import { RELEASE_VERSION } from './templates.js';

export const PORTABLE_COMMANDS = ['bootstrap','status','resume','ingest','knowledge','plan','handoff','context'] as const;
/**
 * Where the commands are being invoked from. `repository`: the root CLI namespace `node dist/src/cli.js portable …` (the
 * default for existing direct callers). `distribution`: the generated `host/bin/architect.mjs`, which takes commands directly
 * and ships SETUP.md at the distribution root. Context only changes help text; it grants nothing.
 */
export type PortableEntrypoint = 'repository' | 'distribution';
const entrypoints: Readonly<Record<PortableEntrypoint,{ usage:string; setup:string }>> = {
  repository:{ usage:'node dist/src/cli.js portable <command> --project <unity-project-root> [arguments]',setup:'portable/SETUP.md' },
  distribution:{ usage:'node <distribution>/host/bin/architect.mjs <command> --project <unity-project-root> [arguments]',setup:'SETUP.md' },
};
/** Static help. Reads and writes nothing, opens no project store and invokes no Unity, MCP or model. */
export function portableHelp(entrypoint: PortableEntrypoint = 'repository') {
  const location = entrypoints[entrypoint];
  if (!location) throw Error('PORTABLE_CLI_ENTRYPOINT');
  return { name:'Architect portable Brain',version:RELEASE_VERSION,entrypoint,usage:location.usage,
    commands:{ bootstrap:'--project <root>',status:'--project <root>',resume:'--project <root>',ingest:'--project <root> <project-relative-file> <source-id>',
      knowledge:'--project <root> [query]',plan:'--project <root> <task-json> <plan-markdown> <source-node-id,...>',
      handoff:'--project <root> <task-id,...> <next-step>',context:'--project <root> <task-json> <required-node-id,...>' },
    storage:'help and status create no project storage; bootstrap writes declared .architect/.agents files; other commands open project-local .architect/data stores',
    setup:location.setup,mcpBinding:'not-verified-by-this-command',executionAuthorized:false as const,unityInvoked:false as const,modelsInvoked:false as const };
}

export async function portableCommand(args:string[], context:{ entrypoint?: PortableEntrypoint } = {}): Promise<void> {
  const [command,flag,input,...rest] = args;
  const out = (v:unknown):void => { process.stdout.write(JSON.stringify(v,null,2)+'\n'); };
  if (command === undefined || command === 'help' || command === '--help') { if (args.length > 1) throw Error('PORTABLE_CLI_ARGS'); out(portableHelp(context.entrypoint ?? 'repository')); return; }
  if (!(PORTABLE_COMMANDS as readonly string[]).includes(command) || flag !== '--project' || !input) throw Error('Use bootstrap|status|resume|ingest|knowledge|plan|handoff|context --project <root>; see SETUP.md for arguments.');
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
