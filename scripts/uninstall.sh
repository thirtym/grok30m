#!/usr/bin/env bash
# Uninstall Grok30m (and leftover community/grok-tabs copies) on this host.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=find-editor-clis.sh
. "$repo_root/scripts/find-editor-clis.sh"

IDS=(grok30m.grok30m PawelHuryn.grok-vscode-phuryn paul-local.grok-tabs)

clis=()
while IFS= read -r line; do
    clis+=("$line")
done < <(find_editor_clis)
if [ "${#clis[@]}" -eq 0 ]; then
    echo "Could not find Cursor or VS Code CLI." >&2
    exit 1
fi

for cli in "${clis[@]}"; do
    echo "Uninstalling via $cli"
    for id in "${IDS[@]}"; do
        "$cli" --uninstall-extension "$id" >/dev/null 2>&1 || true
    done
done

echo
echo "Done. Reload every open window to drop the Grok views."
