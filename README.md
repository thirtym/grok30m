# Grok30m

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Cursor](https://img.shields.io/badge/Cursor-Extension-007ACC)](https://cursor.com) [![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com)

**Grok30m** is a fork of [Grok Build for VS Code (Community)](https://github.com/phuryn/grok-build-vscode) — the open-source client for xAI's Grok Build CLI. It adds a **Claude Code–style workflow**: editor-tab chat, a dedicated Sessions sidebar, and filters for automated agent sessions.

> **Not affiliated with or endorsed by xAI or Paweł Huryn.** *Grok*, *Grok Build*, and *xAI* are trademarks of xAI. This project uses those names only to describe compatibility. See [Attribution](#attribution).

---

## Why Grok30m?

The stock community extension keeps chat in a sidebar with history in a dropdown. That works for casual use, but it fights a Cursor/Claude-style flow when you:

- Run many **automated Grok sessions** (reviews, deploy observers, subagents)
- Want chat in an **editor tab** while editing files in another
- Need **session history** that isn't flooded by automation

Grok30m adds three things on top of the upstream client:

| Feature | Default | What it does |
|---|---|---|
| **Editor-tab chat** | `grok.preferredLocation: "panel"` | One editor tab per session — chat stays open while you edit |
| **Sessions sidebar** | `grok.sessionsSidebar: true` | Dedicated history view; in-chat clock dropdown disabled |
| **Hide automation** | `grok.hideAutoSessions: true` | Hides sessions tagged `[Auto:review]`, `[Auto:deploy]`, `[Auto:robot]` |

---

## Requirements

Same as upstream:

- **VS Code 1.94+** or **Cursor 3.x**
- **[Grok Build CLI](https://github.com/phuryn/grok-build-vscode#install)** (`grok`) with SuperGrok, X Premium+, or an xAI API key
- macOS, Linux, or Windows

---

## Install

### From a release VSIX (recommended)

1. Install and sign in to the Grok CLI (`grok /login`).
2. Download `grok30m-*.vsix` from [Releases](https://github.com/thirtym/grok30m/releases).
3. Install in Cursor or VS Code:

```bash
cursor --install-extension grok30m-2.0.2.vsix
# or
code --install-extension grok30m-2.0.2.vsix
```

4. **Uninstall** the marketplace extension if present (`PawelHuryn.grok-vscode-phuryn`) — both register `Cmd+;`.
5. Reload the window (`Developer: Reload Window`).

Extension id: **`grok30m.grok30m`**

### Build from source

```bash
git clone https://github.com/thirtym/grok30m.git
cd grok30m
git checkout grok30m
npm install
npm test
npm run package
cursor --install-extension grok30m-*.vsix --force
```

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `grok.preferredLocation` | `"panel"` | `"panel"` = editor tab; `"sidebar"` = original side chat |
| `grok.sessionsSidebar` | `true` | Dedicated Sessions view in the activity bar |
| `grok.hideAutoSessions` | `true` | Hide tagged automated sessions (toggle live in Sessions sidebar) |

Per-project overrides go in `.vscode/settings.json`.

### Commands

| Command | Action |
|---|---|
| `Grok: Open` | Open using preferred location; reveals Sessions sidebar |
| `Grok: Open in Editor Tab` | Force panel tab |
| `Grok: Open in Sidebar` | Force sidebar chat |

Default keybinding: **`Cmd+;`** (Mac) / **`Ctrl+;`** (Windows/Linux).

---

## Automated session tagging

Sessions are classified as **review**, **deploy**, or **robot** from title, first user query, and chat history. Tagged sessions display as `[Auto:tag] …` in the sidebar.

Retroactive pass for an existing workspace:

```bash
python3 scripts/tag-sessions.py --days 5 --cwd /path/to/project [--dry-run]
```

**Important:** tag writes restore `summary.json` mtime from logical `updated_at` so history sort order stays correct. Do not rewrite summaries without that step.

---

## Staying current with upstream

This fork tracks [phuryn/grok-build-vscode](https://github.com/phuryn/grok-build-vscode). Upstream base at fork time: `56d2b4f` (~1.4.x). Merge when you want newer upstream features:

```bash
git checkout grok30m
./scripts/sync-upstream.sh
npm test && npm run package
```

Expect merge conflicts in `src/sidebar.ts`, `package.json`, and `src/sessions.ts`.

See [CHANGELOG-Grok30m.md](CHANGELOG-Grok30m.md) for Grok30m-specific changes. Upstream changelog: [README.upstream.md](README.upstream.md) / upstream repo.

---

## Attribution

Grok30m is a derivative work of [grok-build-vscode](https://github.com/phuryn/grok-build-vscode) by **Paweł Huryn**, used under the [MIT License](LICENSE).

- **Original software:** Copyright (c) 2026 Paweł Huryn
- **Grok30m modifications:** Copyright (c) 2026 Grok30m contributors

Upstream features, architecture, and CLI integration are Pawel Huryn's work. Grok30m-specific UX (panel tabs, Sessions sidebar, auto-tag/hide) is maintained in this repository.

For the unmodified community extension and marketplace releases, use upstream directly.

---

## License

MIT — see [LICENSE](LICENSE). Your use of the Grok CLI remains subject to [xAI's terms](https://x.ai/legal).
