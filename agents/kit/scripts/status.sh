#!/usr/bin/env bash
# Read-only status; legacy numeric round arguments remain supported.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -gt 0 ] && [[ "$1" =~ ^[0-9]+$ ]]; then
  exec node "$DIR/legacy.mjs" status "$@"
fi
exec node "$DIR/runner.mjs" status "$@"
