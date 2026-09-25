#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  spike_node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ -x "$spike_node_bin/node" ]; then
    PATH="$spike_node_bin:$PATH"
    export PATH
  else
    echo 'Node 24 is required for these isolated spikes.' >&2
    exit 1
  fi
fi
node --input-type=module -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node 24")'
exec pnpm "$@"
