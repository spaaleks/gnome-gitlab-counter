#!/usr/bin/env bash
set -euo pipefail

UUID="gitlabcounter@spaaleks.com"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "==> Disabling extension"
gnome-extensions disable "$UUID" || true

echo "==> Removing $DEST_DIR"
rm -rf "$DEST_DIR"

echo
echo "Uninstalled. Reload GNOME Shell (Alt+F2 -> r on X11, log out on Wayland) to drop the running instance."
