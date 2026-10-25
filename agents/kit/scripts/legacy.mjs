#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runAgent, agentArguments } from './lib/adapters.mjs';
import { doctor } from './lib/doctor.mjs';
import { loadJson } from './lib/engine.mjs';
import { git, alive } from './lib/process.mjs';
import { identifier } from './lib/policy.mjs';

const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
function legacyStatus(round, agents) {
  if (!/^\d+$/.test(round)) throw new Error('INVALID_ROUND');
  const rows = [];
  for (const agent of agents) {
    identifier(agent);
    const dir = path.join(root, '.worktrees', `r${round}-${agent}`);
    if (!fs.existsSync(dir)) { rows.push({ agent, status: 'no worktree' }); continue; }
    const state = path.join(dir, 'agents/state', `CURRENT_STATE_${agent}.md`);
    const text = fs.existsSync(state) ? fs.readFileSync(state, 'utf8') : '';
    const matchesRound = new RegExp(`^#.*\\(round R${round}\\)`, 'm').test(text);
    const status = !text ? 'MISSING' : !matchesRound ? 'STALE' : /^Status:\s*([A-Z_]+)/m.exec(text)?.[1] ?? 'NO_STATUS';
    const logFile = path.join(root, '.worktrees/logs', `r${round}-${agent}.log`);
    let tail = '';
    if (fs.existsSync(logFile)) {
      const fd = fs.openSync(logFile, 'r');
      try { const size = fs.fstatSync(fd).size; const buffer = Buffer.alloc(Math.min(4096, size)); fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length)); tail = buffer.toString(); } finally { fs.closeSync(fd); }
    }
    rows.push({ agent, status, ticked: `${(text.match(/\[x\]/g) ?? []).length}/${(text.match(/\[[ x]\]/g) ?? []).length}`, ahead: git(dir, ['rev-list', '--count', 'main..HEAD']), dirty: Boolean(git(dir, ['status', '--porcelain'])), limit: /usage limit|quota exceeded|rate limit/i.test(tail), tokens: 'unknown; use token-usage.sh for legacy CLI records' });
  }
  return rows;
}
async function main() {
  const [command, round, ...agents] = process.argv.slice(2);
  if (command === 'run') {
    const agent = identifier(agents[0]);
    if (!/^\d+$/.test(round)) throw new Error('INVALID_ROUND');
    const config = loadJson(path.join(root, 'agents/kit/project.json'));
    const worker = config.workers.find(w => w.tool === agent);
    if (!worker || config.profile !== 'full-control') throw new Error('PROFILE: run version-2 setup first');
    const dir = path.join(root, '.worktrees', `r${round}-${agent}`);
    if (!fs.existsSync(dir)) throw new Error(`WORKTREE_MISSING: ${dir}`);
    const promptFile = path.join(root, 'agents/rounds', `R${round}`, `${agent}.md`);
    if (!fs.existsSync(promptFile)) throw new Error(`PROMPT_MISSING: ${promptFile}`);
    const instruction = 'Read AGENTS.md and .agent-kit-runtime/legacy.md, then complete the assignment. Do not act as coordinator.';
    if (process.env.DRY_RUN === '1') { console.log(JSON.stringify({ command: worker.command, args: agentArguments(worker.tool, instruction, worker), cwd: dir, profile: config.profile })); return; }
    const diagnosis = await doctor(root, { ...config, workers: [worker] });
    if (!diagnosis.ok) throw new Error('PREFLIGHT_FAILED: run doctor --probe');
    const lock = path.join(root, '.worktrees/agent-kit/scheduler.lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    if (fs.existsSync(lock) && !alive(loadJson(lock).pid)) fs.unlinkSync(lock);
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    try {
      const poolFile = path.join(root, '.worktrees/agent-kit/pools.json');
      const pool = fs.existsSync(poolFile) ? loadJson(poolFile)[worker.pool] : null;
      if (pool && (pool.until > Date.now() || pool.exhausted)) throw new Error('LIMIT: shared account pool is unavailable');
      fs.mkdirSync(path.join(dir, '.agent-kit-runtime'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.agent-kit-runtime/legacy.md'), fs.readFileSync(promptFile, 'utf8'));
      const logs = path.join(root, '.worktrees/logs'); fs.mkdirSync(logs, { recursive: true });
      const log = path.join(logs, `r${round}-${agent}.log`);
      fs.appendFileSync(log, `\n--- full-control attempt ${new Date().toISOString()} ---\n`);
      const result = await runAgent(worker, instruction, { cwd: dir, onData: text => { fs.appendFileSync(log, text); process.stdout.write(text); } });
      process.exitCode = result.code;
    } finally { fs.rmSync(lock, { force: true }); }
    return;
  }
  let prior = '';
  const frame = () => {
    const missions = path.join(root, '.worktrees/agent-kit');
    const modern = command === 'watch' && fs.existsSync(missions) ? fs.readdirSync(missions).filter(id => !round || id === round).filter(id => fs.existsSync(path.join(missions, id, 'state.json'))).map(id => loadJson(path.join(missions, id, 'state.json'))) : [];
    const legacyRoot = path.join(root, '.worktrees');
    const rounds = new Map();
    if (round && /^\d+$/.test(round) && agents.length) rounds.set(round, agents);
    else if (fs.existsSync(legacyRoot)) for (const name of fs.readdirSync(legacyRoot)) {
      const match = /^r(\d+)-([a-z0-9-]+)$/.exec(name);
      if (match && (!round || match[1] === round)) rounds.set(match[1], [...(rounds.get(match[1]) ?? []), match[2]]);
    }
    const result = { missions: modern, legacy: Object.fromEntries([...rounds].map(([id, tools]) => [id, legacyStatus(id, tools)])) };
    const manualRoot = path.join(root, '.worktrees/manual');
    result.manual = fs.existsSync(manualRoot) ? fs.readdirSync(manualRoot).filter(n => /^run-r\d+-.*\.txt$/.test(n)).map(name => ({ name, record: fs.readFileSync(path.join(manualRoot, name), 'utf8').trim() })) : [];
    const text = JSON.stringify(result, null, 2);
    if (text !== prior) { console.log(text); prior = text; }
  };
  if (!['status', 'watch'].includes(command)) throw new Error('Usage: legacy.mjs run|status <NN> <agent...> | watch [mission|NN]');
  frame(); if (command === 'watch') setInterval(frame, 2000);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
