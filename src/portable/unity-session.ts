import { realpathSync } from 'node:fs';
import { z } from 'zod';
import { projectRoot } from './project.js';

const identitySchema = z.strictObject({ projectPath:z.string().min(1),editorPid:z.number().int().positive(),unityVersion:z.string().min(1) });
export type UnitySessionIdentity = z.infer<typeof identitySchema>;
/** Host-provided wrapper around tools actually exposed in the new agent session; no built-in CLI fallback. */
export interface AssistantUnityReadPort {
  connector: 'Assistant Unity';
  availableReadTools: readonly string[];
  inspectIdentity(): Promise<UnitySessionIdentity>;
  observe(): Promise<{ identity:UnitySessionIdentity;data:unknown }>;
}
export async function bindAssistantUnity(input: string, port: AssistantUnityReadPort): Promise<{ identity:UnitySessionIdentity;observe:AssistantUnityReadPort['observe'] }> {
  const root = projectRoot(input);
  if (port.connector !== 'Assistant Unity' || !port.availableReadTools.length) throw Error('PORTABLE_MCP_TOOLS_UNAVAILABLE');
  const check = (value:UnitySessionIdentity): UnitySessionIdentity => {
    const identity = identitySchema.parse(value);
    if (realpathSync(identity.projectPath) !== root) throw Error('PORTABLE_MCP_PROJECT_MISMATCH');
    return identity;
  };
  const identity = check(await port.inspectIdentity());
  const editorPid=identity.editorPid, unityVersion=identity.unityVersion;
  return { identity:Object.freeze({ ...identity }),observe:async () => { const result = await port.observe(), current = check(result.identity);
    if (current.editorPid !== editorPid || current.unityVersion !== unityVersion) throw Error('PORTABLE_MCP_SESSION_DRIFT');
    return { identity:current,data:result.data }; } };
}
