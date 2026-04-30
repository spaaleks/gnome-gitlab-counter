#!/usr/bin/env bash
set -euo pipefail

UUID=$(jq -r .uuid /work/metadata.json)
LOG=${SHELL_LOG:-/tmp/gnome-shell.log}
START_LINES=$(wc -l < "$LOG" 2>/dev/null || echo 0)

gnome-extensions disable "$UUID"
sleep 1
gnome-extensions enable "$UUID"
sleep 1

gnome-extensions info "$UUID" | grep -qE "^\s*State:\s*(ENABLED|ACTIVE)\b"

if [ -f "$LOG" ]; then
    new=$(tail -n "+$((START_LINES + 1))" "$LOG" || true)
    bad=$(printf '%s\n' "$new" \
        | grep -E "JS ERROR|Stack trace|threw an exception" \
        | grep -F "$UUID" \
    || true)
    if [ -n "$bad" ]; then
        echo "Lifecycle errors mentioning $UUID:" >&2
        echo "$bad" >&2
        exit 1
    fi
fi
