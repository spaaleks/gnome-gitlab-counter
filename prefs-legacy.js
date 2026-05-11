'use strict';

const { Adw, Gtk, GLib, Gio, Gdk, Secret } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

let _window = null;
const USER_ICON_DIR = GLib.get_user_data_dir() + '/glcounter/icons';
const _liveDialogs = new Set();

const SCHEMA = 'org.gnome.shell.extensions.glcounter';

const _labels = (() => {
    try {
        const [, contents] = GLib.file_get_contents(Me.path + '/labels.json');
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (e) {
        logError(e, 'GLCounter: failed to load labels.json');
        return {};
    }
})();
function L(key) {
    let s = _labels[key] || key;
    for (let i = 1; i < arguments.length; i++) {
        s = s.replace('%d', arguments[i]).replace('%s', arguments[i]);
    }
    return s;
}

let _secretSchema = null;
function _getSchema() {
    if (!_secretSchema) {
        _secretSchema = new Secret.Schema(
            SCHEMA,
            Secret.SchemaFlags.NONE,
            { instance: Secret.SchemaAttributeType.STRING },
        );
    }
    return _secretSchema;
}

function _instanceKey(inst) {
    return (inst.url || inst.name || 'default').trim();
}

function init() { }

function _getInstances(settings) {
    try {
        const arr = JSON.parse(settings.get_string('instances'));
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function _setInstances(settings, arr) {
    settings.set_string('instances', JSON.stringify(arr));
}

function fillPreferencesWindow(window) {
    _window = window;
    const settings = ExtensionUtils.getSettings(SCHEMA);
    const page = new Adw.PreferencesPage();
    window.add(page);

    const group = new Adw.PreferencesGroup({
        title: L('groups.instances.title'),
        description: L('groups.instances.description'),
    });
    page.add(group);

    const addInstanceRow = new Adw.ActionRow({
        title: L('groups.instances.add'),
    });
    const addInstanceBtn = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    addInstanceRow.add_suffix(addInstanceBtn);
    addInstanceRow.set_activatable_widget(addInstanceBtn);

    let instanceRows = [];

    const rebuild = () => {
        instanceRows.forEach(r => group.remove(r));
        instanceRows = [];
        try { group.remove(addInstanceRow); } catch (_) { }

        _getInstances(settings).forEach((inst, idx) => {
            const row = _instanceRow(settings, inst, idx, rebuild);
            group.add(row);
            instanceRows.push(row);
        });
        group.add(addInstanceRow);
    };

    addInstanceBtn.connect('clicked', () => {
        const arr = _getInstances(settings);
        arr.push({
            name: L('instance.defaultName', arr.length + 1),
            url: '',
            username: '',
            token: '',
            label: 'GL',
            iconPath: '',
            counters: [],
        });
        _setInstances(settings, arr);
        rebuild();
    });

    rebuild();

    const pollGroup = new Adw.PreferencesGroup({ title: L('groups.polling.title') });
    page.add(pollGroup);
    pollGroup.add(_intRow(settings, 'poll-interval', L('groups.polling.interval'), 30, 3600, 30));

    const ioGroup = new Adw.PreferencesGroup({
        title: L('groups.io.title'),
        description: L('groups.io.description'),
    });
    page.add(ioGroup);
    ioGroup.add(_ioRow(L('groups.io.exportTitle'), 'document-save-symbolic', L('groups.io.exportButton'), () => _doExport(settings)));
    ioGroup.add(_ioRow(L('groups.io.importTitle'), 'document-open-symbolic', L('groups.io.importButton'), () => _doImport(settings, rebuild)));

    window.set_default_size(820, 760);
}

function _ioRow(title, iconName, label, onClick) {
    const row = new Adw.ActionRow({ title });
    const btn = new Gtk.Button({
        icon_name: iconName,
        label,
        valign: Gtk.Align.CENTER,
    });
    btn.connect('clicked', onClick);
    row.add_suffix(btn);
    row.set_activatable_widget(btn);
    return row;
}

function _doExport(settings) {
    const dialog = new Gtk.FileChooserNative({
        title: L('dialog.export.title'),
        action: Gtk.FileChooserAction.SAVE,
        transient_for: _window,
        accept_label: L('dialog.export.accept'),
        cancel_label: L('common.cancel'),
    });
    _liveDialogs.add(dialog);
    dialog.set_current_name('glcounter-config.json');
    const filter = new Gtk.FileFilter();
    filter.set_name(L('common.json'));
    filter.add_pattern('*.json');
    dialog.add_filter(filter);

    dialog.connect('response', (d, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
            const file = d.get_file();
            try {
                const cleaned = _getInstances(settings).map(i => {
                    const { token, ...rest } = i;
                    return rest;
                });
                const data = {
                    instances: cleaned,
                    poll_interval: settings.get_int('poll-interval'),
                };
                const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
                file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (e) {
                logError(e, 'GLCounter: export failed');
            }
        }
        _liveDialogs.delete(d);
        d.destroy();
    });
    dialog.show();
}

function _doImport(settings, rebuild) {
    const dialog = new Gtk.FileChooserNative({
        title: L('dialog.import.title'),
        action: Gtk.FileChooserAction.OPEN,
        transient_for: _window,
        accept_label: L('dialog.import.accept'),
        cancel_label: L('common.cancel'),
    });
    _liveDialogs.add(dialog);
    const filter = new Gtk.FileFilter();
    filter.set_name(L('common.json'));
    filter.add_pattern('*.json');
    dialog.add_filter(filter);

    dialog.connect('response', (d, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
            const file = d.get_file();
            try {
                const [ok, contents] = file.load_contents(null);
                if (!ok) throw new Error('Could not read file');
                const text = new TextDecoder().decode(contents);
                const data = JSON.parse(text);

                if (Array.isArray(data.instances)) {
                    data.instances.forEach(inst => {
                        const token = (inst.token || '').trim();
                        if (token) {
                            const key = _instanceKey(inst);
                            Secret.password_store(
                                _getSchema(), { instance: key },
                                Secret.COLLECTION_DEFAULT,
                                `GLCounter token: ${inst.name || ''}`,
                                token, null, () => { },
                            );
                            inst.token = '';
                        }
                    });
                    settings.set_string('instances', JSON.stringify(data.instances));
                }

                const interval = data.poll_interval !== undefined
                    ? data.poll_interval
                    : data['poll-interval'];
                if (interval !== undefined) {
                    settings.set_int('poll-interval', Number(interval));
                }

                rebuild();
            } catch (e) {
                logError(e, 'GLCounter: import failed');
            }
        }
        _liveDialogs.delete(d);
        d.destroy();
    });
    dialog.show();
}

function _instanceRow(settings, inst, idx, rebuild) {
    const row = new Adw.ExpanderRow({
        title: inst.name || L('instance.titleFallback', idx + 1),
        subtitle: inst.url || L('common.noUrl'),
    });

    const removeBtn = new Gtk.Button({
        icon_name: 'user-trash-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: L('instance.remove'),
    });
    removeBtn.connect('clicked', () => {
        const arr = _getInstances(settings);
        arr.splice(idx, 1);
        _setInstances(settings, arr);
        rebuild();
    });
    row.add_action(removeBtn);

    const updateInst = (key, val) => {
        const arr = _getInstances(settings);
        if (!arr[idx]) return;
        arr[idx][key] = val;
        _setInstances(settings, arr);
        if (key === 'name') row.set_title(val || L('instance.titleFallback', idx + 1));
        if (key === 'url') row.set_subtitle(val || L('common.noUrl'));
    };

    row.add_row(_entryRow(L('instance.fields.name'), inst.name || '', v => updateInst('name', v)));
    row.add_row(_entryRow(L('instance.fields.url'), inst.url || '', v => updateInst('url', v)));
    row.add_row(_entryRow(L('instance.fields.username'), inst.username || '', v => updateInst('username', v)));
    row.add_row(_secretTokenRow(inst));
    row.add_row(_entryRow(L('instance.fields.label'), inst.label || '', v => updateInst('label', v)));
    row.add_row(_iconPickerRow(L('instance.fields.icon'), inst.iconPath || '', v => updateInst('iconPath', v)));
    row.add_row(_comboRow(
        L('instance.fields.position'),
        [
            'left-start', 'left-end',
            'center-start', 'center-end',
            'right-start', 'right-end',
            'clock-left', 'clock-right',
        ],
        inst.position || 'right-start',
        v => updateInst('position', v),
    ));

    const counters = Array.isArray(inst.counters) ? inst.counters : [];
    counters.forEach((counter, ci) => {
        row.add_row(_counterRow(settings, idx, ci, counter, rebuild));
    });

    const addCounterRow = new Adw.ActionRow({ title: L('instance.addCounter') });
    const addCounterBtn = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    addCounterBtn.connect('clicked', () => {
        const arr = _getInstances(settings);
        if (!arr[idx]) return;
        if (!Array.isArray(arr[idx].counters)) arr[idx].counters = [];
        arr[idx].counters.push({ glyph: '•', apiPath: '', targetUrl: '' });
        _setInstances(settings, arr);
        rebuild();
    });
    addCounterRow.add_suffix(addCounterBtn);
    addCounterRow.set_activatable_widget(addCounterBtn);
    row.add_row(addCounterRow);

    return row;
}

function _counterRow(settings, instIdx, cIdx, counter, rebuild) {
    const defaultTitle = L('counter.titleFallback', cIdx + 1);
    const title = (counter.name && counter.name.trim()) || defaultTitle;
    const sub = new Adw.ExpanderRow({
        title: `${title} (${counter.glyph || '•'})`,
        subtitle: (counter.apiPath || '').slice(0, 80),
    });

    const removeBtn = new Gtk.Button({
        icon_name: 'user-trash-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: L('counter.remove'),
    });
    removeBtn.connect('clicked', () => {
        const arr = _getInstances(settings);
        if (!arr[instIdx] || !arr[instIdx].counters) return;
        arr[instIdx].counters.splice(cIdx, 1);
        _setInstances(settings, arr);
        rebuild();
    });
    sub.add_action(removeBtn);

    const update = (key, val) => {
        const arr = _getInstances(settings);
        if (!arr[instIdx] || !arr[instIdx].counters || !arr[instIdx].counters[cIdx]) return;
        arr[instIdx].counters[cIdx][key] = val;
        _setInstances(settings, arr);
        if (key === 'name' || key === 'glyph') {
            const t = (arr[instIdx].counters[cIdx].name || '').trim() || defaultTitle;
            const g = arr[instIdx].counters[cIdx].glyph || '•';
            sub.set_title(`${t} (${g})`);
        }
        if (key === 'apiPath') sub.set_subtitle((val || '').slice(0, 80));
    };

    sub.add_row(_entryRow(L('counter.fields.name'), counter.name || '', v => update('name', v)));
    sub.add_row(_entryRow(L('counter.fields.glyph'), counter.glyph || '', v => update('glyph', v)));
    sub.add_row(_iconPickerRow(L('counter.fields.icon'), counter.iconPath || '', v => update('iconPath', v)));
    sub.add_row(_entryRow(L('counter.fields.api'), counter.apiPath || '', v => update('apiPath', v)));
    sub.add_row(_entryRow(L('counter.fields.target'), counter.targetUrl || '', v => update('targetUrl', v)));
    sub.add_row(_entryRow(
        L('counter.fields.warnThreshold'),
        counter.threshold != null ? String(counter.threshold) : '',
        v => update('threshold', v.trim() === '' ? null : Number(v)),
    ));
    sub.add_row(_colorRow(
        L('counter.fields.warnColor'),
        counter.alertColor || '',
        v => update('alertColor', v),
    ));
    sub.add_row(_entryRow(
        L('counter.fields.criticalThreshold'),
        counter.thresholdCritical != null ? String(counter.thresholdCritical) : '',
        v => update('thresholdCritical', v.trim() === '' ? null : Number(v)),
    ));
    sub.add_row(_colorRow(
        L('counter.fields.criticalColor'),
        counter.alertColorCritical || '',
        v => update('alertColorCritical', v),
    ));
    return sub;
}

function _secretTokenRow(inst) {
    const key = _instanceKey(inst);
    const row = new Adw.ActionRow({
        title: L('secret.title'),
        subtitle: L('secret.subtitle'),
    });
    const entry = new Gtk.Entry({
        valign: Gtk.Align.CENTER,
        hexpand: true,
        width_chars: 40,
        visibility: false,
    });
    entry.set_input_purpose(Gtk.InputPurpose.PASSWORD);

    Secret.password_lookup(_getSchema(), { instance: key }, null, (_s, result) => {
        try {
            const token = Secret.password_lookup_finish(result);
            if (token) entry.set_text(token);
        } catch (_) { }
    });

    const commit = () => {
        const value = entry.get_text();
        if (value) {
            Secret.password_store(
                _getSchema(), { instance: key },
                Secret.COLLECTION_DEFAULT,
                `GLCounter token: ${inst.name || ''}`,
                value, null, () => { },
            );
        } else {
            Secret.password_clear(_getSchema(), { instance: key }, null, () => { });
        }
    };
    entry.connect('activate', commit);
    const fc = new Gtk.EventControllerFocus();
    fc.connect('leave', commit);
    entry.add_controller(fc);

    row.add_suffix(entry);
    row.set_activatable_widget(entry);
    return row;
}

function _entryRow(title, value, onChange, password = false) {
    const row = new Adw.ActionRow({ title });
    const entry = new Gtk.Entry({
        text: value,
        valign: Gtk.Align.CENTER,
        hexpand: true,
        width_chars: 40,
        visibility: !password,
    });
    if (password) entry.set_input_purpose(Gtk.InputPurpose.PASSWORD);

    const commit = () => onChange(entry.get_text());
    entry.connect('activate', commit);
    const focusCtrl = new Gtk.EventControllerFocus();
    focusCtrl.connect('leave', commit);
    entry.add_controller(focusCtrl);

    row.add_suffix(entry);
    row.set_activatable_widget(entry);
    return row;
}

function _listAvailableIcons() {
    const result = new Set();
    const Me = ExtensionUtils.getCurrentExtension();
    const dirs = [Me.path + '/icons', USER_ICON_DIR];
    for (const dir of dirs) {
        try {
            const en = Gio.File.new_for_path(dir)
                .enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null)) !== null) {
                const name = info.get_name();
                if (name.toLowerCase().endsWith('.svg')) result.add(name);
            }
        } catch (_) { }
    }
    return Array.from(result).sort();
}

