#!/usr/bin/env bash
set -euo pipefail

declare -a PASSED=()
declare -a FAILED=()

for n in 42 43 44 45 46 47 48 49 50; do
  if ./bin/build-image.sh "$n"; then
    PASSED+=("$n")
  else
    FAILED+=("$n")
  fi
done

echo
echo "=== Build summary ==="
for n in "${PASSED[@]}"; do echo "GNOME $n: PASS"; done
for n in "${FAILED[@]}"; do echo "GNOME $n: FAIL"; done

[[ ${#FAILED[@]} -eq 0 ]]
