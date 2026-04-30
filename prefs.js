import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SCHEMA, state, getInstances, setInstances} from './lib/prefs/state.js';
import {L, loadLabels} from './lib/prefs/labels.js';
import {ioRow, intRow} from './lib/prefs/widgets.js';
import {doExport, doImport} from './lib/prefs/io.js';
import {instanceRow} from './lib/prefs/instance-row.js';

export default class GLCounterPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        state.window = window;
        state.extensionPath = this.path;
        loadLabels(this.path);
        const settings = this.getSettings(SCHEMA);

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
            try { group.remove(addInstanceRow); } catch (_) {}

            getInstances(settings).forEach((inst, idx) => {
                const row = instanceRow(settings, inst, idx, rebuild);
                group.add(row);
                instanceRows.push(row);
            });
            group.add(addInstanceRow);
        };

        addInstanceBtn.connect('clicked', () => {
            const arr = getInstances(settings);
            arr.push({
                name: L('instance.defaultName', arr.length + 1),
                url: '',
                username: '',
                token: '',
                label: 'GL',
                iconPath: '',
                counters: [],
            });
            setInstances(settings, arr);
            rebuild();
        });

        rebuild();

        const pollGroup = new Adw.PreferencesGroup({title: L('groups.polling.title')});
        page.add(pollGroup);
        pollGroup.add(intRow(settings, 'poll-interval', L('groups.polling.interval'), 30, 3600, 30));

        const ioGroup = new Adw.PreferencesGroup({
            title: L('groups.io.title'),
            description: L('groups.io.description'),
        });
        page.add(ioGroup);
        ioGroup.add(ioRow(L('groups.io.exportTitle'), 'document-save-symbolic', L('groups.io.exportButton'), () => doExport(settings)));
        ioGroup.add(ioRow(L('groups.io.importTitle'), 'document-open-symbolic', L('groups.io.importButton'), () => doImport(settings, rebuild)));

        window.set_default_size(820, 760);
    }
}
