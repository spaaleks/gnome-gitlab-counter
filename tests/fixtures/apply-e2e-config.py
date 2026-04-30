#!/usr/bin/env python3

import json
import pathlib
import sys

import gi
from gi.repository import Gio

SCHEMA = 'org.gnome.shell.extensions.glcounter'
UUID = 'gitlabcounter@spaaleks.com'


def _settings():
    schema_dir = pathlib.Path.home() / '.local/share/gnome-shell/extensions' / UUID / 'schemas'
    if (schema_dir / 'gschemas.compiled').exists():
        source = Gio.SettingsSchemaSource.new_from_directory(
            str(schema_dir), Gio.SettingsSchemaSource.get_default(), False)
        schema = source.lookup(SCHEMA, False)
        if schema:
            return Gio.Settings.new_full(schema, None, None)
    return Gio.Settings.new(SCHEMA)


def main() -> None:
    cfg_path = pathlib.Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text())
    settings = _settings()

    instances = cfg.get('instances', [])
    if instances:
        settings.set_string('instances', json.dumps(instances, ensure_ascii=False))
        print(f'Set instances ({len(instances)} entries, tokens inline)')

    interval = cfg.get('poll_interval', cfg.get('poll-interval'))
    if interval is not None:
        settings.set_int('poll-interval', int(interval))
        print(f'Set poll-interval={interval}')

    Gio.Settings.sync()


if __name__ == '__main__':
    main()
