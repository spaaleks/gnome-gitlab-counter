import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {state} from './state.js';
import {getInstances, openUrl, substInstance} from './util.js';
import {fetchCount} from './api.js';
import {
    ClickableButton,
    buildCounterWidget,
    buildPrefix,
    makeCenterButton,
} from './widgets.js';

const POSITIONS = [
    'left-start', 'left-end',
    'center-start', 'center-end',
    'right-start', 'right-end',
    'clock-left', 'clock-right',
];
const END_OFFSET = 1000;

function isBalanced(pos) {
    return pos === 'clock-left' || pos === 'clock-right';
}

function resolvePosition(value) {
    const key = POSITIONS.includes(value) ? value : 'right-start';
    if (isBalanced(key)) return {key, balanced: true};
    const [box, where] = key.split('-');
    return {key, balanced: false, box, base: where === 'end' ? END_OFFSET : 0};
}

export function resetBalanced() {
    state.balancedSignalIds.forEach(({actor, id}) => {
        try { actor.disconnect(id); } catch (_) {}
    });
    state.balancedSignalIds = [];
    if (state.balancedActive && Main.panel && Main.panel._centerBox) {
        Main.panel._centerBox.translation_x = 0;
    }
    state.balancedActive = false;
}

export function buildUi() {
    state.counterButtons.forEach(c => c.cleanup && c.cleanup());
    resetBalanced();
    state.items.forEach(b => b.destroy());
    state.items = [];
    state.counterButtons = [];

    const counters = {};
    POSITIONS.forEach(k => { counters[k] = 0; });

    getInstances().forEach((inst, i) => {
        const resolved = resolvePosition(inst.position);
        if (resolved.balanced) {
            addInstanceBalanced(inst, resolved.key);
        } else {
            addInstanceRegular(inst, i, resolved, counters);
        }
    });
}

function addInstanceRegular(inst, i, resolved, counters) {
    const {key, box, base} = resolved;
    const nextIndex = () => base + (counters[key]++);

    const prefixId = `glcounter-${i}-prefix`;
    const prefixBtn = new ClickableButton(
        prefixId,
        buildPrefix(inst),
        () => {
            const baseUrl = (inst.url || '').replace(/\/+$/, '');
            if (baseUrl) openUrl(baseUrl + '/dashboard/merge_requests');
        },
        inst.name || ''
    );
    Main.panel.addToStatusArea(prefixId, prefixBtn, nextIndex(), box);
    state.items.push(prefixBtn);

    const instCounters = Array.isArray(inst.counters) ? inst.counters : [];
    instCounters.forEach((counter, ci) => {
        const id = `glcounter-${i}-c${ci}`;
        const {widget, setCount, cleanup} = buildCounterWidget(counter);
        const btn = new ClickableButton(
            id,
            widget,
            () => openUrl(substInstance(counter.targetUrl || '', inst)),
            counter.name || ''
        );
        Main.panel.addToStatusArea(id, btn, nextIndex(), box);
        state.items.push(btn);
        state.counterButtons.push({inst, counter, setCount, cleanup});
    });
}

function addInstanceBalanced(inst, key) {
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

    const prefixBtn = makeCenterButton(
        buildPrefix(inst),
        () => {
            const baseUrl = (inst.url || '').replace(/\/+$/, '');
            if (baseUrl) openUrl(baseUrl + '/dashboard/merge_requests');
        },
        inst.name || '',
    );
    addCenter(prefixBtn);

    const instCounters = Array.isArray(inst.counters) ? inst.counters : [];
    instCounters.forEach((counter) => {
        const {widget, setCount, cleanup} = buildCounterWidget(counter);
        const btn = makeCenterButton(
            widget,
            () => openUrl(substInstance(counter.targetUrl || '', inst)),
            counter.name || '',
        );
        addCenter(btn);
        state.counterButtons.push({inst, counter, setCount, cleanup});
    });

    const updateTranslation = () => {
        let totalWidth = 0;
        added.forEach(w => { totalWidth += w.get_width(); });
        centerBox.translation_x = (sign * totalWidth) / 2;
        return GLib.SOURCE_REMOVE;
    };
    added.forEach(w => {
        const id = w.connect('notify::allocation', updateTranslation);
        state.balancedSignalIds.push({actor: w, id});
    });
    GLib.idle_add(GLib.PRIORITY_DEFAULT, updateTranslation);

    state.items.push(...added);
    state.balancedActive = true;
}

export function refreshAll() {
    state.counterButtons.forEach(({inst, counter, setCount}) => {
        fetchCount(inst, counter, setCount);
    });
    return GLib.SOURCE_CONTINUE;
}

export function schedulePoll() {
    if (state.pollId) {
        GLib.Source.remove(state.pollId);
        state.pollId = 0;
    }
    const interval = Math.max(30, state.settings.get_int('poll-interval'));
    state.pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, refreshAll);
}
