// Human-readable tracker for `runner.mjs watch` and `watch-round.sh`. Pure functions: rows in, text out.
const ANSI = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m' };
const STATUS = {
  RUNNING: ['●', 'cyan'], VERIFYING: ['◐', 'blue'], READY: ['○', 'dim'], VERIFIED: ['✔', 'green'],
  WAITING_DEPENDENCY: ['…', 'yellow'], WAITING_INTEGRATION: ['⇄', 'yellow'], WAITING_CAPACITY: ['⧗', 'yellow'],
  NEEDS_REVIEW: ['!', 'magenta'], BLOCKED: ['✖', 'red'], CANCELLED: ['–', 'dim'], PAUSED: ['‖', 'yellow'],
  STOPPED: ['■', 'dim'], BUDGET_EXHAUSTED: ['⌛', 'red'], DONE: ['✔', 'green'],
};
const ATTENTION = new Set(['NEEDS_REVIEW', 'BLOCKED', 'BUDGET_EXHAUSTED']);
const FINAL = new Set(['VERIFIED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELLED', 'STOPPED', 'BUDGET_EXHAUSTED', 'DONE']);

export function age(at, now = Date.now()) {
  const time = typeof at === 'string' ? Date.parse(at) : at;
  if (!time || Number.isNaN(time)) return '-';
  const s = Math.max(0, Math.round((now - time) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}
function paint(color) { return (text, tone) => color && tone ? `${ANSI[tone]}${text}${ANSI.reset}` : text; }
function fit(text, width) { const s = String(text ?? ''); return s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s.padEnd(width); }
function clip(text, width) { const s = String(text ?? ''); return s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s; }
function badge(status, c) { const [icon, tone] = STATUS[status] ?? ['?', 'dim']; return { plain: `${icon} ${status}`, tone }; }
function bar(done, total, width, c) {
  const filled = total ? Math.round((done / total) * width) : 0;
  return c('█'.repeat(filled), 'green') + c('░'.repeat(width - filled), 'dim');
}

export function renderMissions(rows, { now = Date.now(), color = false, width = 100 } = {}) {
  const c = paint(color);
  if (!rows.length) return [c('No missions in this project yet.', 'bold'), 'Start an accepted manifest: node agents/kit/scripts/runner.mjs start agents/missions/<mission>.json', ''].join('\n');
  const out = [];
  const cols = { task: 22, lane: 12, status: 21, worker: 10, attempt: 4, repairs: 4, progress: 7, active: 7 };
  for (const m of rows) {
    const verified = m.tasks.filter(t => t.status === 'VERIFIED').length;
    const head = badge(m.status, c);
    const finished = FINAL.has(m.status);
    const runner = m.runnerAlive ? c('runner alive', 'green') : finished ? c('runner exited', 'dim') : c('runner NOT running', 'red');
    const elapsed = m.startedAt ? `${age(m.startedAt, now)} / ${m.budgetMinutes ?? '?'}m` : '';
    out.push(c(clip(`━━ ${m.mission} `, width), 'bold') + c(head.plain, head.tone) + `  ${runner}` + (elapsed ? `  ${elapsed}` : '') + `  ${bar(verified, m.tasks.length, 10, c)} ${verified}/${m.tasks.length} verified`);
    out.push(c(clip(` ${fit('TASK', cols.task)} ${fit('LANE', cols.lane)} ${fit('STATUS', cols.status)} ${fit('WORKER', cols.worker)} ${fit('TRY', cols.attempt)} ${fit('FIX', cols.repairs)} ${fit('STATE', cols.progress)} ${fit('ACTIVE', cols.active)}`, width), 'dim'));
    for (const t of m.tasks) {
      const b = badge(t.status, c);
      const active = t.status === 'RUNNING' || t.status === 'VERIFYING' ? age(t.activityAt, now) : '-';
      const line = ` ${fit(t.task, cols.task)} ${fit(t.lane ?? '', cols.lane)} ${fit(b.plain, cols.status)} ${fit(t.worker, cols.worker)} ${fit(t.attempt, cols.attempt)} ${fit(t.repairs, cols.repairs)} ${fit(t.progress, cols.progress)} ${fit(active, cols.active)}`;
      const statusAt = 1 + cols.task + 1 + cols.lane + 1;
      const clipped = clip(line, width);
      out.push(clipped.slice(0, statusAt) + c(clipped.slice(statusAt, statusAt + cols.status), b.tone) + clipped.slice(statusAt + cols.status));
      if (ATTENTION.has(t.status) && t.feedback) out.push(c(clip(`   ↳ ${t.feedback.replace(/\s+/g, ' ').trim()}`, width), b.tone));
    }
    const pools = Object.entries(m.pools ?? {}).filter(([, p]) => p && (p.exhausted || p.until > now));
    for (const [name, p] of pools) out.push(c(clip(`   pool ${name}: ${p.exhausted ? 'exhausted for this mission' : `limited, retry in ${age(now - (p.until - now), now)}`}`, width), 'yellow'));
    // state.json is rewritten only on status changes, so "updated" looked stale while workers were busy.
    const last = Math.max(0, ...m.tasks.map(t => Date.parse(t.activityAt) || 0));
    const pulse = last ? `last activity ${age(last, now)} ago` : 'no worker activity yet';
    out.push(c(clip(`   ${pulse} · status changed ${age(m.updatedAt, now)} ago · logs .worktrees/agent-kit/${m.mission}/`, width), 'dim'));
    out.push('');
  }
  return out.join('\n');
}

export function renderLegacy(legacy, { color = false, width = 100 } = {}) {
  const c = paint(color);
  const out = [];
  for (const [round, agents] of Object.entries(legacy ?? {})) {
    out.push(c(clip(`━━ R${round} (legacy round)`, width), 'bold'));
    for (const a of agents) {
      const tone = a.limit ? 'red' : /DONE|COMPLETE/.test(a.status) ? 'green' : 'cyan';
      out.push(clip(` ${fit(a.agent, 12)} ${c(fit(a.status, 14), tone)} ${fit(a.ticked ?? '', 7)} ahead ${fit(a.ahead ?? '-', 4)} ${a.dirty ? 'dirty' : 'clean'}${a.limit ? '  LIMIT' : ''}`, width + (color ? 9 : 0)));
    }
    out.push('');
  }
  return out.join('\n');
}

export function renderManual(manual, { color = false, width = 100 } = {}) {
  const c = paint(color);
  return manual?.length ? [c('━━ manual runs', 'bold'), ...manual.map(m => clip(` ${m.name}: ${m.record.replace(/\s+/g, ' ')}`, width)), ''].join('\n') : '';
}

// Change key for piped output: ignores ticking timestamps so a log gets one view per real state change.
export function viewKey(rows) {
  return JSON.stringify(rows.map(m => [m.mission, m.status, m.runnerAlive, m.pools, m.tasks.map(t => [t.task, t.status, t.worker, t.attempt, t.repairs, t.progress, t.feedback])]));
}

// Frame for in-place redraw: cursor home, every line cleared to its end, rest of the screen erased (no flicker).
export function redrawFrame(text) {
  const footer = '\x1b[2mCtrl+C closes the watcher only; missions keep running.\x1b[0m';
  return `\x1b[H${[...text.split('\n'), footer].map(line => `${line}\x1b[K`).join('\n')}\n\x1b[J`;
}

// Redraws in place by default, also when Git Bash/Cygwin presents the console as a pipe.
// plain: append one view per state change, for log files (`--plain`).
export function createScreen(stream = process.stdout, { plain = false } = {}) {
  let prior = ''; let started = false;
  return {
    tty: !plain,
    width: () => Math.max(60, Math.min(stream.columns || Number(process.env.COLUMNS) || 120, 160)),
    draw(text, key = text) {
      if (!plain) {
        if (!started) { stream.write('\x1b[?25l\x1b[2J'); started = true; process.once('exit', () => stream.write('\x1b[?25h')); process.once('SIGINT', () => process.exit(0)); }
        stream.write(redrawFrame(text)); return;
      }
      if (key !== prior) { stream.write(`${text}\n`); prior = key; }
    },
  };
}
