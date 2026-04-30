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
  SRC="ghcr.io/${REPO}/gnome-ext-test:${n}"
  DST="gnome-ext-test:${n}"
  if podman pull "$SRC" && podman tag "$SRC" "$DST"; then
    echo "GNOME $n: pulled $SRC"
    PASSED+=("$n")
  else
    echo "GNOME $n: FAILED pull of $SRC"
    FAILED+=("$n")
  fi
done

echo
echo "=== Pull summary ==="
for n in "${PASSED[@]}"; do echo "GNOME $n: PASS"; done
for n in "${FAILED[@]}"; do echo "GNOME $n: FAIL"; done

[[ ${#FAILED[@]} -eq 0 ]]
