# GNOME Gitlab Counter

[![E2E](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/e2e.yml/badge.svg)](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/e2e.yml)
[![Build images](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/build-images.yml/badge.svg)](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/build-images.yml)
[![Release](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/release.yml/badge.svg)](https://github.com/spaaleks/gnome-gitlab-counter/actions/workflows/release.yml)

GNOME Shell extension that puts Gitlab counters in your top bar: open issues, draft MRs, MRs ready for review, reviews assigned to you. One indicator per counter, your numbers at a glance, click to jump to the matching dashboard.

- Multiple Gitlab instances side by side
- Custom icons per counter (drop in your own SVGs)
- Threshold alerts that blink when something stacks up
- Tokens stored in GNOME Keyring, never in plain config

![screenshot.png](static/screenshot.png)

## Install

The recommended path is [extensions.gnome.org](https://extensions.gnome.org/). Search for **Gitlab Counter** and toggle it on.

Manual install (e.g. on offline machines):

1. Download the matching zip from the [latest release](https://github.com/spaaleks/gnome-gitlab-counter/releases/latest):
    - `glcounter-esm.zip` for GNOME Shell 45-50
    - `glcounter-legacy.zip` for GNOME Shell 42-44
2. Install with `gnome-extensions install <file>.zip --force`
3. Reload GNOME Shell (X11: `Alt+F2`, type `r`, press Enter; Wayland: log out and back in)
4. Enable: `gnome-extensions enable gitlabcounter@spaaleks.com`

### Requirements

- GNOME Shell 42-50
- `libsoup` (2.4 on shell ≤ 44, 3 on shell ≥ 45) and `libsecret`, both shipped with GNOME

## Configure

Open the preferences window:

```
gnome-extensions prefs gitlabcounter@spaaleks.com
```

For each Gitlab instance you set:

- **Name** | label shown in tooltips
- **Base URL** | `https://gitlab.example.com`
- **Username** | your Gitlab username
- **Personal access token** | needs `read_api` scope; stored in GNOME Keyring
- **Prefix label** or **Icon** | shown to the left of the counters in the panel
- **Panel position** | where the indicators sit (see table below)

For each counter inside an instance:

- **Glyph** or **Icon file** | what shows in the panel; icons override the glyph
- **API path / URL** | the Gitlab REST query whose `count` (or list length) becomes the panel number
- **Target URL** | opens in your browser when the counter is clicked
- **Warn / Critical thresholds + colors** | blink when the count crosses the value (blank thresholds disable the alert)

Both **API path** and **Target URL** support `{base}` (instance URL) and `{user}` (URL-encoded username).

### Panel positions

| Value          | Box    | Effect                                            |
| -------------- | ------ | ------------------------------------------------- |
| `left-start`   | left   | far left, before Activities                       |
| `left-end`     | left   | rightmost position of the left box                |
| `center-start` | center | left of the clock, pushes the clock right         |
| `center-end`   | center | right of the clock, pushes the clock left         |
| `right-start`  | right  | leftmost of the right box, closest to the clock   |
| `right-end`    | right  | far right of the panel                            |
| `clock-left`   | center | left of the clock, clock stays visually centered  |
| `clock-right`  | center | right of the clock, clock stays visually centered |

`clock-left` and `clock-right` insert items next to the clock and shift the whole center box so the clock stays optically centered.

## Recipes

Drop these into a counter under any instance. They use `{base}` and `{user}`, so the same counter works on any Gitlab once you've set the instance username.

**My open issues**

```json
{
    "glyph": "⎔",
    "iconPath": "issue.svg",
    "apiPath": "/api/v4/issues?state=opened&assignee_username={user}&scope=all&per_page=100",
    "targetUrl": "{base}/dashboard/work_items?sort=updated_desc&state=opened&assignee_username%5B%5D={user}"
}
```

**My merge requests in draft**

```json
{
    "glyph": "✎",
    "iconPath": "pencil.svg",
    "apiPath": "/api/v4/merge_requests?scope=all&state=opened&author_username={user}&wip=yes&per_page=100",
    "targetUrl": "{base}/dashboard/merge_requests/search?scope=all&state=opened&author_username={user}&draft=yes"
}
```

**My merge requests ready for review**

```json
{
    "glyph": "⇄",
    "iconPath": "merge.svg",
    "apiPath": "/api/v4/merge_requests?scope=all&state=opened&author_username={user}&wip=no&per_page=100",
    "targetUrl": "{base}/dashboard/merge_requests/search?scope=all&state=opened&author_username={user}&draft=no"
}
```

**Open reviews requested from me (not yet approved by me)**

```json
{
    "glyph": "👁",
    "iconPath": "eye.svg",
    "apiPath": "/api/v4/merge_requests?state=opened&scope=all&reviewer_username={user}&not%5Bapproved_by_usernames%5D%5B%5D={user}&wip=no&per_page=100",
    "targetUrl": "{base}/dashboard/merge_requests/search?draft=no&not%5Bapproved_by_usernames%5D%5B%5D={user}&reviewer_username={user}&scope=all&state=opened"
}
```

The reviews recipe uses a filter (`not[approved_by_usernames][]`) the public REST endpoint doesn't honour. The extension detects the pattern, strips it from the request, and filters the result client-side by hitting each MR's `/approvals` endpoint, so the count matches what the dashboard actually shows.

## Import / export

Preferences has an **Import / Export** section.

- **Export** writes the current instances and `poll_interval` to a JSON file. Tokens are stripped from the export.
- **Import** loads a JSON file, replacing the current configuration. Any `token` fields in the file are moved to GNOME Keyring on import.

The format matches `config/example.json`, so an export from one machine drops cleanly onto another.

## Custom icons

Bundled SVGs live under `icons/`. Reference them by filename in `iconPath` (`eye.svg`, `pencil.svg`, ...). To use your own, click the upload button next to the icon picker: the file is copied to `~/.local/share/glcounter/icons/` and immediately becomes available.

SVGs authored with `fill="currentColor"` participate in automatic recoloring (panel color and threshold-alert colors). Tinted copies are cached under `~/.cache/glcounter/tints/`, keyed by source mtime, so editing an SVG invalidates the cache on the next render.

## Troubleshooting

The extension logs to the GNOME Shell journal:

```
journalctl --user -f /usr/bin/gnome-shell | grep -i glcounter
```

A few error states surfaced in the panel:

- `!` instead of a number: the API call failed (HTTP error, network down, bad token, malformed URL). Check the journal.
- Counters stuck at `...`: the extension is still fetching, or the request is hanging. The default poll interval is 5 minutes; bump or trim it in **Polling**.

## License

MIT.
