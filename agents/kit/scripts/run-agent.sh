#!/usr/bin/env bash
# Compatibility entrypoint. Execution requires project full-control authorization and preflight.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -eq 2 ] && [[ "$1" =~ ^[0-9]+$ ]]; then
  exec node "$DIR/legacy.mjs" run "$1" "$2"
fi
exec node "$DIR/runner.mjs" start "$@"
