#!/usr/bin/env bash
set -euo pipefail

resolve_repo() {
  if [[ -n "${GHCR_REPO:-}" ]]; then
    echo "$GHCR_REPO"
    return
  fi
  local url
  if url=$(git remote get-url origin 2>/dev/null); then
    url=${url%.git}
    if [[ "$url" =~ github\.com[:/]([^/]+/[^/]+)$ ]]; then
      echo "${BASH_REMATCH[1]}"
      return
    fi
  fi
  echo "Set GHCR_REPO=owner/repo or run inside a git repo with a github remote." >&2
  exit 1
}

REPO=$(resolve_repo)

declare -a PASSED=()
declare -a FAILED=()

for n in 42 43 44 45 46 47 48 49 50; do
  SRC="gnome-ext-test:${n}"
  DST="ghcr.io/${REPO}/gnome-ext-test:${n}"
  if podman tag "$SRC" "$DST" && podman push "$DST"; then
    echo "GNOME $n: pushed $DST"
    PASSED+=("$n")
  else
    echo "GNOME $n: FAILED push of $DST"
    FAILED+=("$n")
  fi
done

echo
echo "=== Push summary ==="
for n in "${PASSED[@]}"; do echo "GNOME $n: PASS"; done
for n in "${FAILED[@]}"; do echo "GNOME $n: FAIL"; done

[[ ${#FAILED[@]} -eq 0 ]]
