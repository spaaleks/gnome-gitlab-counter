'use strict';

imports.gi.versions.Soup = '2.4';

const { GObject, St, Gio, GLib, Clutter, Secret } = imports.gi;
const Soup = imports.gi.Soup;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

let _secretSchema = null;
function _getSchema() {
    if (!_secretSchema) {
        _secretSchema = new Secret.Schema(
            'org.gnome.shell.extensions.glcounter',
            Secret.SchemaFlags.NONE,
            { instance: Secret.SchemaAttributeType.STRING },
        );
    }
    return _secretSchema;
}

const _tokenCache = new Map();

function _instanceKey(inst) {
    return (inst.url || inst.name || 'default').trim();
}

function _getToken(inst) {
    const key = _instanceKey(inst);
    if (_tokenCache.has(key)) return _tokenCache.get(key);
    return inst.token || '';
}

function _loadSecrets(onDone) {
    const instances = _getInstances();
    if (instances.length === 0) { onDone && onDone(); return; }
    let pending = instances.length;
    instances.forEach(inst => {
        const key = _instanceKey(inst);
        Secret.password_lookup(_getSchema(), { instance: key }, null,
            (_s, result) => {
                try {
                    const token = Secret.password_lookup_finish(result);
                    if (token) _tokenCache.set(key, token);
                } catch (e) {
                    logError(e, 'GLCounter: secret lookup failed');
                }
                if (--pending === 0) onDone && onDone();
            });
    });
}

let _settings = null;
let _session = null;
let _pollId = 0;
let _items = [];
let _counterButtons = [];
let _listenerIds = [];
let _balancedSignalIds = [];
let _balancedActive = false;
let _balancedIdleId = 0;

const ClickableButton = GObject.registerClass(
class ClickableButton extends PanelMenu.Button {
    _init(name, child, onClick, tooltipText) {
        super._init(0.0, name, true);
        this.add_child(child);
        this._onClick = onClick;
        const pressId = this.connect('button-press-event', () => {
            try { this._onClick(); } catch (e) { logError(e); }
            return Clutter.EVENT_STOP;
        });
        const destroyId = this.connect('destroy', () => {
            try { this.disconnect(pressId); } catch (_) { }
            try { this.disconnect(destroyId); } catch (_) { }
        });
        _attachTooltip(this, tooltipText);
    }
});

function _attachTooltip(actor, text) {
    if (!text) return;
    let tooltip = null;
    let showTimerId = 0;
    const ids = [];
    const cancelShow = () => {
        if (showTimerId) { GLib.Source.remove(showTimerId); showTimerId = 0; }
    };
    const hide = () => {
        cancelShow();
        if (tooltip) { tooltip.destroy(); tooltip = null; }
    };
    ids.push(actor.connect('enter-event', () => {
        if (tooltip || showTimerId) return Clutter.EVENT_PROPAGATE;
        showTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            showTimerId = 0;
            tooltip = new St.Label({ text, style_class: 'glcounter-tooltip' });
            Main.uiGroup.add_child(tooltip);
            const [x, y] = actor.get_transformed_position();
            const w = actor.get_width();
            const h = actor.get_height();
            const [, tw] = tooltip.get_preferred_width(-1);
            tooltip.set_position(Math.round(x + (w - tw) / 2), Math.round(y + h + 4));
            return GLib.SOURCE_REMOVE;
        });
        return Clutter.EVENT_PROPAGATE;
    }));
    ids.push(actor.connect('leave-event', () => { hide(); return Clutter.EVENT_PROPAGATE; }));
    ids.push(actor.connect('destroy', () => {
        hide();
        ids.forEach(id => { try { actor.disconnect(id); } catch (_) { } });
    }));
}

function _openUrl(url) {
    if (!url) return;
    try { Gio.AppInfo.launch_default_for_uri(url, null); }
    catch (e) { logError(e, 'GLCounter: failed to open ' + url); }
}

