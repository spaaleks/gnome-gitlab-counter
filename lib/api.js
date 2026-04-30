import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import { getToken } from './secrets.js';
import { state } from './state.js';
import { resolveUrl } from './util.js';

export function stripNotApprovedByMe(apiPath, username) {
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

function sendJson(msg, onResult) {
    state.session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, state.cancellable,
        (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                if (msg.get_status() !== Soup.Status.OK) {
                    onResult(null, msg.get_status());
                    return;
                }
                const text = new TextDecoder().decode(bytes.get_data());
                onResult(JSON.parse(text), msg.get_status());
            } catch (e) {
                if (!e.matches || !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    logError(e, 'GLCounter: request failed');
                }
                onResult(null, 0);
            }
        });
}

export function fetchCount(inst, counter, onDone) {
    const token = getToken(inst);
    if (!inst.url || !inst.username || !token || !counter.apiPath) {
        onDone(null);
        return;
    }

    const { apiPath, needsApprovalFilter } = stripNotApprovedByMe(counter.apiPath, inst.username);
    const url = resolveUrl(apiPath, inst);
    const msg = Soup.Message.new('GET', url);
    if (msg === null) { onDone(null); return; }
    msg.request_headers.append('PRIVATE-TOKEN', token);
    msg.request_headers.append('Accept', 'application/json');

    sendJson(msg, (data, status) => {
        if (data === null) {
            if (status && status !== Soup.Status.OK) {
                log(`GLCounter: ${inst.name || '?'} HTTP ${status}`);
            }
            onDone(null);
            return;
        }
        if (!Array.isArray(data)) {
            onDone(typeof data.count === 'number' ? data.count : null);
            return;
        }
        if (!needsApprovalFilter) {
            onDone(data.length);
            return;
        }
        filterNotApprovedByMe(inst, data, onDone);
    });
}

function filterNotApprovedByMe(inst, mrs, onDone) {
    if (mrs.length === 0) { onDone(0); return; }
    const base = (inst.url || '').replace(/\/+$/, '');
    const token = getToken(inst);
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
        sendJson(msg, (data) => {
            if (data) {
                const approvedBy = Array.isArray(data.approved_by) ? data.approved_by : [];
                const approvedByMe = approvedBy.some(a => a.user && a.user.username === user);
                if (!approvedByMe) count++;
            }
            if (--pending === 0) onDone(count);
        });
    });
}
