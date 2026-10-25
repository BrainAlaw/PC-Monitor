#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MissionRunner, loadJson, saveJson } from './lib/engine.mjs';
import { doctor } from './lib/doctor.mjs';
import { git, alive } from './lib/process.mjs';
import { identifier, validateMission } from './lib/policy.mjs';

const self = fileURLToPath(import.meta.url);
async function main() {
  const [command, input, ...rest] = process.argv.slice(2);
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
  const directory = path.join(root, '.worktrees/agent-kit');
  const configFile = path.join(root, 'agents/kit/project.json');
  if (command === 'doctor') {
    const result = await doctor(root, loadJson(configFile), { probe: [input, ...rest].includes('--probe') });
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1; return;
  }
  if (['status', 'watch'].includes(command)) {
    if (input) identifier(input);
    const display = () => {
      const ids = input ? [input] : fs.existsSync(directory) ? fs.readdirSync(directory).filter(id => fs.existsSync(path.join(directory, id, 'state.json'))) : [];
      const rows = ids.map(id => {
        const state = loadJson(path.join(directory, id, 'state.json'));
        return { mission: id, status: state.status, runnerAlive: Boolean(state.pid && alive(state.pid)), updatedAt: new Date(state.updatedAt).toISOString(), tasks: Object.entries(state.tasks).map(([task, item]) => {
          const attempt = item.attempts.at(-1); const activityFile = attempt ? path.join(attempt.folder, 'activity.json') : '';
          const activity = activityFile && fs.existsSync(activityFile) ? loadJson(activityFile) : null;
          const manifest = loadJson(path.join(directory, id, 'mission.json'));
          const lane = manifest.tasks.find(t => t.id === task)?.lane;
          const progressFile = path.join(root, '.worktrees', `${id}-${lane}`, 'agents/state', `CURRENT_STATE_${task}.md`);
          const progress = fs.existsSync(progressFile) ? fs.readFileSync(progressFile, 'utf8') : '';
          return { task, status: item.status, worker: attempt?.worker ?? '-', attempt: item.attempts.length, repairs: item.repairs, progress: `${(progress.match(/\[x\]/g) ?? []).length}/${(progress.match(/\[[ x]\]/g) ?? []).length}`, activityAt: activity?.at ? new Date(activity.at).toISOString() : null, tokens: attempt?.tokens ?? activity?.tokens ?? 'unknown', feedback: item.feedback?.slice(0, 500) ?? '' };
        }), pools: state.pools };
      });
      const output = JSON.stringify(rows, null, 2);
      return output;
    };
    let prior = '';
    const frame = () => { const next = display(); if (next !== prior) { console.log(next); prior = next; } };
    frame(); if (command === 'watch') setInterval(frame, 2000);
    return;
  }
  if (['pause', 'stop'].includes(command)) {
    identifier(input);
    const folder = path.join(directory, input);
    if (!fs.existsSync(path.join(folder, 'state.json'))) throw new Error('MISSION_NOT_FOUND');
    saveJson(path.join(folder, 'control.json'), { action: command, at: Date.now() });
    console.log(`${command} requested. Work is preserved; inspect status for completion.`); return;
  }
  if (['start', 'resume', '_run'].includes(command)) {
    const config = loadJson(configFile);
    let manifest;
    if (command === 'start') manifest = validateMission(loadJson(path.resolve(input)));
    else { identifier(input); manifest = loadJson(path.join(directory, input, 'mission.json')); }
    const runner = new MissionRunner({ root, config, manifest, waitForCapacity: true });
    if (command === '_run') { await runner.run(); return; }
    if (fs.existsSync(runner.lockFile) && alive(loadJson(runner.lockFile).pid)) throw new Error('RUNNER_ACTIVE');
    const diagnosis = await doctor(root, config);
    if (!diagnosis.ok) { console.error(JSON.stringify(diagnosis, null, 2)); throw new Error('PREFLIGHT_FAILED: run doctor --probe; repair or remove unavailable workers from project.json'); }
    if (command === 'start' && git(root, ['status', '--porcelain'])) throw new Error('DIRTY_CHECKOUT: review and commit or stash project changes before start');
    saveJson(path.join(runner.directory, 'mission.json'), manifest);
    if (command === 'resume') {
      fs.rmSync(runner.controlFile, { force: true });
      // Resume is explicit authorization for another window using the same accepted scope.
      runner.state.startedAt = Date.now();
      for (const pool of Object.values(runner.state.pools)) if (pool.until <= Date.now()) pool.exhausted = false;
      runner.persist();
    }
    const log = fs.openSync(path.join(runner.directory, 'runner.log'), 'a');
    const child = spawn(process.execPath, [self, '_run', manifest.id], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref(); fs.closeSync(log);
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (fs.existsSync(runner.lockFile) && loadJson(runner.lockFile).pid === child.pid) { started = true; break; }
      if (!alive(child.pid)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!started && (!fs.existsSync(runner.stateFile) || loadJson(runner.stateFile).pid !== child.pid)) throw new Error(`START_FAILED: inspect ${runner.directory}/runner.log`);
    console.log(`Mission ${manifest.id}, runner PID ${child.pid}. Watch: node agents/kit/scripts/runner.mjs watch ${manifest.id}`); return;
  }
  throw new Error('Usage: runner.mjs doctor [--probe] | start <manifest.json> | status|watch [mission] | pause|resume|stop <mission>');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
