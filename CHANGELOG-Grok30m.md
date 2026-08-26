# Grok30m changelog

Fork of [grok-build-vscode](https://github.com/phuryn/grok-build-vscode) by Paweł Huryn.
Upstream base at fork time: [`56d2b4f`](https://github.com/phuryn/grok-build-vscode/commit/56d2b4f) (upstream ~1.4.x).

Full upstream history: [README.upstream.md](README.upstream.md) and the [upstream repo](https://github.com/phuryn/grok-build-vscode).

## 2.0.2

- Restores the 1.5.7 workflow (editor-tab chat, Sessions sidebar, hide automation). 2.0.1 had pulled in community 3.18.0 and dropped those.
- Welcome screen: **Grok30m**, 30m fork of Grok Build (Community), linking to [thirtym/grok30m](https://github.com/thirtym/grok30m).

## 2.0.1

- Retracted. Synced community 3.18.0 by mistake; chat/sessions no longer matched Grok30m.

## 1.5.7

- Public release under **Grok30m** branding.
- Extension id: `grok30m.grok30m` (publisher `grok30m`).
- Documentation: README, LICENSE attribution, install from VSIX.

## 1.5.6

- **Editor-tab chat** — `grok.preferredLocation: "panel"` (default): one editor tab per session.
- **Sessions sidebar** — `grok.sessionsSidebar: true` (default): dedicated history view.
- **Auto-session tagging** — classify review / deploy / robot sessions as `[Auto:tag] …`.
- **Hide automation** — `grok.hideAutoSessions: true` (default): filter tagged sessions.
- **mtime repair** — tag writes restore `summary.json` mtime from `updated_at`.
- **Taller composer** — resizable chat input.
- **Commands** — `grok.panel.open`, `grok.sidebar.open`.
- **Retroactive tagging** — `scripts/tag-sessions.py --days N --cwd /path [--dry-run]`.
