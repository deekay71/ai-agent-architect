import { z } from 'zod';
import { digest } from '../contracts/canonical.js';
import type { PlanningRecords } from '../runtime/evaluation.js';
import { validateContextWindow, type ContextAuthority, type ContextCounter, type ContextValidation, type ContextWindow } from './engine.js';

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const pinSchema = z.strictObject({ schemaVersion: z.literal('context-guard/1'), guardId: z.string().min(1).max(150),
  windowDigest: hash, taskDigest: hash, manifestDigest: hash, bundleDigest: hash });
export type ContextGuardPin = z.infer<typeof pinSchema>;
export interface RuntimeContextGuard { readonly pin: Readonly<ContextGuardPin> }
interface GuardState {
  window: ContextWindow;
  currentAuthority: () => ContextAuthority | Promise<ContextAuthority>;
  counter: ContextCounter | undefined;
}
const issued = new WeakMap<RuntimeContextGuard, GuardState>();

export function parseContextGuardPin(value: unknown): ContextGuardPin { return pinSchema.parse(value); }
export function assertRuntimeContextGuard(guard: RuntimeContextGuard): void {
  if (!issued.has(guard)) throw new Error('CONTEXT_GUARD_UNTRUSTED');
}

/** Trusted operator installation only. Never accept these arguments from a run or executor.
 * The provider must query the broker's CURRENT scoped Memory registry on every invocation,
 * include only usable current sources / approved claims with exact revision and content pins,
 * and omit missing, revoked, stale, invalidated or out-of-scope nodes. No executor I/O is used.
 * This handle is process-local. Its durable pin requires explicit reattachment after restart.
 */
export function createRuntimeContextGuard(options: {
  guardId: string; window: ContextWindow;
  currentAuthority: () => ContextAuthority | Promise<ContextAuthority>;
  counter?: ContextCounter;
}): RuntimeContextGuard {
  const window = structuredClone(options.window);
  const pin = parseContextGuardPin({ schemaVersion: 'context-guard/1', guardId: options.guardId, windowDigest: window.windowDigest,
    taskDigest: digest(window.packet.task), manifestDigest: digest(window.packet.manifest), bundleDigest: digest(window.packet.bundle) });
  const guard = Object.freeze({ pin: Object.freeze(pin) });
  issued.set(guard, { window, currentAuthority: options.currentAuthority, counter: options.counter });
  return guard;
}

/** Pure admission against a fresh broker snapshot; does not issue another gate or execute tools. */
export async function evaluateRuntimeContextGuard(guard: RuntimeContextGuard, required: ContextGuardPin, records: PlanningRecords): Promise<ContextValidation> {
  const blocked = (code: string): ContextValidation => ({ status: 'blocked', issues: [{ code, ref: required.guardId, message: code }] });
  const state = issued.get(guard);
  if (!state) return blocked('CONTEXT_GUARD_UNTRUSTED');
  if (digest(parseContextGuardPin(required)) !== digest(guard.pin)) return blocked('CONTEXT_GUARD_MISMATCH');
  if (required.taskDigest !== digest(records.task) || required.manifestDigest !== digest(records.manifest) || required.bundleDigest !== digest(records.context)) return blocked('CONTEXT_GUARD_RECORD_MISMATCH');
  try {
    // Clone the returned snapshot so asynchronous host activity cannot mutate this evaluation.
    const authority = structuredClone(await state.currentAuthority());
    return validateContextWindow(state.window, authority, state.counter);
  } catch { return blocked('CONTEXT_AUTHORITY_UNKNOWN'); }
}
