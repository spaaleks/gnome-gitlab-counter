import GLib from 'gi://GLib';

export const SCHEMA = 'org.gnome.shell.extensions.glcounter';
export const USER_ICON_DIR = GLib.get_user_data_dir() + '/glcounter/icons';

export const state = {
    window: null,
    extensionPath: null,
};

export function instanceKey(inst) {
    return (inst.url || inst.name || 'default').trim();
}

export function getInstances(settings) {
    try {
        const arr = JSON.parse(settings.get_string('instances'));
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

export function setInstances(settings, arr) {
    settings.set_string('instances', JSON.stringify(arr));
}
