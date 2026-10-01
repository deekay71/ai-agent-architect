#!/usr/bin/env python3
"""PreToolUse hook: deny every new covered tool after budget admission closes."""
import json, sys
from pathlib import Path

try:
    closed = len(sys.argv) != 2 or Path(sys.argv[1]).read_text(encoding='utf8').strip() != 'open'
except OSError:
    closed = True
if closed:
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny', 'permissionDecisionReason': 'Unity budget admission closed'}}))
