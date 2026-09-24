#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

# Use an installed Node or the Codex desktop bundled runtime on this machine.
# This does not install or change a system runtime.
if ! command -v node >/dev/null 2>&1; then
  bundled_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ -x "$bundled_node/node" ]; then
    PATH="$bundled_node:$PATH"
    export PATH
  else
    echo 'Node 24 is required. Install it, then run pnpm install --frozen-lockfile --ignore-scripts.' >&2
    exit 1
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo 'pnpm 11.19.0 is required.' >&2
  exit 1
fi
exec pnpm "$@"
