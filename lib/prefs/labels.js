import GLib from 'gi://GLib';

let _labels = {};

export function loadLabels(extensionPath) {
    try {
        const [ok, contents] = GLib.file_get_contents(extensionPath + '/labels.json');
        if (ok) _labels = JSON.parse(new TextDecoder().decode(contents));
    } catch (e) {
        logError(e, 'GLCounter: failed to load labels.json');
    }
}

export function L(key, ...args) {
    let s = _labels[key] ?? key;
    args.forEach(v => { s = s.replace('%d', v).replace('%s', v); });
    return s;
}
