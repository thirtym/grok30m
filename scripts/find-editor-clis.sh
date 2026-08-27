#!/usr/bin/env bash
# Shared Cursor / VS Code / remote-server CLI discovery. Sourced by install.sh.
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
