import os from 'node:os';
import { identifier } from './policy.mjs';
import { loadJson } from './engine.mjs';
import { recordDecision, recordMissionDecision, DECISIONS } from './acceptance.mjs';
import path from 'node:path';
import fs from 'node:fs';

// Splits `command positional... --flag value` into positional arguments and a map of repeatable flags.
export function parseArguments(args) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const name = value.slice(2);
    const next = args[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`FLAG_VALUE_MISSING: --${name}`);
    flags[name] = [...(flags[name] ?? []), next];
    index++;
  }
  const scalar = Object.fromEntries(Object.entries(flags).map(([key, values]) => [key, values.length === 1 ? values[0] : values]));
  return { positional, flags: scalar };
}

function taskIdsOf(root, mission) {
  const manifestFile = path.join(root, '.worktrees/agent-kit', mission, 'mission.json');
  if (!fs.existsSync(manifestFile)) throw new Error('MISSION_NOT_FOUND');
  return loadJson(manifestFile).tasks.map(task => task.id);
}

function listOf(value) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

// Records a manual decision as a committed file. Writes nothing else: runner state is never touched.
export function acceptCommand(root, args) {
  const [command, ...rest] = args;
  const { positional, flags } = parseArguments(rest);
  const mission = positional[0];
  identifier(mission);
  const taskIds = taskIdsOf(root, mission);
  const date = flags.date ?? new Date().toISOString().slice(0, 10);
  const reviewedBy = flags.by ?? os.userInfo().username;
  if (command === 'supersede') {
    recordMissionDecision(root, { mission, taskIds, reason: flags.reason, reviewedBy, date, evidence: listOf(flags.evidence) });
    return `Mission ${mission} recorded as SUPERSEDED.`;
  }
  if (command !== 'accept') throw new Error(`UNKNOWN_ACCEPT_COMMAND: ${command}`);
  const task = positional[1];
  if (!task) throw new Error('TASK_REQUIRED: accept <mission> <task> --decision ...');
  if (!DECISIONS.includes(flags.decision)) throw new Error(`ACCEPTANCE_INVALID: decision must be one of ${DECISIONS.join(', ')}`);
  recordDecision(root, { mission, task, taskIds, decision: flags.decision, reason: flags.reason, reviewedBy, date, evidence: listOf(flags.evidence), manualChecks: listOf(flags.manual) });
  return `Recorded ${flags.decision} for ${mission}/${task}.`;
}
