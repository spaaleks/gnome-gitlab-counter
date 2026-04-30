#!/usr/bin/env bash
set -euo pipefail

[[ $# -ge 1 && $# -le 2 ]] || { echo "Usage: $0 <gnome-version> [test-script]" >&2; exit 1; }

GNOME=$1
TEST=${2:-smoke.sh}
ARTIFACT_DIR="$PWD/tmp/artifacts/${GNOME}"
mkdir -p "$ARTIFACT_DIR"

glib-compile-schemas schemas/ 2>/dev/null || true

NAME="gnome-ext-test-${GNOME}-$$"

# Bind-mount perms inside a systemd-PID-1 container fight with systemd-tmpfiles
cleanup() {
    podman cp "$NAME:/home/dev/artifacts/." "$ARTIFACT_DIR/" 2>/dev/null || true
    podman stop -t 5 "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

podman run -d --rm \
--name "$NAME" \
--systemd=always \
-e "TZ=${TZ:-Europe/Vienna}" \
-v "$PWD:/work:Z" \
-v "$PWD/docker/run-test.sh:/home/dev/run-test.sh:Z,ro" \
"gnome-ext-test:${GNOME}" >/dev/null

ready=0
for _ in $(seq 1 30); do
    if podman exec "$NAME" loginctl >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done
[ "$ready" -eq 1 ] || { echo "logind did not start in container" >&2; exit 1; }

podman exec --user dev "$NAME" /home/dev/run-test.sh "/work/tests/e2e/${TEST}"
