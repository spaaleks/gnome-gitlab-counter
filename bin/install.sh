#!/usr/bin/env bash
set -euo pipefail

UUID="gitlabcounter@spaaleks.com"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "==> Compiling GSettings schema"
glib-compile-schemas "$SRC_DIR/schemas/"

echo "==> Installing to $DEST_DIR"
mkdir -p "$DEST_DIR"
cp -r \
    "$SRC_DIR/metadata.json" \
    "$SRC_DIR/extension.js" \
    "$SRC_DIR/prefs.js" \
    "$SRC_DIR/stylesheet.css" \
    "$SRC_DIR/schemas" \
    "$SRC_DIR/icons" \
    "$DEST_DIR/"

SESSION="${XDG_SESSION_TYPE:-unknown}"

if gnome-extensions list 2>/dev/null | grep -Fxq "$UUID"; then
    echo "==> Enabling extension"
    gnome-extensions enable "$UUID"

    LOCAL_CFG="$SRC_DIR/config/local.json"
    if [[ -f "$LOCAL_CFG" ]]; then
        if command -v python3 >/dev/null 2>&1 && python3 -c "import gi" >/dev/null 2>&1; then
            echo "==> Applying $LOCAL_CFG"
            "$SRC_DIR/bin/apply-config.py" "$LOCAL_CFG"
        else
            echo "==> Skipping auto-import: python3 with PyGObject is required for bin/apply-config.py."
            echo "    Configure via the preferences window:"
            echo "      gnome-extensions prefs $UUID"
            echo "    The Import / Export section in prefs can load $LOCAL_CFG directly."
        fi
    else
        echo "==> No config/local.json — skipping preset import."
    fi

    echo
    echo "Done. Open preferences:"
    echo "  gnome-extensions prefs $UUID"
else
    echo "==> Files installed, but GNOME Shell hasn't picked up the extension yet."
    echo
    echo "Next steps:"
    if [[ "$SESSION" == "x11" ]]; then
        echo "  1. Reload Shell:   Alt+F2, type 'r', press Enter"
    else
        echo "  1. Reload Shell:   log out and back in (Wayland can't live-reload)"
    fi
    echo "  2. Re-run this script, or:  gnome-extensions enable $UUID"
    echo "  3. Open prefs:     gnome-extensions prefs $UUID"
fi
