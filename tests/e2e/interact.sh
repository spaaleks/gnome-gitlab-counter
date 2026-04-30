#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# interact.sh -- placeholder for extension-specific UI interaction tests.
#
# This script is intentionally a stub. It exists so the CI matrix has a slot
# for interaction-level checks without forcing fabricated assertions today.
#
# When wiring this up, the goal is to drive the live nested gnome-shell with
# xdotool (or equivalent) and verify GLCounter's user-facing behaviour, e.g.:
#
#   * Click the GLCounter panel indicator and assert that its menu opens.
#   * Take a screenshot of the open menu (write to /work/artifacts/).
#   * Assert that the indicator label shows the expected counters once the
#     extension has fetched data (or a mocked response).
#   * Open the prefs dialog via `gnome-extensions prefs "$UUID"` and confirm
#     the window appears, then close it cleanly.
#   * Trigger a refresh action and verify the counters update.
#
# Until those interactions are implemented, exit 0 so the matrix stays green.
# -----------------------------------------------------------------------------

echo "interact.sh: TODO -- see header"
exit 0
