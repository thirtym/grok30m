#!/usr/bin/env bash
# Merge latest community Grok Build client into the grok30m branch.
# Run from repo root on branch grok30m. Resolve conflicts in sidebar.ts / package.json / sessions.ts.
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "grok30m" ]]; then
  echo "Switch to branch grok30m first (currently on $branch)." >&2
  exit 1
fi

git fetch upstream
echo "Merging upstream/main into grok30m…"
git merge upstream/main

echo "Run: npm test && npm run package"
echo "Then reinstall the VSIX in Cursor."
