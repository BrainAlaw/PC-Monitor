import fs from 'node:fs';
import path from 'node:path';
import { loadJson } from './engine.mjs';
import { alive } from './process.mjs';
import { loadAcceptance, effectiveTaskStatus, effectiveMissionStatus } from './acceptance.mjs';

// Read-only snapshot of every mission (or one) for status/watch output. Shape is stable JSON for scripts.
// `status` is always the runner's own state. `effectiveStatus` adds the committed manual decisions (REVIEWED, ACCEPTED, SUPERSEDED).
export function missionRows(root, only, { fullFeedback = false } = {}) {
  const directory = path.join(root, '.worktrees/agent-kit');
  const ids = only ? [only] : fs.existsSync(directory) ? fs.readdirSync(directory).filter(id => fs.existsSync(path.join(directory, id, 'state.json'))) : [];
  return ids.filter(id => fs.existsSync(path.join(directory, id, 'state.json'))).map(id => {
    const state = loadJson(path.join(directory, id, 'state.json'));
    const manifest = loadJson(path.join(directory, id, 'mission.json'));
    let acceptance;
    let acceptanceError = null;
    try { acceptance = loadAcceptance(root, id, manifest.tasks.map(t => t.id)); } catch (error) { acceptance = { tasks: {} }; acceptanceError = error.message; }
    const tasks = Object.entries(state.tasks).map(([task, item]) => {
      const attempt = item.attempts.at(-1); const activityFile = attempt ? path.join(attempt.folder, 'activity.json') : '';
      const activity = activityFile && fs.existsSync(activityFile) ? loadJson(activityFile) : null;
      const lane = manifest.tasks.find(t => t.id === task)?.lane;
      const progressFile = path.join(root, '.worktrees', `${id}-${lane}`, 'agents/state', `CURRENT_STATE_${task}.md`);
      const progress = fs.existsSync(progressFile) ? fs.readFileSync(progressFile, 'utf8') : '';
      const decision = acceptance.tasks[task] ?? null;
      return { task, lane, status: item.status, effectiveStatus: effectiveTaskStatus(item.status, decision), acceptance: decision, worker: attempt?.worker ?? '-', attempt: item.attempts.length, repairs: item.repairs, progress: `${(progress.match(/\[x\]/gi) ?? []).length}/${(progress.match(/\[[ x]\]/gi) ?? []).length}`, activityAt: activity?.at ? new Date(activity.at).toISOString() : null, tokens: attempt?.tokens ?? activity?.tokens ?? 'unknown', feedback: fullFeedback ? item.feedback ?? '' : item.feedback?.slice(0, 500) ?? '', logFile: attempt?.folder ? path.join(attempt.folder, 'agent.log') : null };
    });
    return { mission: id, status: state.status, effectiveStatus: effectiveMissionStatus(state.status, tasks.map(t => t.effectiveStatus), acceptance.missionDecision ?? null), acceptanceError, runnerAlive: Boolean(state.pid && alive(state.pid)), startedAt: state.startedAt ?? null, budgetMinutes: manifest.budgetMinutes ?? 120, updatedAt: new Date(state.updatedAt).toISOString(), tasks, pools: state.pools };
  });
}
