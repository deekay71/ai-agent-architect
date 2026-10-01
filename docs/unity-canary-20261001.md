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