function _resolveIconPathForPreview(filename) {
    const userPath = USER_ICON_DIR + '/' + filename;
    try {
        if (Gio.File.new_for_path(userPath).query_exists(null)) return userPath;
    } catch (_) { }
    const Me = ExtensionUtils.getCurrentExtension();
    return Me.path + '/icons/' + filename;
}

function _previewColor() {
    try {
        return Adw.StyleManager.get_default().get_dark() ? '#e6e6e6' : '#3d3846';
    } catch (_) {
        return '#888888';
    }
}

function _tintedPreviewPath(sourcePath) {
    const [ok, contents] = GLib.file_get_contents(sourcePath);
    if (!ok) return sourcePath;
    const text = new TextDecoder().decode(contents);
    if (!/currentColor/i.test(text)) return sourcePath;

    const color = _previewColor();
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
    } catch (_) { }

    try {
        GLib.file_set_contents(cached, text.replace(/currentColor/gi, color));
        return cached;
    } catch (_) {
        return sourcePath;
    }
}

function _makeIconFactory() {
    const factory = new Gtk.SignalListItemFactory();
    factory.connect('setup', (_f, listItem) => {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });
        const image = new Gtk.Image({ pixel_size: 16 });
        const label = new Gtk.Label({ xalign: 0 });
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
                image.set_from_file(_tintedPreviewPath(_resolveIconPathForPreview(text)));
            } catch (_) {
                image.clear();
            }
        }
    });
    return factory;
}

