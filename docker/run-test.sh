#!/usr/bin/env bash
set -euo pipefail

UUID=$(jq -r .uuid /work/metadata.json)
GNOME_VERSION=$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)
export GNOME_VERSION

mkdir -p /home/dev/artifacts
SHELL_LOG=/tmp/gnome-shell.log
SCREENSHOT_TMP=/tmp/screenshot.png
export SHELL_LOG SCREENSHOT_TMP

SHELL_PID=""
MOCK_PID=""

capture_screenshot() {
    if [ "${GNOME_VERSION:-0}" -ge 49 ] && [ -f /home/dev/artifacts/screenshot.png ]; then
        return 0
    fi
    import -window root -display :99 "$SCREENSHOT_TMP" 2>/dev/null && return 0
    dbus-send --session --print-reply \
    --dest=org.gnome.Shell /org/gnome/Shell/Screenshot \
    org.gnome.Shell.Screenshot.Screenshot \
    boolean:true boolean:false "string:$SCREENSHOT_TMP" \
    2>/dev/null || true
}

publish() {
    [ -f "$1" ] && cp "$1" "$2" 2>/dev/null || true
}

cleanup() {
    local rc=$?
    capture_screenshot
    publish "$SCREENSHOT_TMP" /home/dev/artifacts/screenshot.png
    publish "$SHELL_LOG" /home/dev/artifacts/journal.log
    if [ -n "$SHELL_PID" ] && kill -0 "$SHELL_PID" 2>/dev/null; then
        kill "$SHELL_PID" 2>/dev/null || true
    fi
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
    fi
    pkill -x gnome-shell 2>/dev/null || true
    pkill -x Xvfb 2>/dev/null || true
    exit "$rc"
}
trap cleanup EXIT

# Install the extension
make -C /work install GNOME_MAJOR="$GNOME_VERSION"

# Install the screenshot-helper extension on >= 49 BEFORE shell
if [ "$GNOME_VERSION" -ge 49 ]; then
    HELPER_UUID="screenshot-helper@e2e.local"
    HELPER_DEST="$HOME/.local/share/gnome-shell/extensions/$HELPER_UUID"
    rm -rf "$HELPER_DEST"
    cp -r /work/tests/fixtures/screenshot-helper "$HELPER_DEST"
fi

# Wayland needs an XDG runtime dir owned by us with mode 0700.
export XDG_RUNTIME_DIR=/tmp/runtime-dev
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

# Older gnome-shell (42) crashes during init when XDG_SESSION_ID is unset
export XDG_SESSION_ID=c1
export XDG_SESSION_TYPE=wayland

# Xvfb may need /tmp/.X11-unix
if [ ! -d /tmp/.X11-unix ]; then
    sudo mkdir -p /tmp/.X11-unix
    sudo chmod 1777 /tmp/.X11-unix
fi

Xvfb :99 -screen 0 1200x800x24 &
export DISPLAY=:99
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1200x800@60
sleep 1

# Mock Gitlab API server
python3 /work/tests/fixtures/gitlab-mock/server.py >/tmp/mock.log 2>&1 &
MOCK_PID=$!

# Start a session bus we share with the polling shell so `gnome-extensions list`
# below can reach the nested gnome-shell.
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID

# Mark the first-run welcome tour as seen
gsettings set org.gnome.shell welcome-dialog-last-seen-version "$GNOME_VERSION" 2>/dev/null || true

# Launch nested gnome-shell.
#   43-44: --nested --wayland (no display-name flag)
#   45-48: same plus --wayland-display=wayland-99
#   49-50: --nested removed in mutter; --wayland alone is nested by default
export WAYLAND_DISPLAY=wayland-99
if [ "$GNOME_VERSION" -le 44 ]; then
    gnome-shell --nested --wayland --wayland-display=wayland-99 >"$SHELL_LOG" 2>&1 &
    elif [ "$GNOME_VERSION" -le 48 ]; then
    gnome-shell --nested --wayland --wayland-display=wayland-99 >"$SHELL_LOG" 2>&1 &
else
    # !!!
    # On headless mutter (>=49) Wayland clients spawned by gnome-shell don't
    # get their windows registered in the WM, so the prefs viewer never lands
    # in the Shell.Screenshot frame. Force GDK_BACKEND=x11 so the spawned
    # prefs window goes to Xvfb instead, where we capture it separately.
    GDK_BACKEND=x11 gnome-shell --wayland --wayland-display=wayland-99 \
    --headless --virtual-monitor 1200x800 --mode=user >"$SHELL_LOG" 2>&1 &
fi
SHELL_PID=$!

ready=0
for _ in $(seq 1 30); do
    if gnome-extensions list >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done
if [ "$ready" -ne 1 ]; then
    echo "gnome-shell did not become ready in time" >&2
    exit 1
fi

gnome-extensions enable "$UUID"

# Belt-and-suspenders: kill the Fedora welcome tour if it slipped through
pkill -x gnome-tour 2>/dev/null || true

# Apply config/e2e.json
if [ -f /work/config/e2e.json ]; then
    timeout 15 python3 /work/tests/fixtures/apply-e2e-config.py /work/config/e2e.json || true
fi

# Nested gnome-shell defaults into Activities Overview
xdotool key --delay 50 Escape 2>/dev/null || true
sleep 1
xdotool mousemove 10 200 2>/dev/null || true

gnome-extensions prefs "$UUID" >>"$SHELL_LOG" 2>&1 &

# Wait for the extension's async chain (and the prefs window to map).
sleep 5

# On mutter >= 49 the dbus Screenshot interface is locked down to outside
if [ "$GNOME_VERSION" -ge 49 ]; then
    rm -f /home/dev/artifacts/.screenshot-done
    gnome-extensions enable "screenshot-helper@e2e.local"
    for _ in $(seq 1 100); do
        [ -f /home/dev/artifacts/.screenshot-done ] && break
        sleep 0.1
    done
    rm -f /home/dev/artifacts/.screenshot-done
    import -window root -display :99 /home/dev/artifacts/prefs.png 2>/dev/null || true
fi

TEST_SCRIPT="${1:-/work/tests/e2e/smoke.sh}"
set +e
"$TEST_SCRIPT"
TEST_RC=$?
set -e

exit "$TEST_RC"
