#!/usr/bin/env bash
# One read-only view for version-2 missions and existing numeric rounds.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/legacy.mjs" watch "$@"
