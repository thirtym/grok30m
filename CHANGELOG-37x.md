# 37x fork changelog

Local fork of [grok-build-vscode](https://github.com/phuryn/grok-build-vscode).
Upstream base at fork time: `56d2b4f` (upstream ~1.4.x).

## 1.5.6 (37x-local)

- **Editor-tab chat** — `grok.preferredLocation: "panel"` (default): one editor tab per session, Claude Code style.
- **Sessions sidebar** — `grok.sessionsSidebar: true` (default): dedicated history view; in-chat clock dropdown disabled when on.
- **Auto-session tagging** — classify review / deploy / robot sessions; display as `[Auto:tag] …`.
- **Hide automation** — `grok.hideAutoSessions: true` (default): filter tagged sessions from the list (active session stays visible).
- **mtime repair** — tag writes restore `summary.json` mtime from logical `updated_at` so pagination order stays correct.
- **Taller composer** — resizable input area in chat.
- **Commands** — `grok.panel.open`, `grok.sidebar.open`; `grok.open` uses preferred location.
- **Retroactive tagging** — `scripts/tag-sessions.py --days N --cwd /path [--dry-run]`.

Publisher `37x-local` / extension id `37x-local.grok-vscode-37x` — installs separately from marketplace `PawelHuryn.grok-vscode-phuryn`.
