import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const OUT_PATH = '/home/dev/artifacts/screenshot.png';
const MARKER_PATH = '/home/dev/artifacts/.screenshot-done';

export default class ScreenshotHelper extends Extension {
    enable() {
        // xdotool Escape doesn't reach the inner mutter on >= 49
        try {
            Main.overview.hide();
        } catch (_) {
            // Older shells where Main.overview isn't available — ignore.
        }
        GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
            this._capture();
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() { }

    _capture() {
        try {
            const file = Gio.File.new_for_path(OUT_PATH);
            const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const screenshot = new Shell.Screenshot();
            screenshot.screenshot(false, stream, (_obj, res) => {
                try {
                    screenshot.screenshot_finish(res);
                    stream.close(null);
                    GLib.file_set_contents(MARKER_PATH, 'ok');
                } catch (e) {
                    GLib.file_set_contents(MARKER_PATH, `error: ${e.message}`);
                }
            });
        } catch (e) {
            GLib.file_set_contents(MARKER_PATH, `error: ${e.message}`);
        }
    }
}
