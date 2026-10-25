import path from 'node:path';

export const FINAL = new Set(['VERIFIED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELLED']);
export function fail(code, message) { throw new Error(`${code}: ${message}`); }
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail('INVALID_ID', String(value));
  return value;
}
export function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') || path.posix.isAbsolute(value) || value.split('/').some(p => ['..', '.', '.git', '.worktrees', '.agent-kit-runtime'].includes(p)) || /[*?\[\]]/.test(value)) fail('INVALID_PATH', String(value));
  return value.replace(/\/$/, '');
}
export function owns(owned, file) {
  return owned.some(raw => { const p = relativePath(raw).toLowerCase(); const f = file.toLowerCase(); return f === p || f.startsWith(`${p}/`); });
}
export function validateMission(mission) {
  if (mission.version !== 2) fail('VERSION', 'Mission version must be 2');
  identifier(mission.id);
  for (const key of ['budgetMinutes', 'attemptMinutes', 'graceMinutes']) {
    if (mission[key] !== undefined && (typeof mission[key] !== 'number' || !Number.isFinite(mission[key]) || mission[key] < (key === 'graceMinutes' ? 0 : 0.001) || mission[key] > 1440)) fail('BUDGET', key);
  }
  if (typeof mission.base !== 'string' || !mission.base || mission.base.startsWith('-')) fail('BASE', 'A base branch or commit is required');
  if (!Array.isArray(mission.tasks) || !mission.tasks.length) fail('TASKS_REQUIRED', 'Provide approved tasks');
  const ids = new Set();
  for (const task of mission.tasks) {
    identifier(task.id); identifier(task.lane);
    if (ids.has(task.id)) fail('DUPLICATE_TASK', task.id);
    ids.add(task.id);
    if (typeof task.prompt !== 'string' || !task.prompt.trim()) fail('PROMPT_REQUIRED', task.id);
    if (!Array.isArray(task.acceptance) || !task.acceptance.length || task.acceptance.some(v => typeof v !== 'string' || !v.trim())) fail('ACCEPTANCE_REQUIRED', task.id);
    if (!Array.isArray(task.owned) || !task.owned.length) fail('OWNERS_REQUIRED', task.id);
    task.owned.forEach(relativePath);
    if (!Array.isArray(task.workers) || !task.workers.length) fail('WORKERS_REQUIRED', task.id);
    task.workers.forEach(identifier);
    if (!Array.isArray(task.checks) || !task.checks.length) fail('CHECKS_REQUIRED', task.id);
    for (const check of task.checks) {
      if (!check || typeof check.command !== 'string' || !check.command || !Array.isArray(check.args) || check.args.some(a => typeof a !== 'string')) fail('INVALID_CHECK', task.id);
    }
    if (task.dependsOn !== undefined && !Array.isArray(task.dependsOn)) fail('DEPENDENCY', task.id);
  }
  const visited = new Set(); const visiting = new Set();
  function visit(task) {
    if (visiting.has(task.id)) fail('CYCLE', task.id);
    if (visited.has(task.id)) return;
    visiting.add(task.id);
    for (const id of task.dependsOn ?? []) {
      const dependency = mission.tasks.find(t => t.id === id);
      if (!dependency) fail('DEPENDENCY', `${task.id} needs ${id}`);
      visit(dependency);
    }
    visiting.delete(task.id); visited.add(task.id);
  }
  mission.tasks.forEach(visit);
  for (const task of mission.tasks) for (const id of task.dependsOn ?? []) {
    const dependency = mission.tasks.find(t => t.id === id);
    if (dependency.lane === task.lane && mission.tasks.indexOf(dependency) >= mission.tasks.indexOf(task)) fail('LANE_ORDER', `${task.id} depends on a later package`);
  }
  for (let i = 0; i < mission.tasks.length; i++) {
    const a = mission.tasks[i];
    for (const b of mission.tasks.slice(i + 1)) {
      if (a.lane !== b.lane && a.owned.some(p => b.owned.some(q => owns([p], relativePath(q)) || owns([q], relativePath(p))))) fail('OWNERSHIP_CONFLICT', `${a.id} and ${b.id}`);
    }
  }
  return mission;
}
export function dependencyStatus(task, tasks, state) {
  for (const id of task.dependsOn ?? []) {
    if (state.tasks[id]?.status !== 'VERIFIED') return 'WAITING_DEPENDENCY';
    if (tasks.find(t => t.id === id).lane !== task.lane) return 'WAITING_INTEGRATION';
  }
  return 'READY';
}
export function selectWorker(task, workers, state, busy, now = Date.now()) {
  for (const tool of task.workers) {
    const worker = workers.find(w => w.tool === tool && !busy.includes(w.id) && !state.workers[w.id]?.disabled && !(state.pools[w.pool]?.until > now) && !state.pools[w.pool]?.exhausted && !(state.tasks?.[task.id]?.excluded ?? []).includes(w.id));
    if (worker) return worker;
  }
}
export function classifyFailure(output, code) {
  if (code === 0) return null;
  if (/usage limit|rate.?limit|quota exceeded|too many requests|429|ActionRequiredError/i.test(output)) return 'LIMIT';
  if (/unauthorized|not logged in|please (?:log|sign) ?in|authentication failed|401\b/i.test(output)) return 'AUTH';
  if (/permission denied|approval required|permission blocked|access denied|operation not permitted/i.test(output)) return 'PERMISSION';
  if (/unknown (?:option|argument)|unrecognized (?:option|argument)|invalid flag|not recognized|ENOENT|model.*(?:not found|not supported|unavailable)/i.test(output)) return 'CONFIG';
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network error|503\b|502\b/i.test(output)) return 'TRANSIENT';
  return code === 0 ? null : 'CRASH';
}
