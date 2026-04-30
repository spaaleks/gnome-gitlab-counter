import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import {L} from './labels.js';

export function entryRow(title, value, onChange, password = false) {
    const row = new Adw.ActionRow({title});
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

export function comboRow(title, options, current, onChange) {
    const row = new Adw.ActionRow({title});
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

export function intRow(settings, key, title, min, max, step) {
    const row = new Adw.ActionRow({title});
    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(settings.get_int(key));
    spin.valign = Gtk.Align.CENTER;
    spin.connect('value-changed', () => settings.set_int(key, spin.get_value_as_int()));
    row.add_suffix(spin);
    row.set_activatable_widget(spin);
    return row;
}

export function ioRow(title, iconName, label, onClick) {
    const row = new Adw.ActionRow({title});
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

function rgbaToHex(rgba) {
    const r = Math.round(rgba.red * 255);
    const g = Math.round(rgba.green * 255);
    const b = Math.round(rgba.blue * 255);
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function colorRow(title, current, onChange) {
    const row = new Adw.ActionRow({title});

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
        const hex = rgbaToHex(colorBtn.get_rgba());
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
