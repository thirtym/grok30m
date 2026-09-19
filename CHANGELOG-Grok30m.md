# Grok30m changelog

Fork of [grok-build-vscode](https://github.com/phuryn/grok-build-vscode) by Paweł Huryn.
Upstream base at fork time: [`56d2b4f`](https://github.com/phuryn/grok-build-vscode/commit/56d2b4f) (upstream ~1.4.x).

Full upstream history: [README.upstream.md](README.upstream.md) and the [upstream repo](https://github.com/phuryn/grok-build-vscode).

## 2.1.2

- **Editor tab leaves Starting.** Sessions sidebar omits the in-tab history button; chat.js no longer throws on that missing node, so `ready` reaches the host.

## 2.1.1

- **Merge community 4.6.0** (auto-sync).
- **Grok30m UX kept:** editor-tab chat, Sessions sidebar, hide automated sessions.

## 2.1.0

- **Merge community 4.5.2** (Changes view, prompt-cache fix, Codex steer, model/effort chip, CLI updates from Settings, cloud/phone sign-in).
- **Grok30m UX kept:** editor-tab chat, Sessions sidebar, hide automated sessions.
- **Editor-tab chat leaves Starting.** Host messages go to the open tab, not the hidden sidebar view.
- **Chrome says Grok30m** (activity bar, command palette, Settings, About). Community is only listed as the upstream this build is based on.
- **About and Check for Updates show community status.** Settings → About fetches the latest community release and says up to date or behind. Check for Updates always includes that line. Startup still toasts once when community pulls ahead.
- **Auto-publish when community moves.** Daily Action checks for a new community release (no install on idle). When one exists it merges, keeps editor-tab chat (invariant tests), and attaches a vsix to GitHub Releases so installs can actually update.

## 2.0.3

- **One install per host, then it stays current.** Grok30m fetches [GitHub Releases](https://github.com/thirtym/grok30m/releases/latest) on startup (this computer *and* SSH remotes) and installs a newer vsix when one exists. Prompt to reload; `grok.autoUpdate` / **Grok30m: Check for Updates** to control it.
- **One-command install** for anyone's machine, including Cursor SSH remotes: `curl -fsSL https://raw.githubusercontent.com/thirtym/grok30m/grok30m/scripts/bootstrap.sh | bash` (Windows: `scripts/bootstrap.ps1`).
- Removes leftover copies that hide Grok30m's views: the community marketplace extension (`PawelHuryn.grok-vscode-phuryn`) and `paul-local.grok-tabs`.
- Activates on startup so the update check runs even if the Sessions view didn't load.

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
