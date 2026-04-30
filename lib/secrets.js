import Secret from 'gi://Secret';

import {state} from './state.js';
import {getInstances} from './util.js';

export const SECRET_SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.glcounter',
    Secret.SchemaFlags.NONE,
    {instance: Secret.SchemaAttributeType.STRING},
);

export function instanceKey(inst) {
    return (inst.url || inst.name || 'default').trim();
}

export function getToken(inst) {
    const key = instanceKey(inst);
    if (state.tokenCache.has(key)) return state.tokenCache.get(key);
    return inst.token || '';
}

export function loadSecrets(onDone) {
    const instances = getInstances();
    if (instances.length === 0) { onDone && onDone(); return; }
    let pending = instances.length;
    instances.forEach(inst => {
        const key = instanceKey(inst);
        Secret.password_lookup(SECRET_SCHEMA, {instance: key}, null,
            (_s, result) => {
                try {
                    const token = Secret.password_lookup_finish(result);
                    if (token) state.tokenCache.set(key, token);
                } catch (e) {
                    logError(e, 'GLCounter: secret lookup failed');
                }
                if (--pending === 0) onDone && onDone();
            });
    });
}
