import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {state, USER_ICON_DIR} from './state.js';
import {L} from './labels.js';

export function listAvailableIcons() {
    const result = new Set();
    const dirs = [state.extensionPath + '/icons', USER_ICON_DIR];
    for (const dir of dirs) {
        try {
            const en = Gio.File.new_for_path(dir)
                .enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null)) !== null) {
                const name = info.get_name();
                if (name.toLowerCase().endsWith('.svg')) result.add(name);
            }
        } catch (_) {}
    }
    return Array.from(result).sort();
}

function resolveIconPathForPreview(filename) {
    const userPath = USER_ICON_DIR + '/' + filename;
    try {
        if (Gio.File.new_for_path(userPath).query_exists(null)) return userPath;
    } catch (_) {}
    return state.extensionPath + '/icons/' + filename;
}

function previewColor() {
    try {
        return Adw.StyleManager.get_default().get_dark() ? '#e6e6e6' : '#3d3846';
    } catch (_) {
        return '#888888';
    }
}

function tintedPreviewPath(sourcePath) {
    const [ok, contents] = GLib.file_get_contents(sourcePath);
    if (!ok) return sourcePath;
    const text = new TextDecoder().decode(contents);
    if (!/currentColor/i.test(text)) return sourcePath;

    const color = previewColor();
    const cacheDir = GLib.get_user_cache_dir() + '/glcounter/preview-tints';
    GLib.mkdir_with_parents(cacheDir, 0o700);
    const basename = GLib.path_get_basename(sourcePath).replace(/\.svg$/i, '');
    const tag = color.replace(/[^a-z0-9]/gi, '');
    const cached = `${cacheDir}/${basename}-${tag}.svg`;

    try {
        const srcInfo = Gio.File.new_for_path(sourcePath)
            .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        const cacheInfo = Gio.File.new_for_path(cached)
            .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        if (cacheInfo.get_attribute_uint64('time::modified') >=
            srcInfo.get_attribute_uint64('time::modified')) {
            return cached;
        }
    } catch (_) {}

    try {
        GLib.file_set_contents(cached, text.replace(/currentColor/gi, color));
        return cached;
    } catch (_) {
        return sourcePath;
    }
}

function makeIconFactory() {
    const factory = new Gtk.SignalListItemFactory();
    factory.connect('setup', (_f, listItem) => {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });
        const image = new Gtk.Image({pixel_size: 16});
        const label = new Gtk.Label({xalign: 0});
        box.append(image);
        box.append(label);
        listItem.set_child(box);
    });
    factory.connect('bind', (_f, listItem) => {
        const box = listItem.get_child();
        const image = box.get_first_child();
        const label = box.get_last_child();
        const stringObj = listItem.get_item();
        const text = stringObj.get_string();
        label.set_label(text);
        if (text === L('common.noIcon')) {
            image.clear();
        } else {
            try {
                image.set_from_file(tintedPreviewPath(resolveIconPathForPreview(text)));
            } catch (_) {
                image.clear();
            }
        }
    });
    return factory;
}

export function iconPickerRow(title, current, onChange) {
    const row = new Adw.ActionRow({title});

    let icons = listAvailableIcons();
    const buildItems = () => [L('common.noIcon'), ...icons];

    const dropdown = new Gtk.DropDown({
        model: Gtk.StringList.new(buildItems()),
        factory: makeIconFactory(),
        valign: Gtk.Align.CENTER,
    });

    const initialIdx = current ? (icons.indexOf(current) + 1) : 0;
    if (initialIdx >= 1) dropdown.set_selected(initialIdx);

    const sigId = dropdown.connect('notify::selected', () => {
        const idx = dropdown.get_selected();
        onChange(idx === 0 ? '' : icons[idx - 1]);
    });

    const selectIcon = (filename) => {
        icons = listAvailableIcons();
        dropdown.block_signal_handler(sigId);
        dropdown.set_model(Gtk.StringList.new(buildItems()));
        const idx = icons.indexOf(filename) + 1;
        if (idx >= 1) dropdown.set_selected(idx);
        dropdown.unblock_signal_handler(sigId);
        onChange(filename);
    };

    const uploadBtn = new Gtk.Button({
        icon_name: 'document-open-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: L('dialog.icon.uploadTooltip'),
    });
    uploadBtn.connect('clicked', () => {
        const dialog = new Gtk.FileChooserNative({
            title: L('dialog.icon.title'),
            action: Gtk.FileChooserAction.OPEN,
            transient_for: state.window,
            accept_label: L('dialog.icon.accept'),
            cancel_label: L('common.cancel'),
        });
        const filter = new Gtk.FileFilter();
        filter.set_name(L('dialog.icon.filterName'));
        filter.add_pattern('*.svg');
        filter.add_mime_type('image/svg+xml');
        dialog.add_filter(filter);
        dialog.connect('response', (d, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                const src = d.get_file();
                const basename = src.get_basename();
                try {
                    GLib.mkdir_with_parents(USER_ICON_DIR, 0o700);
                    const dest = Gio.File.new_for_path(USER_ICON_DIR + '/' + basename);
                    src.copy(dest, Gio.FileCopyFlags.OVERWRITE, null, null);
                    selectIcon(basename);
                } catch (e) {
                    logError(e, 'GLCounter: icon upload failed');
                }
            }
            d.destroy();
        });
        dialog.show();
    });

    row.add_suffix(dropdown);
    row.add_suffix(uploadBtn);
    row.set_activatable_widget(dropdown);
    return row;
}
