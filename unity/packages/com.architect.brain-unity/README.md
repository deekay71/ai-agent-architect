# Architect Brain Unity adapter 0.2.0-preview.1

This UPM package is the Editor observation adapter. The reusable Context/Planning/Knowledge/Memory Brain runs in the separate Node host distribution. No runtime game component, Editor startup hook, subprocess, network call, package installation, Play or build is started by this package.

Unity 6000.0 is the declared minimum. Standalone SDK compilation is checked against 6000.0.84f1; actual Unity import and menu execution are pending. Other versions and platforms are not runtime accepted. The package uses only Unity built-in Editor/Engine APIs; it has no UPM dependencies.

After host bootstrap, invoke **Tools → AI Agent Brain → Export Editor Observation** explicitly. It creates a new `.architect/observations/<id>.json` with Editor/scene/package metadata. This is project-produced data; it cannot establish independent verifier, gameplay, input, recovery or owner authority. Ingest it with the host CLI using its relative path and a source ID.

Install from the versioned distribution only into the specifically authorized fresh project: Package Manager → Add package from disk → select this `package.json`. Do not import the Node host or historical Unity fixtures into Assets. Read the distribution SETUP.md, readiness matrix and session starter first. Configure no MCP server, credentials or security settings automatically; the agent session must expose the explicitly selected Assistant Unity MCP and verify project identity before native actions.