function _iconPickerRow(title, current, onChange) {
    const row = new Adw.ActionRow({ title });

    let icons = _listAvailableIcons();
    const buildItems = () => [L('common.noIcon'), ...icons];

    const dropdown = new Gtk.DropDown({
        model: Gtk.StringList.new(buildItems()),
        factory: _makeIconFactory(),
        valign: Gtk.Align.CENTER,
    });

    const initialIdx = current ? (icons.indexOf(current) + 1) : 0;
    if (initialIdx >= 1) dropdown.set_selected(initialIdx);

    const sigId = dropdown.connect('notify::selected', () => {
        const idx = dropdown.get_selected();
        onChange(idx === 0 ? '' : icons[idx - 1]);
    });

    const selectIcon = (filename) => {
        icons = _listAvailableIcons();
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
            transient_for: _window,
            accept_label: L('dialog.icon.accept'),
            cancel_label: L('common.cancel'),
        });
        _liveDialogs.add(dialog);
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
            _liveDialogs.delete(d);
            d.destroy();
        });
        dialog.show();
    });

    row.add_suffix(dropdown);
    row.add_suffix(uploadBtn);
    row.set_activatable_widget(dropdown);
    return row;
}

function _rgbaToHex(rgba) {
    const r = Math.round(rgba.red * 255);
    const g = Math.round(rgba.green * 255);
    const b = Math.round(rgba.blue * 255);
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

function _colorRow(title, current, onChange) {
    const row = new Adw.ActionRow({ title });

    const entry = new Gtk.Entry({
        text: current,
        valign: Gtk.Align.CENTER,
        width_chars: 10,
        placeholder_text: L('common.default'),
    });

    const colorBtn = new Gtk.ColorButton({
        valign: Gtk.Align.CENTER,
        use_alpha: false,
    });

    const syncColorFromEntry = () => {
        const text = entry.get_text().trim();
        if (!text) return;
        const rgba = new Gdk.RGBA();
        if (rgba.parse(text)) colorBtn.set_rgba(rgba);
    };
    syncColorFromEntry();

    const commitEntry = () => onChange(entry.get_text().trim());
    entry.connect('activate', commitEntry);
    const fc = new Gtk.EventControllerFocus();
    fc.connect('leave', () => { commitEntry(); syncColorFromEntry(); });
    entry.add_controller(fc);

    colorBtn.connect('color-set', () => {
        const hex = _rgbaToHex(colorBtn.get_rgba());
        entry.set_text(hex);
        onChange(hex);
    });

    const clearBtn = new Gtk.Button({
        icon_name: 'edit-clear-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: L('common.reset'),
    });
    clearBtn.connect('clicked', () => {
        entry.set_text('');
        onChange('');
    });

    row.add_suffix(entry);
    row.add_suffix(colorBtn);
    row.add_suffix(clearBtn);
    return row;
}

function _comboRow(title, options, current, onChange) {
    const row = new Adw.ActionRow({ title });
    const model = Gtk.StringList.new(options);
    const dropdown = new Gtk.DropDown({
        model,
        valign: Gtk.Align.CENTER,
    });
    const idx = options.indexOf(current);
    if (idx >= 0) dropdown.set_selected(idx);
    dropdown.connect('notify::selected', () => {
        onChange(options[dropdown.get_selected()]);
    });
    row.add_suffix(dropdown);
    row.set_activatable_widget(dropdown);
    return row;
}

function _intRow(settings, key, title, min, max, step) {
    const row = new Adw.ActionRow({ title });
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(settings.get_int(key));
    spin.valign = Gtk.Align.CENTER;
    spin.connect('value-changed', () => settings.set_int(key, spin.get_value_as_int()));
    row.add_suffix(spin);
    row.set_activatable_widget(spin);
    return row;
}