function _getInstances() {
    try {
        const arr = JSON.parse(_settings.get_string('instances'));
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function _substInstance(template, inst) {
    const base = (inst.url || '').replace(/\/+$/, '');
    return (template || '')
        .replace(/\{base\}/g, base)
        .replace(/\{user\}/g, encodeURIComponent(inst.username || ''));
}

function _resolveUrl(template, inst) {
    const base = (inst.url || '').replace(/\/+$/, '');
    const sub = _substInstance(template, inst);
    if (!sub) return '';
    if (/^https?:\/\//i.test(sub)) return sub;
    return base + (sub.startsWith('/') ? sub : '/' + sub);
}

const USER_ICON_DIR = GLib.get_user_data_dir() + '/glcounter/icons';

function _resolveIconPath(path) {
    if (!path) return null;
    if (path.startsWith('/')) return path;
    const userPath = USER_ICON_DIR + '/' + path;
    if (Gio.File.new_for_path(userPath).query_exists(null)) return userPath;
    return Me.path + '/icons/' + path;
}

function _readSvgAspect(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (!ok) return 1;
        const text = new TextDecoder().decode(contents);
        const vb = text.match(/viewBox\s*=\s*["']([^"']+)["']/);
        if (vb) {
            const p = vb[1].trim().split(/[\s,]+/).map(Number);
            if (p.length === 4 && p[3] > 0) return p[2] / p[3];
        }
        const w = text.match(/<svg[^>]*\swidth\s*=\s*["']([0-9.]+)/);
        const h = text.match(/<svg[^>]*\sheight\s*=\s*["']([0-9.]+)/);
        if (w && h && parseFloat(h[1]) > 0) {
            return parseFloat(w[1]) / parseFloat(h[1]);
        }
    } catch (_) {}
    return 1;
}

function _buildIconWidget(iconPath, height = 14) {
    const aspect = _readSvgAspect(iconPath);
    const width = Math.max(1, Math.round(height * aspect));
    return new St.Widget({
        style_class: 'glcounter-logo',
        style: `background-image: url("${iconPath}"); ` +
               `background-size: contain; ` +
               `background-repeat: no-repeat; ` +
               `background-position: center center;`,
        width,
        height,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: false,
        y_expand: false,
    });
}

function _textGlyph(glyph) {
    if (!glyph) return '•';
    return glyph.replace(/[︎️]/g, '') + '︎';
}

const DEFAULT_ICON_COLOR = '#e6e6e6';

function _tintedIconPath(sourcePath, color) {
    if (!color) return sourcePath;
    const cacheDir = GLib.get_user_cache_dir() + '/glcounter/tints';
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

    const [ok, contents] = GLib.file_get_contents(sourcePath);
    if (!ok) return sourcePath;
    let text = new TextDecoder().decode(contents);
    text = text.replace(/currentColor/gi, color);
    text = text.replace(/fill="#[0-9a-fA-F]+"/g, `fill="${color}"`);
    text = text.replace(/fill:\s*#[0-9a-fA-F]+/g, `fill:${color}`);
    try {
        GLib.file_set_contents(cached, text);
        return cached;
    } catch (_) {
        return sourcePath;
    }
}

const DEFAULT_WARN_COLOR = '#ffcc00';
const DEFAULT_CRITICAL_COLOR = '#ff5555';

function _parseThreshold(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function _resolveAlertColor(counter, n) {
    if (typeof n !== 'number') return null;
    const critV = _parseThreshold(counter.thresholdCritical);
    if (critV !== null && n > critV) {
        const critC = (counter.alertColorCritical || counter.alertCriticalColor || '').trim();
        return critC || DEFAULT_CRITICAL_COLOR;
    }
    const warnV = _parseThreshold(counter.threshold);
    if (warnV !== null && n > warnV) {
        return (counter.alertColor || '').trim() || DEFAULT_WARN_COLOR;
    }
    return null;
}

function _buildPrefix(inst) {
    const iconPath = _resolveIconPath((inst.iconPath || '').trim());
    if (iconPath) {
        return _buildIconWidget(iconPath);
    }
    if (inst.label) {
        return new St.Label({
            text: inst.label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'glcounter-prefix',
        });
    }
    return _buildIconWidget(Me.path + '/icons/gitlab-logo.svg');
}

function _buildCounterWidget(counter) {
    const iconPath = (counter.iconPath || '').trim();
    const useIcon = iconPath.length > 0;
    const fullIconPath = useIcon ? _resolveIconPath(iconPath) : '';

    const label = new St.Label({
        text: useIcon ? ' …' : `${_textGlyph(counter.glyph)} …`,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'glcounter-label',
    });

    let icon = null;
    let widget;
    if (useIcon) {
        icon = new St.Icon({
            gicon: Gio.icon_new_for_string(_tintedIconPath(fullIconPath, DEFAULT_ICON_COLOR)),
            icon_size: 14,
            style_class: 'glcounter-counter-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const box = new St.BoxLayout({ style_class: 'glcounter-counter' });
        box.add_child(icon);
        box.add_child(label);
        widget = box;
    } else {
        widget = label;
    }

    const applyColor = (color) => {
        label.set_style(color ? `color: ${color}; font-weight: 700;` : '');
        if (icon) {
            const tintColor = color || DEFAULT_ICON_COLOR;
            const tinted = _tintedIconPath(fullIconPath, tintColor);
            icon.set_gicon(Gio.icon_new_for_string(tinted));
        }
    };

    let blinkId = 0;
    let blinkOn = false;
    let activeColor = null;
    const stopBlink = () => {
        if (blinkId) { GLib.Source.remove(blinkId); blinkId = 0; }
        applyColor(null);
        blinkOn = false;
        activeColor = null;
    };
    const startBlink = (color) => {
        if (activeColor === color && blinkId) return;
        if (blinkId) { GLib.Source.remove(blinkId); blinkId = 0; }
        activeColor = color;
        blinkOn = true;
        applyColor(color);
        blinkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            blinkOn = !blinkOn;
            applyColor(blinkOn ? color : null);
            return GLib.SOURCE_CONTINUE;
        });
    };

    const glyphText = useIcon ? '' : _textGlyph(counter.glyph);
    const setCount = (n) => {
        const text = n === null ? '!' : String(n);
        label.set_text(useIcon ? ` ${text}` : `${glyphText} ${text}`);
        const color = _resolveAlertColor(counter, n);
        if (color) startBlink(color);
        else stopBlink();
    };

    return { widget, setCount, cleanup: stopBlink };
}

function _stripNotApprovedByMe(apiPath, username) {
    const encUser = encodeURIComponent(username);
    const patterns = [
        `not[approved_by_usernames][]=${username}`,
        `not[approved_by_usernames][]=${encUser}`,
        `not%5Bapproved_by_usernames%5D%5B%5D=${username}`,
        `not%5Bapproved_by_usernames%5D%5B%5D=${encUser}`,
        `not[approved_by_usernames][]={user}`,
        `not%5Bapproved_by_usernames%5D%5B%5D={user}`,
    ];
    let stripped = false;
    let out = apiPath;
    for (const p of patterns) {
        if (out.includes(p)) {
            stripped = true;
            out = out.split(p).join('');
        }
    }
    out = out.replace(/&{2,}/g, '&').replace(/\?&/, '?').replace(/[?&]$/, '');
    return { apiPath: out, needsApprovalFilter: stripped };
}

// gnome-shell on F37+ (GNOME 43-44) preloads Soup 3 internally, so our
// `imports.gi.versions.Soup = '2.4'` pin is a no-op and we get the Soup 3
// API regardless. Detect at runtime and use whichever async pattern the
// session exposes.
function _doRequest(msg, onDone) {
    if (typeof _session.queue_message === 'function') {
        _session.queue_message(msg, (_s, m) => {
            const body = (m.response_body && m.response_body.data) || '';
            onDone(m.status_code, body);
        });
    } else {
        _session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
            try {
                const bytes = s.send_and_read_finish(res);
                const arr = bytes ? bytes.get_data() : null;
                const body = arr ? new TextDecoder().decode(arr) : '';
                onDone(msg.get_status(), body);
            } catch (e) {
                onDone(0, '');
            }
        });
    }
}

function _fetchCount(inst, counter, onDone) {
    const token = _getToken(inst);
    if (!inst.url || !inst.username || !token || !counter.apiPath) {
        onDone(null);
        return;
    }

    const { apiPath, needsApprovalFilter } = _stripNotApprovedByMe(counter.apiPath, inst.username);
    const url = _resolveUrl(apiPath, inst);
    const msg = Soup.Message.new('GET', url);
    if (msg === null) { onDone(null); return; }
    msg.request_headers.append('PRIVATE-TOKEN', token);
    msg.request_headers.append('Accept', 'application/json');
    _doRequest(msg, (status, body) => {
        if (status !== 200) {
            log(`GLCounter: ${inst.name || '?'} HTTP ${status}`);
            onDone(null);
            return;
        }
        try {
            const data = JSON.parse(body);
            if (!Array.isArray(data)) {
                onDone(data && typeof data.count === 'number' ? data.count : null);
                return;
            }
            if (!needsApprovalFilter) {
                onDone(data.length);
                return;
            }
            _filterNotApprovedByMe(inst, data, onDone);
        } catch (e) {
            logError(e, 'GLCounter: parse error');
            onDone(null);
        }
    });
}

function _filterNotApprovedByMe(inst, mrs, onDone) {
    if (mrs.length === 0) { onDone(0); return; }
    const base = (inst.url || '').replace(/\/+$/, '');
    const token = _getToken(inst);
    const user = inst.username;
    let pending = mrs.length;
    let count = 0;
    mrs.forEach(mr => {
        const url = `${base}/api/v4/projects/${mr.project_id}/merge_requests/${mr.iid}/approvals`;
        const msg = Soup.Message.new('GET', url);
        if (msg === null) {
            if (--pending === 0) onDone(count);
            return;
        }
        msg.request_headers.append('PRIVATE-TOKEN', token);
        msg.request_headers.append('Accept', 'application/json');
        _doRequest(msg, (status, body) => {
            if (status === 200) {
                try {
                    const data = JSON.parse(body);
                    const approvedBy = Array.isArray(data.approved_by) ? data.approved_by : [];
                    const approvedByMe = approvedBy.some(a => a.user && a.user.username === user);
                    if (!approvedByMe) count++;
                } catch (_) {}
            }
            if (--pending === 0) onDone(count);
        });
    });
}

function _refreshAll() {
    _counterButtons.forEach(({ inst, counter, setCount }) => {
        _fetchCount(inst, counter, setCount);
    });
    return GLib.SOURCE_CONTINUE;
}

function _schedulePoll() {
    if (_pollId) {
        GLib.Source.remove(_pollId);
        _pollId = 0;
    }
    const interval = Math.max(30, _settings.get_int('poll-interval'));
    _pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, _refreshAll);
}

const POSITIONS = [
    'left-start', 'left-end',
    'center-start', 'center-end',
    'right-start', 'right-end',
    'clock-left', 'clock-right',
];
const END_OFFSET = 1000;

function _isBalanced(pos) {
    return pos === 'clock-left' || pos === 'clock-right';
}

function _resolvePosition(value) {
    const key = POSITIONS.includes(value) ? value : 'right-start';
    if (_isBalanced(key)) return { key, balanced: true };
    const [box, where] = key.split('-');
    return { key, balanced: false, box, base: where === 'end' ? END_OFFSET : 0 };
}

function _resetBalanced() {
    _balancedSignalIds.forEach(({ actor, id }) => {
        try { actor.disconnect(id); } catch (_) {}
    });
    _balancedSignalIds = [];
    if (_balancedIdleId) {
        try { GLib.Source.remove(_balancedIdleId); } catch (_) {}
        _balancedIdleId = 0;
    }
    if (_balancedActive && Main.panel && Main.panel._centerBox) {
        Main.panel._centerBox.translation_x = 0;
    }
    _balancedActive = false;
}

function _buildUi() {
    _counterButtons.forEach(c => c.cleanup && c.cleanup());
    _resetBalanced();
    _items.forEach(b => b.destroy());
    _items = [];
    _counterButtons = [];

    const counters = {};
    POSITIONS.forEach(k => { counters[k] = 0; });

    _getInstances().forEach((inst, i) => {
        const resolved = _resolvePosition(inst.position);
        if (resolved.balanced) {
            _addInstanceBalanced(inst, i, resolved.key);
        } else {
            _addInstanceRegular(inst, i, resolved, counters);
        }
    });
}

function _addInstanceRegular(inst, i, resolved, counters) {
    const { key, box, base } = resolved;
    const nextIndex = () => base + (counters[key]++);

    const prefixId = `glcounter-${i}-prefix`;
    const prefixBtn = new ClickableButton(
        prefixId,
        _buildPrefix(inst),
        () => {
            const baseUrl = (inst.url || '').replace(/\/+$/, '');
            if (baseUrl) _openUrl(baseUrl + '/dashboard/merge_requests');
        },
        inst.name || ''
    );
    Main.panel.addToStatusArea(prefixId, prefixBtn, nextIndex(), box);
    _items.push(prefixBtn);

    const instCounters = Array.isArray(inst.counters) ? inst.counters : [];
    instCounters.forEach((counter, ci) => {
        const id = `glcounter-${i}-c${ci}`;
        const { widget, setCount, cleanup } = _buildCounterWidget(counter);
        const btn = new ClickableButton(
            id,
            widget,
            () => _openUrl(_substInstance(counter.targetUrl || '', inst)),
            counter.name || ''
        );
        Main.panel.addToStatusArea(id, btn, nextIndex(), box);
        _items.push(btn);
        _counterButtons.push({ inst, counter, setCount, cleanup });
    });
}

function _makeCenterButton(child, onClick, tooltipText) {
    const btn = new St.Button({
        style_class: 'panel-button glcounter-center-btn',
        can_focus: true,
        track_hover: true,
        reactive: true,
        x_expand: false,
        y_expand: true,
    });
    btn.set_child(child);
    const clickedId = btn.connect('clicked', () => {
        try { onClick(); } catch (e) { logError(e); }
    });
    const destroyId = btn.connect('destroy', () => {
        try { btn.disconnect(clickedId); } catch (_) { }
        try { btn.disconnect(destroyId); } catch (_) { }
    });
    _attachTooltip(btn, tooltipText);
    return btn;
}

function _addInstanceBalanced(inst, i, key) {
    const centerBox = Main.panel._centerBox;
    const sign = key === 'clock-left' ? -1 : 1;
    const added = [];

    const addCenter = (widget) => {
        if (key === 'clock-left') {
            const insertAt = added.length;
            centerBox.insert_child_at_index(widget, insertAt);
        } else {
            centerBox.add_child(widget);
        }
        added.push(widget);
    };

    const prefixBtn = _makeCenterButton(
        _buildPrefix(inst),
        () => {
            const baseUrl = (inst.url || '').replace(/\/+$/, '');
            if (baseUrl) _openUrl(baseUrl + '/dashboard/merge_requests');
        },
        inst.name || '',
    );
    addCenter(prefixBtn);

    const instCounters = Array.isArray(inst.counters) ? inst.counters : [];
    instCounters.forEach((counter, ci) => {
        const { widget, setCount, cleanup } = _buildCounterWidget(counter);
        const btn = _makeCenterButton(
            widget,
            () => _openUrl(_substInstance(counter.targetUrl || '', inst)),
            counter.name || '',
        );
        addCenter(btn);
        _counterButtons.push({ inst, counter, setCount, cleanup });
    });

    const updateTranslation = () => {
        let totalWidth = 0;
        added.forEach(w => { totalWidth += w.get_width(); });
        centerBox.translation_x = (sign * totalWidth) / 2;
        return GLib.SOURCE_REMOVE;
    };
    added.forEach(w => {
        const id = w.connect('notify::allocation', updateTranslation);
        _balancedSignalIds.push({ actor: w, id });
    });
    if (_balancedIdleId) {
        try { GLib.Source.remove(_balancedIdleId); } catch (_) { }
        _balancedIdleId = 0;
    }
    _balancedIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        _balancedIdleId = 0;
        return updateTranslation();
    });

    _items.push(...added);
    _balancedActive = true;
}

function init() {}

function enable() {
    _settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.glcounter');
    _session = new Soup.Session();
    _session.timeout = 15;
    _session.user_agent = 'GLCounter/1 (GNOME Shell Extension)';

    _buildUi();
    _loadSecrets(_refreshAll);
    _schedulePoll();

    _listenerIds.push(_settings.connect('changed::poll-interval', _schedulePoll));
    _listenerIds.push(_settings.connect('changed::instances', () => {
        _tokenCache.clear();
        _buildUi();
        _loadSecrets(_refreshAll);
    }));
}

function disable() {
    if (_pollId) { GLib.Source.remove(_pollId); _pollId = 0; }
    if (_session) { _session.abort(); _session = null; }
    if (_settings) {
        _listenerIds.forEach(id => _settings.disconnect(id));
        _listenerIds = [];
    }
    _counterButtons.forEach(c => c.cleanup && c.cleanup());
    _resetBalanced();
    _items.forEach(b => b.destroy());
    _items = [];
    _counterButtons = [];
    _settings = null;
}
