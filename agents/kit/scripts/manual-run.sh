#!/usr/bin/env bash
# Records a run that a person starts by hand (for example Freebuff, pasted with an agent's prompt), so the watcher shows it.
#   manual-run.sh start <NN> <agent> <tool> <from-agent>   <tool> was started by hand in .worktrees/r<NN>-<agent>, instruction from <from-agent>
#   manual-run.sh stop <NN> <agent>                        clears the record when the run is over
# The record lives in .worktrees/manual/run-r<NN>-<agent>.txt (git-ignored). status.sh shows it as a RUN line.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MANUAL="$ROOT/.worktrees/manual"
AGENT_RE='^[a-z0-9-]+$'

usage() {
  echo "usage: manual-run.sh start <NN> <agent> <tool> <from-agent> | manual-run.sh stop <NN> <agent>" >&2
  exit 2
}

[ $# -ge 1 ] || usage
cmd="$1"
shift

case "$cmd" in
  start)
    [ $# -eq 4 ] || usage
    round="$1"; agent="$2"; tool="$3"; from="$4"
    [[ "$round" =~ ^[0-9]+$ ]] || { echo "round must be digits: $round" >&2; exit 2; }
    [[ "$agent" =~ $AGENT_RE ]] || { echo "agent must be lowercase letters, digits or dashes: $agent" >&2; exit 2; }
    [[ "$tool" =~ $AGENT_RE ]] || { echo "tool must be lowercase letters, digits or dashes: $tool" >&2; exit 2; }
    [[ "$from" =~ $AGENT_RE ]] || { echo "from-agent must be lowercase letters, digits or dashes: $from" >&2; exit 2; }
    mkdir -p "$MANUAL"
    printf '%s|%s|%s\n' "$tool" "$from" "$(date +%s)" > "$MANUAL/run-r$round-$agent.txt"
    echo "recorded: $tool in r$round-$agent, instruction from $from" ;;
  stop)
    [ $# -eq 2 ] || usage
    round="$1"; agent="$2"
    [[ "$round" =~ ^[0-9]+$ ]] || { echo "round must be digits: $round" >&2; exit 2; }
    rm -f "$MANUAL/run-r$round-$agent.txt"
    echo "cleared: r$round-$agent" ;;
  *)
    usage ;;
esac
