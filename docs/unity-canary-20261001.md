# Unity canary incident — 2026-10-01

The single approved IntegerClamp canary was dispatched once and stopped at the
native Codex CLI version gate. No retry was attempted.

The installed CLI reported `codex-cli 0.159.0`; the transport was pinned to
`codex-cli 0.158.0-alpha.2.1`. Unity CLI and Editor pins were unchanged. The
app server was never launched, so no model request, MCP call, Unity execution,
or broker receipt occurred. The native receipt records the preflight failure;
usage is unknown, while code flow establishes that model dispatch did not
begin. Empty raw app-server logs are expected for this failure mode.

The diagnostic version command was a later diagnostic-only repeat. Its captured
output is not evidence that the original failed check captured the same output.
Private raw artifacts remain under `.local/unity-canary-20261001-01`; only their
paths and hashes are summarized in the public evidence file.

Weekly quota moved from 31% to 33% across preparation, then remained 33%
across the failed canary. The hard stop remains 34%.

No second microtask, Editor spike, batch-2 execution, or replacement canary is
authorized by this record. The prior ten-task A/B/C approval remains withdrawn.
Git authentication was unavailable, so this handoff is committed locally only.

## Stable retry outcome

The one authorized compatibility retry used the dedicated pinned native
`@openai/codex@0.159.0` binary. Both same-turn `unity_compile_test` calls were
explicitly approved. The first returned the expected three failing tests and
exit 8; the second returned the same three test IDs passing with exit 0. Source
hashes and XML evidence bound the ordered stub-to-repair transition, and the
durable receipt audit passed.

The native transport then stopped at its 1.0-credit interruption threshold
(1.5-credit cap less a 0.5-credit reserve). Its observed counter was 1.033010
credits, but final settlement is not established: no `turn/completed` event was
recorded after the second tool call. This is a technical tool-proof pass and an
overall interrupted canary, so no follow-on tasks, spike, protocol continuation,
or automatic retry is authorized.

The isolated pin applies only to the canary runner. The default native transport
still points at the desktop CLI/version and cannot be treated as migrated for
the A/C harness.

## Current phase closure

The owner accepted the canary objective and accounts the full reserved 1.5
credits because final settlement was unknown. New transports now use the
isolated stable CLI pin. Weekly work is capped at 40%; the two-case A/C run is
blocked pending a fully bound ModuleReady record, completed checks, and a new
owner budget approval for its 387,439-token forecast. No scene/prefab spike or
batch-2 work is authorized in this phase.
