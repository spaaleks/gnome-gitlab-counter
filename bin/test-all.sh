#!/usr/bin/env bash
set -euo pipefail

# Run the e2e harness across the matrix.
#
#   ./bin/test-all.sh                 # sequential, default smoke.sh
#   ./bin/test-all.sh enable.sh       # sequential, custom test
#   PARALLEL=1 ./bin/test-all.sh      # all versions concurrently

TEST=${1:-smoke.sh}
PARALLEL=${PARALLEL:-0}
VERSIONS=(42 43 44 45 46 47 48 49 50)

run_sequential() {
    declare -gA RESULT=()
    for n in "${VERSIONS[@]}"; do
        if ./bin/test-version.sh "$n" "$TEST"; then
            RESULT[$n]=PASS
        else
            RESULT[$n]=FAIL
        fi
    done
}

run_parallel() {
    declare -gA RESULT=()
    mkdir -p tmp/test-logs
    for n in "${VERSIONS[@]}"; do
        ( ./bin/test-version.sh "$n" "$TEST" >"tmp/test-logs/$n.log" 2>&1
            echo "$?" >"tmp/test-logs/$n.rc"
        ) &
    done
    wait
    for n in "${VERSIONS[@]}"; do
        rc=$(cat "tmp/test-logs/$n.rc" 2>/dev/null || echo 1)
        if [ "$rc" -eq 0 ]; then RESULT[$n]=PASS; else RESULT[$n]=FAIL; fi
    done
}

if [ "$PARALLEL" = "1" ]; then
    run_parallel
else
    run_sequential
fi

echo
echo "=== Test summary ==="
FAIL_COUNT=0
for n in "${VERSIONS[@]}"; do
    echo "GNOME $n: ${RESULT[$n]}"
    [[ "${RESULT[$n]}" == "FAIL" ]] && FAIL_COUNT=$((FAIL_COUNT + 1))
done

[[ $FAIL_COUNT -eq 0 ]]
