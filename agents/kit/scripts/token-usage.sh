#!/usr/bin/env bash
# Token use of the kit's agent runs, read from the CLIs' own session data. Read-only.
#   token-usage.sh            TSV: <NN> <agent> <tool> <tokens> <sessions>, one line per round and agent, plus a TOTAL line
#   token-usage.sh --fresh    ignore the cache and read the session data again
#   token-usage.sh --summary  one line for the watcher: all rounds, per CLI, with the sources that are not counted
#
# Sources (only runs whose working folder is .worktrees/r<NN>-<agent> of THIS project are counted):
#   codex     ~/.codex/sessions/**/*.jsonl         last total_token_usage.total_tokens of each session
#   copilot   ~/.copilot/session-store.db          input + output tokens of each assistant turn
#   opencode  ~/.local/share/opencode/opencode.db  tokens.total of each assistant message
# Not counted: cursor (no local token data), Claude as a chat subagent (lives in the coordinator's chat), Freebuff (manual).
# Numbers are what each CLI reports; the three CLIs do not count tokens the same way, so compare them with care.
#
# The result is cached in .worktrees/tokens-cache.tsv for CACHE_SECONDS (default 300), so the watcher can call this often.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WT="$ROOT/.worktrees"
CACHE="$WT/tokens-cache.tsv"
CACHE_SECONDS="${CACHE_SECONDS:-300}"

MODE="${1:-}"
fresh=0
[ "$MODE" = "--fresh" ] && fresh=1
age=$(( $(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || echo 0) ))

if [ "$fresh" -eq 1 ] || [ ! -f "$CACHE" ] || [ "$age" -ge "$CACHE_SECONDS" ]; then
  mkdir -p "$WT"
  tmp="$CACHE.tmp.$$"
  node --no-warnings - "$ROOT" > "$tmp" <<'JS'
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const root = norm(process.argv[2]);
const home = os.homedir();
const RUN_RE = /^\/\.worktrees\/r(\d+)-([a-z0-9-]+)(\/|$)/;

// Returns { round, agent } when the folder is a run worktree of this project, otherwise null.
function runOf(cwd) {
  const n = norm(cwd);
  if (!n.startsWith(root)) return null;
  const m = n.slice(root.length).match(RUN_RE);
  return m ? { round: m[1], agent: m[2] } : null;
}

const totals = new Map(); // "round|agent|tool" -> { tokens, sessions }
function add(run, tool, tokens) {
  const key = `${run.round}|${run.agent}|${tool}`;
  const cur = totals.get(key) || { tokens: 0, sessions: 0 };
  cur.tokens += tokens;
  cur.sessions += 1;
  totals.set(key, cur);
}

// codex: one rollout file per session. The last token_count event holds the cumulative total of that session.
function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}
for (const file of walk(path.join(home, '.codex', 'sessions'), [])) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  let run = null;
  let last = null;
  for (const line of lines) {
    if (!line) continue;
    if (!run && line.includes('"session_meta"')) {
      try { run = runOf(JSON.parse(line).payload?.cwd); } catch { /* skip malformed line */ }
      if (!run) break;
    }
    if (run && line.includes('"token_count"')) {
      try {
        const total = JSON.parse(line).payload?.info?.total_token_usage?.total_tokens;
        if (typeof total === 'number') last = total;
      } catch { /* skip malformed line */ }
    }
  }
  if (run && last !== null) add(run, 'codex', last);
}

// copilot: sessions carry the working folder; assistant_usage_events carry the tokens per turn.
const copilotDb = path.join(home, '.copilot', 'session-store.db');
if (fs.existsSync(copilotDb)) {
  const db = new DatabaseSync(copilotDb, { readOnly: true });
  const rows = db.prepare(`
    SELECT s.id AS sid, s.cwd AS cwd, SUM(a.input_tokens + a.output_tokens) AS tokens
    FROM sessions s JOIN assistant_usage_events a ON a.session_id = s.id
    GROUP BY s.id`).all();
  for (const r of rows) {
    const run = runOf(r.cwd);
    if (run) add(run, 'copilot', Number(r.tokens) || 0);
  }
  db.close();
}

// opencode: messages join their session, which carries the working folder.
const opencodeDb = path.join(home, '.local', 'share', 'opencode', 'opencode.db');
if (fs.existsSync(opencodeDb)) {
  const db = new DatabaseSync(opencodeDb, { readOnly: true });
  const rows = db.prepare(`
    SELECT s.id AS sid, s.directory AS dir, m.data AS data
    FROM message m JOIN session s ON s.id = m.session_id
    WHERE m.data LIKE '%"tokens"%'`).all();
  const perSession = new Map();
  for (const r of rows) {
    const run = runOf(r.dir);
    if (!run) continue;
    let msg;
    try { msg = JSON.parse(r.data); } catch { continue; }
    if (msg.role !== 'assistant' || typeof msg.tokens?.total !== 'number') continue;
    const cur = perSession.get(r.sid) || { run, tokens: 0 };
    cur.tokens += msg.tokens.total;
    perSession.set(r.sid, cur);
  }
  for (const s of perSession.values()) add(s.run, 'opencode', s.tokens);
  db.close();
}

const lines = [];
let grand = 0;
let sessions = 0;
for (const [key, v] of [...totals.entries()].sort()) {
  const [round, agent, tool] = key.split('|');
  lines.push([round, agent, tool, v.tokens, v.sessions].join('\t'));
  grand += v.tokens;
  sessions += v.sessions;
}
lines.push(['TOTAL', '-', '-', grand, sessions].join('\t'));
process.stdout.write(lines.join('\n') + '\n');
JS
  mv "$tmp" "$CACHE"
fi

if [ "$MODE" = "--summary" ]; then
  awk -F'\t' '
    function h(s) { if (s >= 1e6) return sprintf("%.1fM", s / 1e6); if (s >= 1e3) return sprintf("%.0fk", s / 1e3); return s + 0 }
    $1 == "TOTAL" { grand = $4; next }
    { perTool[$3] += $4 }
    END {
      printf "tokens, all rounds: %s (", h(grand)
      n = split("codex copilot opencode", order, " ")
      for (i = 1; i <= n; i++) printf "%s%s %s", (i > 1 ? ", " : ""), order[i], h(perTool[order[i]])
      printf "). Not counted: cursor, Claude subagent, Freebuff\n"
    }' "$CACHE"
  exit 0
fi

cat "$CACHE"
