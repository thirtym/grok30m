#!/usr/bin/env bash
# Install or repair Grok30m from the single public source:
#   https://github.com/thirtym/grok30m/releases/latest
#
# Works on this computer *and* on a Cursor/VS Code SSH remote (cursor-server).
# Safe to re-run. Reload every already-open window after install.
#
# Anyone's machine:
#   curl -fsSL https://raw.githubusercontent.com/thirtym/grok30m/grok30m/scripts/bootstrap.sh | bash
#
# From a clone:
#   ./scripts/bootstrap.sh [path/to/grok30m.vsix]

set -euo pipefail

REPO="thirtym/grok30m"
API="https://api.github.com/repos/${REPO}/releases/latest"
ID="grok30m.grok30m"
CONFLICTS=(PawelHuryn.grok-vscode-phuryn paul-local.grok-tabs)

find_editor_clis() {
  local seen="|"
  add() {
    local p="${1-}"
    [ -n "$p" ] && [ -x "$p" ] || return 0
    case "$seen" in
      *"|$p|"*) return 0 ;;
    esac
    seen="${seen}${p}|"
    printf '%s\n' "$p"
  }

  local name path
  for name in cursor cursor-insiders code code-insiders; do
    path="$(command -v "$name" 2>/dev/null || true)"
    add "$path"
  done

  add "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
  add "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
  add "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders"

  # Cursor/VS Code SSH remotes: ~/.cursor-server/bin/<platform>/<commit>/bin/remote-cli/cursor
  local d
  if [ -d "${HOME}/.cursor-server/bin" ]; then
    while IFS= read -r d; do add "$d"; done < <(
      find "${HOME}/.cursor-server/bin" -path '*/bin/remote-cli/cursor' \( -type f -o -type l \) 2>/dev/null
    )
  fi
  if [ -d "${HOME}/.vscode-server/bin" ]; then
    while IFS= read -r d; do add "$d"; done < <(
      find "${HOME}/.vscode-server/bin" -path '*/bin/remote-cli/code' \( -type f -o -type l \) 2>/dev/null
    )
  fi
  if [ -d "${HOME}/.vscode-server-insiders/bin" ]; then
    while IFS= read -r d; do add "$d"; done < <(
      find "${HOME}/.vscode-server-insiders/bin" -path '*/bin/remote-cli/code-insiders' \( -type f -o -type l \) 2>/dev/null
    )
  fi
}

download_latest_vsix() {
  local dest="$1"
  command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; return 1; }
  command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; return 1; }

  local json url
  json="$(curl -fsSL -A "Grok30m-bootstrap (+https://github.com/${REPO})" "$API")"
  url="$(printf '%s' "$json" | python3 -c '
import json, sys
r = json.load(sys.stdin)
if r.get("draft") or r.get("prerelease"):
    sys.stderr.write("latest GitHub release is draft/prerelease; refusing\n")
    sys.exit(2)
for a in r.get("assets") or []:
    n = a.get("name") or ""
    u = a.get("browser_download_url") or ""
    if n.lower().startswith("grok30m-") and n.lower().endswith(".vsix") and u:
        print(u)
        sys.exit(0)
sys.stderr.write("no grok30m-*.vsix on the latest GitHub release\n")
sys.exit(2)
')"
  echo "Fetching $url"
  curl -fsSL -L -A "Grok30m-bootstrap (+https://github.com/${REPO})" -o "$dest" "$url"
}

install_on_cli() {
  local cli="$1"
  local vsix="$2"
  echo "→ $cli"
  local id
  for id in "$ID" "${CONFLICTS[@]}"; do
    "$cli" --uninstall-extension "$id" >/dev/null 2>&1 || true
  done
  "$cli" --install-extension "$vsix" --force
}

main() {
  local vsix="${1-}"
  local tmp=""
  if [ -z "$vsix" ]; then
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    vsix="$tmp/grok30m.vsix"
    download_latest_vsix "$vsix"
  fi
  [ -f "$vsix" ] || { echo "vsix not found: $vsix" >&2; exit 1; }

  local clis=()
  local line
  while IFS= read -r line; do
    clis+=("$line")
  done < <(find_editor_clis)
  if [ "${#clis[@]}" -eq 0 ]; then
    echo "Downloaded $vsix but found no Cursor/VS Code CLI."
    echo "Install Cursor or VS Code, then re-run, or:"
    echo "  cursor --install-extension $vsix --force"
    exit 1
  fi

  local cli
  for cli in "${clis[@]}"; do
    install_on_cli "$cli" "$vsix"
  done

  echo
  echo "Grok30m is installed from GitHub Releases on this host."
  echo "In every already-open window: Command Palette → Developer: Reload Window"
  echo "After that, Grok30m keeps itself current from https://github.com/${REPO}/releases"
}

main "$@"
