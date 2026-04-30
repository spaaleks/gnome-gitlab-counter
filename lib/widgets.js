import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {state} from './state.js';
import {parseThreshold} from './util.js';
import {
    DEFAULT_ICON_COLOR,
    buildIconWidget,
    resolveIconPath,
    textGlyph,
    tintedIconPath,
} from './icons.js';

const DEFAULT_WARN_COLOR = '#ffcc00';
const DEFAULT_CRITICAL_COLOR = '#ff5555';

export function attachTooltip(actor, text) {
    if (!text) return;
    let tooltip = null;
    let showTimerId = 0;
    const cancelShow = () => {
        if (showTimerId) { GLib.Source.remove(showTimerId); showTimerId = 0; }
    };
    const hide = () => {
        cancelShow();
        if (tooltip) { tooltip.destroy(); tooltip = null; }
    };
    actor.connect('enter-event', () => {
        if (tooltip || showTimerId) return Clutter.EVENT_PROPAGATE;
        showTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            showTimerId = 0;
            tooltip = new St.Label({text, style_class: 'glcounter-tooltip'});
            Main.uiGroup.add_child(tooltip);
            const [x, y] = actor.get_transformed_position();
            const w = actor.get_width();
            const h = actor.get_height();
            const [, tw] = tooltip.get_preferred_width(-1);
            tooltip.set_position(Math.round(x + (w - tw) / 2), Math.round(y + h + 4));
            return GLib.SOURCE_REMOVE;
        });
        return Clutter.EVENT_PROPAGATE;
    });
    actor.connect('leave-event', () => { hide(); return Clutter.EVENT_PROPAGATE; });
    actor.connect('destroy', hide);
}

export const ClickableButton = GObject.registerClass(
class ClickableButton extends PanelMenu.Button {
    _init(name, child, onClick, tooltipText) {
        super._init(0.0, name, true);
        this.add_child(child);
        this._onClick = onClick;
        this.connect('button-press-event', () => {
            try { this._onClick(); } catch (e) { logError(e); }
            return Clutter.EVENT_STOP;
        });
        attachTooltip(this, tooltipText);
    }
});

export function makeCenterButton(child, onClick, tooltipText) {
    const btn = new St.Button({
        style_class: 'panel-button glcounter-center-btn',
        can_focus: true,
        track_hover: true,
        reactive: true,
        x_expand: false,
        y_expand: true,
    });
    btn.set_child(child);
    btn.connect('clicked', () => {
        try { onClick(); } catch (e) { logError(e); }
    });
    attachTooltip(btn, tooltipText);
    return btn;
}

export function buildPrefix(inst) {
    const iconPath = resolveIconPath((inst.iconPath || '').trim());
    if (iconPath) {
        return buildIconWidget(iconPath);
    }
    if (inst.label) {
        return new St.Label({
            text: inst.label,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'glcounter-prefix',
        });
    }
    return buildIconWidget(state.extensionPath + '/icons/gitlab-logo.svg');
}

function resolveAlertColor(counter, n) {
    if (typeof n !== 'number') return null;
    const critV = parseThreshold(counter.thresholdCritical);
    if (critV !== null && n > critV) {
        const critC = (counter.alertColorCritical || counter.alertCriticalColor || '').trim();
        return critC || DEFAULT_CRITICAL_COLOR;
    }
    const warnV = parseThreshold(counter.threshold);
    if (warnV !== null && n > warnV) {
        return (counter.alertColor || '').trim() || DEFAULT_WARN_COLOR;
    }
    return null;
}

export function buildCounterWidget(counter) {
    const iconPath = (counter.iconPath || '').trim();
    const useIcon = iconPath.length > 0;
    const fullIconPath = useIcon ? resolveIconPath(iconPath) : '';

    const label = new St.Label({
        text: useIcon ? ' …' : `${textGlyph(counter.glyph)} …`,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'glcounter-label',
    });

    let icon = null;
    let widget;
    if (useIcon) {
        icon = new St.Icon({
            gicon: Gio.icon_new_for_string(fullIconPath),
            icon_size: 14,
            style_class: 'glcounter-counter-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        tintedIconPath(fullIconPath, DEFAULT_ICON_COLOR, (path) => {
            icon.set_gicon(Gio.icon_new_for_string(path));
        });
        const box = new St.BoxLayout({style_class: 'glcounter-counter'});
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
            tintedIconPath(fullIconPath, tintColor, (tinted) => {
                icon.set_gicon(Gio.icon_new_for_string(tinted));
            });
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

    const glyphText = useIcon ? '' : textGlyph(counter.glyph);
    const setCount = (n) => {
        const text = n === null ? '!' : String(n);
        label.set_text(useIcon ? ` ${text}` : `${glyphText} ${text}`);
        const color = resolveAlertColor(counter, n);
        if (color) startBlink(color);
        else stopBlink();
    };

    return {widget, setCount, cleanup: stopBlink};
}
