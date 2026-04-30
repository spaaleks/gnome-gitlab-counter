#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || { echo "Usage: $0 <gnome-version>" >&2; exit 1; }

GNOME=$1
declare -A FEDORA=([42]=36 [43]=37 [44]=38 [45]=39 [46]=40 [47]=41 [48]=42 [49]=43 [50]=44)
[[ -n "${FEDORA[$GNOME]:-}" ]] || { echo "Unknown GNOME version: $GNOME" >&2; exit 1; }

podman build \
  --build-arg FEDORA_VERSION="${FEDORA[$GNOME]}" \
  -t "gnome-ext-test:${GNOME}" \
  -f docker/Dockerfile .
