#!/usr/bin/env bash
# Merge latest community Grok Build client into the 37x branch.
# Run from repo root on branch 37x. Resolve conflicts in sidebar.ts / package.json / sessions.ts.
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "37x" ]]; then
  echo "Switch to branch 37x first (currently on $branch)." >&2
  exit 1
fi

git fetch upstream
echo "Merging upstream/main into 37x…"
git merge upstream/main

echo "Run: npm test && npm run package"
echo "Then reinstall the VSIX in Cursor."
