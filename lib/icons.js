import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {state} from './state.js';

export const DEFAULT_ICON_COLOR = '#e6e6e6';
export const USER_ICON_DIR = GLib.get_user_data_dir() + '/glcounter/icons';

export function resolveIconPath(path) {
    if (!path) return null;
    if (path.startsWith('/')) return path;
    const userPath = USER_ICON_DIR + '/' + path;
    if (Gio.File.new_for_path(userPath).query_exists(null)) return userPath;
    return state.extensionPath + '/icons/' + path;
}

export function buildIconWidget(iconPath, height = 14) {
    return new St.Widget({
        style_class: 'glcounter-logo',
        style: `background-image: url("${iconPath}"); ` +
               `background-size: contain; ` +
               `background-repeat: no-repeat; ` +
               `background-position: center center;`,
        width: height,
        height,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: false,
        y_expand: false,
    });
}

export function textGlyph(glyph) {
    if (!glyph) return '•';
    return glyph.replace(/[︎️]/g, '') + '︎';
}

function cachePathFor(sourcePath, color) {
    const cacheDir = GLib.get_user_cache_dir() + '/glcounter/tints';
    GLib.mkdir_with_parents(cacheDir, 0o700);
    const basename = GLib.path_get_basename(sourcePath).replace(/\.svg$/i, '');
    const tag = color.replace(/[^a-z0-9]/gi, '');
    return `${cacheDir}/${basename}-${tag}.svg`;
}

function cacheIsFresh(sourcePath, cached) {
    try {
        const srcInfo = Gio.File.new_for_path(sourcePath)
            .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const cacheInfo = Gio.File.new_for_path(cached)
            .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        return cacheInfo.get_attribute_uint64('time::modified') >=
               srcInfo.get_attribute_uint64('time::modified');
    } catch (_) {
        return false;
    }
}

export function tintedIconPath(sourcePath, color, callback) {
    if (!color) { callback(sourcePath); return; }
    const cached = cachePathFor(sourcePath, color);
    if (cacheIsFresh(sourcePath, cached)) { callback(cached); return; }

    Gio.File.new_for_path(sourcePath).load_contents_async(null, (file, res) => {
        let bytes;
        try {
            [, bytes] = file.load_contents_finish(res);
        } catch (_) {
            callback(sourcePath);
            return;
        }
        let text = new TextDecoder().decode(bytes);
        text = text.replace(/currentColor/gi, color);
        text = text.replace(/fill="#[0-9a-fA-F]+"/g, `fill="${color}"`);
        text = text.replace(/fill:\s*#[0-9a-fA-F]+/g, `fill:${color}`);

        const dest = Gio.File.new_for_path(cached);
        const buf = new TextEncoder().encode(text);
        dest.replace_contents_bytes_async(
            new GLib.Bytes(buf),
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null,
            (f, res2) => {
                try { f.replace_contents_finish(res2); callback(cached); }
                catch (_) { callback(sourcePath); }
            },
        );
    });
}
