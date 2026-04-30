import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Secret from 'gi://Secret';

import {state, getInstances, instanceKey} from './state.js';
import {L} from './labels.js';
import {SECRET_SCHEMA} from './secrets.js';

export function doExport(settings) {
    const dialog = new Gtk.FileChooserNative({
        title: L('dialog.export.title'),
        action: Gtk.FileChooserAction.SAVE,
        transient_for: state.window,
        accept_label: L('dialog.export.accept'),
        cancel_label: L('common.cancel'),
    });
    dialog.set_current_name(L('dialog.export.filename'));
    const filter = new Gtk.FileFilter();
    filter.set_name(L('common.json'));
    filter.add_pattern('*.json');
    dialog.add_filter(filter);

    dialog.connect('response', (d, response) => {
        if (response === Gtk.ResponseType.ACCEPT) {
            const file = d.get_file();
            try {
                const cleaned = getInstances(settings).map(i => {
                    const {token, ...rest} = i;
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
        d.destroy();
    });
    dialog.show();
}

export function doImport(settings, rebuild) {
    const dialog = new Gtk.FileChooserNative({
        title: L('dialog.import.title'),
        action: Gtk.FileChooserAction.OPEN,
        transient_for: state.window,
        accept_label: L('dialog.import.accept'),
        cancel_label: L('common.cancel'),
    });
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
                            const key = instanceKey(inst);
                            Secret.password_store(
                                SECRET_SCHEMA, {instance: key},
                                Secret.COLLECTION_DEFAULT,
                                `GLCounter token: ${inst.name || ''}`,
                                token, null, () => {},
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
        d.destroy();
    });
    dialog.show();
}
