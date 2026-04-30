#!/usr/bin/env bash
set -euo pipefail
UUID=$(jq -r .uuid /work/metadata.json)
# GNOME <= 44 reports "State: ENABLED"; >= 46 reports "State: ACTIVE". Accept either.
gnome-extensions info "$UUID" | grep -qE "^\s*State:\s*(ENABLED|ACTIVE)\b"
