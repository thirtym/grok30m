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

  local d
  for d in "${HOME}/.cursor-server/bin/"*/bin/remote-cli/cursor; do
    add "$d"
  done
  for d in "${HOME}/.vscode-server/bin/"*/bin/remote-cli/code; do
    add "$d"
  done
  for d in "${HOME}/.vscode-server-insiders/bin/"*/bin/remote-cli/code-insiders; do
    add "$d"
  done
}
