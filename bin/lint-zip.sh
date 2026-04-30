#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENV="$ROOT/tmp/shexli-venv"
if [ ! -d "$VENV" ]; then
    echo "==> Creating shexli venv at $VENV"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q -U shexli
fi

SHEXLI="$VENV/bin/shexli"
fail=0
for zip in dist/glcounter-esm.zip dist/glcounter-legacy.zip; do
    if [ ! -f "$zip" ]; then
        echo "Missing $zip; run make zip first" >&2
        exit 1
    fi
    echo "==> Linting $zip"
    if ! "$SHEXLI" "$zip"; then
        fail=$((fail + 1))
    fi
done

[[ $fail -eq 0 ]]
