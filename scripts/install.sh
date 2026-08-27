#!/usr/bin/env bash
# Build this clone and install it into every Cursor/VS Code/SSH-remote CLI
# on this host. For "just give me the current release" use bootstrap.sh instead.
# Usage:  ./scripts/install.sh [path/to/file.vsix]

set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=find-editor-clis.sh
. "$repo_root/scripts/find-editor-clis.sh"

ID="grok30m.grok30m"
CONFLICTS=(PawelHuryn.grok-vscode-phuryn paul-local.grok-tabs)

vsix="${1-}"
if [ -z "$vsix" ]; then
    cd "$repo_root"
    [ -d node_modules ] || npm install
    npm run package
    vsix=$(ls -t "$repo_root"/grok30m-*.vsix | head -n1)
fi
[ -f "$vsix" ] || { echo "vsix not found: $vsix" >&2; exit 1; }

clis=()
while IFS= read -r line; do
    clis+=("$line")
done < <(find_editor_clis)
if [ "${#clis[@]}" -eq 0 ]; then
    echo "Could not find Cursor or VS Code CLI (including ~/.cursor-server remote-cli)." >&2
    exit 1
fi

for cli in "${clis[@]}"; do
    echo "Installing $vsix via $cli"
    for id in "$ID" "${CONFLICTS[@]}"; do
        "$cli" --uninstall-extension "$id" >/dev/null 2>&1 || true
    done
    "$cli" --install-extension "$vsix" --force
done

echo
echo "Done. Reload every open window (Developer: Reload Window)."
echo "Grok30m will then keep itself current from GitHub Releases."
