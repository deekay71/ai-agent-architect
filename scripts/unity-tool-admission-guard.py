#!/usr/bin/env python3
"""PreToolUse hook: deny every new covered tool after budget admission closes."""
import json, sys
from pathlib import Path

try:
    closed = len(sys.argv) != 2 or Path(sys.argv[1]).read_text(encoding='utf8').strip() != 'open'
except OSError:
    closed = True
flag = Path(sys.argv[1]) if len(sys.argv) == 2 else None
try:
    event = json.load(sys.stdin)
    tool_id = event.get('tool_use_id') or event.get('tool_id') or event.get('toolId') or 'unknown'
    tool_name = event.get('tool_name') or event.get('toolName') or 'unknown'
    turn_id = event.get('turn_id') or event.get('turnId') or 'unknown'
    if flag is not None:
        with flag.with_suffix('.hook-events.ndjson').open('a', encoding='utf8') as log:
            log.write(json.dumps({'toolUseId': str(tool_id)[:256], 'toolName': str(tool_name)[:256], 'turnId': str(turn_id)[:256], 'admission': 'closed' if closed else 'open'}, separators=(',', ':')) + '\n')
except Exception:
    # A hook logging failure must itself deny; hook errors otherwise fail open.
    closed = True
if closed:
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': 'Unity budget admission closed'}}))
