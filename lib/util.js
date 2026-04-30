import Gio from 'gi://Gio';

import {state} from './state.js';

export function getInstances() {
    try {
        const arr = JSON.parse(state.settings.get_string('instances'));
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

export function substInstance(template, inst) {
    const base = (inst.url || '').replace(/\/+$/, '');
    return (template || '')
        .replace(/\{base\}/g, base)
        .replace(/\{user\}/g, encodeURIComponent(inst.username || ''));
}

export function resolveUrl(template, inst) {
    const base = (inst.url || '').replace(/\/+$/, '');
    const sub = substInstance(template, inst);
    if (!sub) return '';
    if (/^https?:\/\//i.test(sub)) return sub;
    return base + (sub.startsWith('/') ? sub : '/' + sub);
}

export function openUrl(url) {
    if (!url) return;
    try { Gio.AppInfo.launch_default_for_uri(url, null); }
    catch (e) { logError(e, 'GLCounter: failed to open ' + url); }
}

export function parseThreshold(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
