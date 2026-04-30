import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {getInstances, setInstances} from './state.js';
import {L} from './labels.js';
import {colorRow, entryRow} from './widgets.js';
import {iconPickerRow} from './icons.js';

export function counterRow(settings, instIdx, cIdx, counter, rebuild) {
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
        const arr = getInstances(settings);
        if (!arr[instIdx] || !arr[instIdx].counters) return;
        arr[instIdx].counters.splice(cIdx, 1);
        setInstances(settings, arr);
        rebuild();
    });
    sub.add_action(removeBtn);

    const update = (key, val) => {
        const arr = getInstances(settings);
        if (!arr[instIdx] || !arr[instIdx].counters || !arr[instIdx].counters[cIdx]) return;
        arr[instIdx].counters[cIdx][key] = val;
        setInstances(settings, arr);
        if (key === 'name' || key === 'glyph') {
            const t = (arr[instIdx].counters[cIdx].name || '').trim() || defaultTitle;
            const g = arr[instIdx].counters[cIdx].glyph || '•';
            sub.set_title(`${t} (${g})`);
        }
        if (key === 'apiPath') sub.set_subtitle((val || '').slice(0, 80));
    };

    sub.add_row(entryRow(L('counter.fields.name'), counter.name || '', v => update('name', v)));
    sub.add_row(entryRow(L('counter.fields.glyph'), counter.glyph || '', v => update('glyph', v)));
    sub.add_row(iconPickerRow(L('counter.fields.icon'), counter.iconPath || '', v => update('iconPath', v)));
    sub.add_row(entryRow(L('counter.fields.api'), counter.apiPath || '', v => update('apiPath', v)));
    sub.add_row(entryRow(L('counter.fields.target'), counter.targetUrl || '', v => update('targetUrl', v)));
    sub.add_row(entryRow(
        L('counter.fields.warnThreshold'),
        counter.threshold != null ? String(counter.threshold) : '',
        v => update('threshold', v.trim() === '' ? null : Number(v)),
    ));
    sub.add_row(colorRow(
        L('counter.fields.warnColor'),
        counter.alertColor || '',
        v => update('alertColor', v),
    ));
    sub.add_row(entryRow(
        L('counter.fields.criticalThreshold'),
        counter.thresholdCritical != null ? String(counter.thresholdCritical) : '',
        v => update('thresholdCritical', v.trim() === '' ? null : Number(v)),
    ));
    sub.add_row(colorRow(
        L('counter.fields.criticalColor'),
        counter.alertColorCritical || '',
        v => update('alertColorCritical', v),
    ));
    return sub;
}
