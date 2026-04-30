import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {state} from './lib/state.js';
import {loadSecrets} from './lib/secrets.js';
import {buildUi, refreshAll, resetBalanced, schedulePoll} from './lib/panel.js';

export default class GLCounterExtension extends Extension {
    enable() {
        state.extensionPath = this.path;
        state.settings = this.getSettings('org.gnome.shell.extensions.glcounter');
        state.session = new Soup.Session();
        state.session.timeout = 15;
        state.session.user_agent = 'GLCounter/1 (GNOME Shell Extension)';
        state.cancellable = new Gio.Cancellable();

        buildUi();
        loadSecrets(refreshAll);
        schedulePoll();

        state.listenerIds.push(state.settings.connect('changed::poll-interval', schedulePoll));
        state.listenerIds.push(state.settings.connect('changed::instances', () => {
            state.tokenCache.clear();
            buildUi();
            loadSecrets(refreshAll);
        }));
    }

    disable() {
        if (state.pollId) { GLib.Source.remove(state.pollId); state.pollId = 0; }
        if (state.cancellable) { state.cancellable.cancel(); state.cancellable = null; }
        state.session = null;
        if (state.settings) {
            state.listenerIds.forEach(id => state.settings.disconnect(id));
            state.listenerIds = [];
        }
        state.counterButtons.forEach(c => c.cleanup && c.cleanup());
        resetBalanced();
        state.items.forEach(b => b.destroy());
        state.items = [];
        state.counterButtons = [];
        state.tokenCache.clear();
        state.settings = null;
        state.extensionPath = null;
    }
}
