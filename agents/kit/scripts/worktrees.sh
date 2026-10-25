#!/usr/bin/env bash
# Round worktrees for multi-agent work (see agents/kit/README.md).
#
#   worktrees.sh create <NN> <agent> [agent...]   one worktree per agent: .worktrees/r<NN>-<agent> on branch r<NN>/<agent>
#   worktrees.sh remove <NN> <agent> [agent...]   unlink LINK_DIRS, remove the worktree, delete the branch (if merged)
#   worktrees.sh list                             show all worktrees
#
# Environment:
#   BASE        base branch for new worktrees (default: main)
#   LINK_DIRS   space-separated folders from the main checkout to link into each worktree (for example: "node_modules")
#
# Linked folders are junctions on Windows and symlinks elsewhere. `remove` unlinks them first, so the main checkout's
# folders are never deleted.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WT_DIR="$ROOT/.worktrees"
BASE="${BASE:-main}"
LINK_DIRS="${LINK_DIRS:-}"

link_dir() {
  local source="$1" link="$2"
  node "$SCRIPT_DIR/worktree-link.mjs" create "$source" "$link"
}

unlink_dir() {
  local link="$1"
  node "$SCRIPT_DIR/worktree-link.mjs" remove "$link" "$link"
}

create() {
  local round="$1"; shift
  mkdir -p "$WT_DIR"
  for agent in "$@"; do
    local name="r$round-$agent" branch="r$round/$agent"
    local path="$WT_DIR/$name"
    git -C "$ROOT" worktree add "$path" -b "$branch" "$BASE"
    for dir in $LINK_DIRS; do
      if [ -d "$ROOT/$dir" ] && [ ! -e "$path/$dir" ]; then
        link_dir "$ROOT/$dir" "$path/$dir"
      fi
    done
    echo "created $path on $branch"
  done
}

remove() {
  local round="$1"; shift
  for agent in "$@"; do
    local name="r$round-$agent" branch="r$round/$agent"
    local path="$WT_DIR/$name"
    git -C "$ROOT" merge-base --is-ancestor "$branch" "$BASE" || { echo "refusing unmerged branch: $branch" >&2; return 1; }
    [ -z "$(git -C "$path" status --porcelain)" ] || { echo "refusing dirty worktree: $path" >&2; return 1; }
    for dir in $LINK_DIRS; do
      if [ -e "$path/$dir" ] || [ -L "$path/$dir" ]; then
        unlink_dir "$path/$dir"
      fi
    done
    git -C "$ROOT" worktree remove "$path"
    git -C "$ROOT" branch -d "$branch"
    echo "removed $path and branch $branch"
  done
}

cmd="${1:-}"
shift || true
if [ "$cmd" = 'create' ] || [ "$cmd" = 'remove' ]; then
  [[ "${1:-}" =~ ^[0-9]+$ ]] || { echo 'round must contain digits' >&2; exit 2; }
  for agent in "${@:2}"; do
    [[ "$agent" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo 'invalid agent id' >&2; exit 2; }
  done
  for dir in $LINK_DIRS; do
    [[ "$dir" =~ ^[a-zA-Z0-9_./-]+$ ]] && [[ "/$dir/" != *'/../'* ]] && [[ "$dir" != /* ]] || { echo 'LINK_DIRS must contain relative project paths' >&2; exit 2; }
  done
fi
case "$cmd" in
  create)
    [ $# -ge 2 ] || { echo "usage: worktrees.sh create <NN> <agent> [agent...]" >&2; exit 2; }
    create "$@" ;;
  remove)
    [ $# -ge 2 ] || { echo "usage: worktrees.sh remove <NN> <agent> [agent...]" >&2; exit 2; }
    remove "$@" ;;
  list)
    git -C "$ROOT" worktree list ;;
  *)
    echo "usage: worktrees.sh {create|remove|list} ..." >&2
    exit 2 ;;
esac
