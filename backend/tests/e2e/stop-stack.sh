#!/bin/bash
# Stops everything start-stack.sh launched.
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/logs/pids" ] && xargs kill < "$HERE/logs/pids" 2>/dev/null
rm -f "$HERE/logs/pids"
echo "Stopped."
