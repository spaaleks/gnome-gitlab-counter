import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {getInstances, setInstances} from './state.js';
import {L} from './labels.js';
import {comboRow, entryRow} from './widgets.js';
import {iconPickerRow} from './icons.js';
import {secretTokenRow} from './secrets.js';
import {counterRow} from './counter-row.js';

export function instanceRow(settings, inst, idx, rebuild) {
    const titleFallback = L('instance.titleFallback', idx + 1);
    const row = new Adw.ExpanderRow({
        title: inst.name || titleFallback,
        subtitle: inst.url || L('common.noUrl'),
    });

    const removeBtn = new Gtk.Button({
        icon_name: 'user-trash-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
        tooltip_text: L('instance.remove'),
    });
    removeBtn.connect('clicked', () => {
        const arr = getInstances(settings);
        arr.splice(idx, 1);
        setInstances(settings, arr);
        rebuild();
    });
    row.add_action(removeBtn);

    const updateInst = (key, val) => {
        const arr = getInstances(settings);
        if (!arr[idx]) return;
        arr[idx][key] = val;
        setInstances(settings, arr);
        if (key === 'name') row.set_title(val || titleFallback);
        if (key === 'url')  row.set_subtitle(val || L('common.noUrl'));
    };

    row.add_row(entryRow(L('instance.fields.name'), inst.name || '', v => updateInst('name', v)));
    row.add_row(entryRow(L('instance.fields.url'), inst.url || '', v => updateInst('url', v)));
    row.add_row(entryRow(L('instance.fields.username'), inst.username || '', v => updateInst('username', v)));
    row.add_row(secretTokenRow(inst));
    row.add_row(entryRow(L('instance.fields.label'), inst.label || '', v => updateInst('label', v)));
    row.add_row(iconPickerRow(L('instance.fields.icon'), inst.iconPath || '', v => updateInst('iconPath', v)));
    row.add_row(comboRow(
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
        row.add_row(counterRow(settings, idx, ci, counter, rebuild));
    });

    const addCounterRow = new Adw.ActionRow({title: L('instance.addCounter')});
    const addCounterBtn = new Gtk.Button({
        icon_name: 'list-add-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    addCounterBtn.connect('clicked', () => {
        const arr = getInstances(settings);
        if (!arr[idx]) return;
        if (!Array.isArray(arr[idx].counters)) arr[idx].counters = [];
        arr[idx].counters.push({glyph: '•', apiPath: '', targetUrl: ''});
        setInstances(settings, arr);
        rebuild();
    });
    addCounterRow.add_suffix(addCounterBtn);
    addCounterRow.set_activatable_widget(addCounterBtn);
    row.add_row(addCounterRow);

    return row;
}
