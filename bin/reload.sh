#!/usr/bin/env bash
set -euo pipefail

UUID="gitlabcounter@spaaleks.com"

echo "==> Soft reload (disable + enable)"
gnome-extensions disable "$UUID" 2>/dev/null || true
gnome-extensions enable "$UUID"

echo
echo "Soft reload done. This picks up:"
echo "  - GSettings value changes"
echo "  - Icon file updates"
echo "  - Stylesheet changes (usually)"
echo
echo "JS changes in extension.js may still need a full Shell restart:"
if [[ "${XDG_SESSION_TYPE:-}" == "x11" ]]; then
    echo "  X11: Alt+F2, type 'r', press Enter"
else
    echo "  Wayland: log out and back in (no live reload)"
fi
