#!/usr/bin/env bash
set -euo pipefail

# Visual regression checks against reference screenshots.
#
# Usage:
#   bin/visual-diff.sh              # check every version that has a reference
#   bin/visual-diff.sh 48           # check just one
#
# Locally:  npm install --prefix tests/visual   (one-time)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d tests/visual/node_modules ]; then
    echo "Installing visual-diff deps (one-time)..." >&2
    npm install --prefix tests/visual --silent
fi

versions=("$@")
if [ "${#versions[@]}" -eq 0 ]; then
    versions=(42 43 44 45 46 47 48 49 50)
fi

declare -a PASSED=()
declare -a FAILED=()
declare -a SKIPPED=()

check_one() {
    local v=$1 name=$2
    local ref="tests/visual/reference/$v/$name.png"
    local test="tmp/artifacts/$v/$name.png"
    local diff="tmp/artifacts/$v/$name-diff.png"

    if [ ! -f "$ref" ] && [ ! -f "$test" ]; then
        return 2
    fi
    if [ ! -f "$ref" ]; then
        echo "GNOME $v ($name): FAIL (artifact exists but no reference at $ref)"
        return 1
    fi
    if [ ! -f "$test" ]; then
        echo "GNOME $v ($name): FAIL (reference exists but no artifact at $test)"
        return 1
    fi

    if node tests/visual/visual-diff.js "$ref" "$test" "$diff"; then
        echo "GNOME $v ($name): PASS"
        return 0
    else
        echo "GNOME $v ($name): FAIL (diff exceeds threshold; see $diff)"
        return 1
    fi
}

for v in "${versions[@]}"; do
    fails=0
    skip=0
    for name in screenshot prefs; do
        set +e
        check_one "$v" "$name"
        rc=$?
        set -e
        case "$rc" in
            0) ;;
            1) fails=$((fails + 1)) ;;
            2) skip=$((skip + 1)) ;;
        esac
    done

    if [ "$skip" -eq 2 ]; then
        echo "GNOME $v: SKIP (no artifacts or references)"
        SKIPPED+=("$v")
    elif [ "$fails" -gt 0 ]; then
        FAILED+=("$v")
    else
        PASSED+=("$v")
    fi
done

echo
echo "=== Visual diff summary ==="
for v in "${PASSED[@]}";  do echo "GNOME $v: PASS"; done
for v in "${FAILED[@]}";  do echo "GNOME $v: FAIL"; done
for v in "${SKIPPED[@]}"; do echo "GNOME $v: SKIP"; done

[[ ${#FAILED[@]} -eq 0 ]]
