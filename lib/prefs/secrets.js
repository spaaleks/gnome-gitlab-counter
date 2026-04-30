import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Secret from 'gi://Secret';

import {SCHEMA, instanceKey} from './state.js';
import {L} from './labels.js';

export const SECRET_SCHEMA = new Secret.Schema(
    SCHEMA,
    Secret.SchemaFlags.NONE,
    {instance: Secret.SchemaAttributeType.STRING},
);

export function secretTokenRow(inst) {
    const key = instanceKey(inst);
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

    Secret.password_lookup(SECRET_SCHEMA, {instance: key}, null, (_s, result) => {
        try {
            const token = Secret.password_lookup_finish(result);
            if (token) entry.set_text(token);
        } catch (_) {}
    });

    const commit = () => {
        const value = entry.get_text();
        if (value) {
            Secret.password_store(
                SECRET_SCHEMA, {instance: key},
                Secret.COLLECTION_DEFAULT,
                `GLCounter token: ${inst.name || ''}`,
                value, null, () => {},
            );
        } else {
            Secret.password_clear(SECRET_SCHEMA, {instance: key}, null, () => {});
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
