#!/usr/bin/env bash
# Merge the next community release into grok30m (identity + session tabs reapplied).
# Prefer the GitHub Action (.github/workflows/sync-community.yml). This is the local equivalent.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run compile
exec node scripts/sync-community.mjs --apply "$@"
