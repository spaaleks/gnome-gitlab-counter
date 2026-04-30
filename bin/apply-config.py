#!/usr/bin/env python3
"""Apply a local GLCounter preset into GSettings. Tokens go to libsecret."""

import json
import pathlib
import sys

import gi
gi.require_version('Secret', '1')
from gi.repository import Gio, Secret

SCHEMA = 'org.gnome.shell.extensions.glcounter'
UUID = 'gitlabcounter@spaaleks.com'

SECRET_SCHEMA = Secret.Schema.new(
    SCHEMA,
    Secret.SchemaFlags.NONE,
    {'instance': Secret.SchemaAttributeType.STRING},
)


def _instance_key(inst):
    return (inst.get('url') or inst.get('name') or 'default').strip()


def _load_settings():
    script_dir = pathlib.Path(__file__).resolve().parent
    project_dir = script_dir.parent
    candidates = [
        project_dir / 'schemas',
        pathlib.Path.home() / '.local/share/gnome-shell/extensions' / UUID / 'schemas',
    ]
    for p in candidates:
        if (p / 'gschemas.compiled').exists():
            source = Gio.SettingsSchemaSource.new_from_directory(
                str(p), Gio.SettingsSchemaSource.get_default(), False)
            schema = source.lookup(SCHEMA, False)
            if schema:
                return Gio.Settings.new_full(schema, None, None)
    return Gio.Settings.new(SCHEMA)


def _store_token(key, label, token):
    if not token:
        Secret.password_clear_sync(
            SECRET_SCHEMA, {'instance': key}, None)
        return
    Secret.password_store_sync(
        SECRET_SCHEMA,
        {'instance': key},
        Secret.COLLECTION_DEFAULT,
        f'GLCounter token: {label}',
        token,
        None,
    )


def main():
    script_dir = pathlib.Path(__file__).resolve().parent
    project_dir = script_dir.parent
    default_path = project_dir / 'config' / 'local.json'

    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    if not path.exists():
        example = project_dir / 'config' / 'example.json'
        sys.exit(
            f"Config not found: {path}\n"
            f"Copy the template and edit it, then re-run:\n"
            f"  cp {example} {default_path}"
        )

    data = json.loads(path.read_text())
    settings = _load_settings()

    if 'instances' in data:
        instances = data['instances']
        secret_moves = 0
        for inst in instances:
            token = (inst.get('token') or '').strip()
            if token:
                _store_token(_instance_key(inst), inst.get('name', ''), token)
                inst['token'] = ''
                secret_moves += 1
        instances_json = json.dumps(instances, ensure_ascii=False)
        settings.set_string('instances', instances_json)
        count = len(instances)
        suffix = 'y' if count == 1 else 'ies'
        print(f"Set instances ({count} entr{suffix})")
        if secret_moves:
            print(f"Moved {secret_moves} token(s) to GNOME Keyring")

    interval = data.get('poll_interval', data.get('poll-interval'))
    if interval is not None:
        settings.set_int('poll-interval', int(interval))
        print(f"Set poll-interval={interval}")

    Gio.Settings.sync()


if __name__ == '__main__':
    main()
