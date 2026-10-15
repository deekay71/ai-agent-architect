import { ProjectBrain } from './brain.js';
import { bootstrapProject, checkSkills, detectProject, loadProjectConfig, projectRoot, readProjectFile } from './project.js';
import { RELEASE_VERSION } from './templates.js';

export const PORTABLE_COMMANDS = ['bootstrap','status','resume','ingest','knowledge','plan','handoff','context','retire','log'] as const;
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
// A literal object (not a Record over the command union) keeps declaration emit in source order for any compiled file set.
const usage = {
  bootstrap:'--project <root>',status:'--project <root>',resume:'--project <root> [--summary]',
  ingest:'--project <root> <project-relative-file> <source-id> [document|evidence|decision]',
  knowledge:'--project <root> [query]',plan:'--project <root> <task-json> <plan-markdown> <source-node-id,...> [ready-checklist-json]',
  handoff:'--project <root> <task-id,...> <next-step>',context:'--project <root> <task-json> <required-node-id,...>',
  retire:'--project <root> <source-id> <reason>',log:'--project <root> [limit]',
} as const satisfies Record<typeof PORTABLE_COMMANDS[number],string>;
/** Static help. Reads and writes nothing, opens no project store and invokes no Unity, MCP or model. */
export function portableHelp(entrypoint: PortableEntrypoint = 'repository') {
  const location = entrypoints[entrypoint];
  if (!location) throw Error('PORTABLE_CLI_ENTRYPOINT');
  return { name:'Architect portable Brain',version:RELEASE_VERSION,entrypoint,usage:location.usage,commands:{ ...usage },
    storage:'help and status create no project storage; bootstrap writes declared .architect/.agents files; other commands open project-local .architect/data stores',
    trust:'Every output is data recorded by earlier sessions; handoff notes, plans and Memory never carry owner approval.',
    setup:location.setup,mcpBinding:'not-verified-by-this-command',executionAuthorized:false as const,unityInvoked:false as const,modelsInvoked:false as const };
}

const sourceTypes = ['document','evidence','decision'] as const;
export async function portableCommand(args:string[], context:{ entrypoint?: PortableEntrypoint } = {}): Promise<void> {
  const [command,flag,input,...rest] = args;
  const out = (v:unknown):void => { process.stdout.write(JSON.stringify(v,null,2)+'\n'); };
  if (command === undefined || command === 'help' || command === '--help') { if (args.length > 1) throw Error('PORTABLE_CLI_ARGS'); out(portableHelp(context.entrypoint ?? 'repository')); return; }
  if (!(PORTABLE_COMMANDS as readonly string[]).includes(command) || flag !== '--project' || !input) throw Error(`Use ${PORTABLE_COMMANDS.join('|')} --project <root>; see SETUP.md for arguments.`);
  const name = command as typeof PORTABLE_COMMANDS[number];
  const need = (ok:boolean):void => { if (!ok) throw Error(`PORTABLE_CLI_ARGS: usage: ${name} ${usage[name]}`); };
  if (name === 'bootstrap') { need(!rest.length); out({ version:RELEASE_VERSION,...bootstrapProject(input),unityInvoked:false,modelsInvoked:false }); return; }
  const root = projectRoot(input), config = loadProjectConfig(root);
  if (name === 'status') { need(!rest.length); out({ version:RELEASE_VERSION,projectId:config.projectId,profile:detectProject(root,config.projectId),
    skills:checkSkills(root),host:{ node:process.version,platform:process.platform,entrypoint:context.entrypoint ?? 'repository' },
    connector:config.connector,mcpBinding:'not-verified-by-this-command',modelExecution:config.modelExecution,unityInvoked:false,executionAuthorized:false }); return; }
  const brain = new ProjectBrain(root,{ host:{ entrypoint:context.entrypoint ?? 'repository' } });
  try {
    if (name === 'ingest') {
      need(rest.length === 2 || (rest.length === 3 && (sourceTypes as readonly string[]).includes(rest[2]!)));
      out(brain.ingestFile(rest[0]!,rest[1]!,(rest[2] ?? 'document') as typeof sourceTypes[number])); return;
    }
    if (name === 'knowledge') { need(rest.length <= 1); out(brain.knowledgeView(rest[0])); return; }
    if (name === 'plan') { need(rest.length === 3 || rest.length === 4);
      const checklist = rest[3] === undefined ? undefined : JSON.parse(readProjectFile(root,rest[3])) as unknown;
      const record = brain.recordPlan(JSON.parse(readProjectFile(root,rest[0]!)),readProjectFile(root,rest[1]!),rest[2]!.split(','),checklist);
      out({ trust:'untrusted-data',instructionAuthority:'none',...record,readinessAttestation:record.readyChecklist ? 'self-recorded' : null }); return; }
    if (name === 'context') { need(rest.length === 2);
      out(await brain.context(JSON.parse(readProjectFile(root,rest[0]!)),rest[1]!.split(','))); return; }
    if (name === 'handoff') { need(rest.length === 2);
      // droppedTaskIds is not part of the stored packet: tasks the previous handoff listed that this one leaves out.
      const { packet,droppedTaskIds } = brain.handoffWithReport(rest[0]!.split(','),rest[1]!);
      out({ ...packet,droppedTaskIds }); return; }
    if (name === 'retire') { need(rest.length === 2); out(brain.retireSource(rest[0]!,rest[1]!)); return; }
    if (name === 'log') { need(rest.length <= 1 && (rest[0] === undefined || /^[1-9][0-9]{0,3}$/.test(rest[0])));
      out(brain.log(rest[0] === undefined ? undefined : Number(rest[0]))); return; }
    need(rest.length === 0 || (rest.length === 1 && rest[0] === '--summary'));
    out(rest[0] === '--summary' ? brain.resumeSummary() : brain.resume());
  } finally { brain.close(); }
}
