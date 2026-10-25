import fs from 'node:fs';
import path from 'node:path';

// Manual acceptance records live in the committed project, never in runner state.
// The runner keeps its own status; these records only add a reviewed or accepted view on top.
// REVIEWED: code and automated checks were reviewed; manual checks are still pending.
// ACCEPTED: the user signed off after manual checks. Record it only on the user's explicit word.
// SUPERSEDED: replaced by other work; the task (or whole mission) is no longer pending.
export const DECISIONS = ['REVIEWED', 'ACCEPTED', 'SUPERSEDED'];
const ATTENTION = new Set(['NEEDS_REVIEW', 'NEEDS_ATTENTION', 'BLOCKED', 'WAITING_CAPACITY', 'WAITING_DEPENDENCY', 'WAITING_INTEGRATION']);
const DONE = new Set(['VERIFIED', 'ACCEPTED', 'SUPERSEDED']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function acceptanceFile(root, mission) {
  return path.join(root, 'agents/kit/acceptances', `${mission}.json`);
}

function validateEntry(entry, label) {
  if (!entry || typeof entry !== 'object') throw new Error(`ACCEPTANCE_INVALID: entry for ${label} must be an object`);
  if (!DECISIONS.includes(entry.decision)) throw new Error(`ACCEPTANCE_INVALID: decision for ${label} must be one of ${DECISIONS.join(', ')}`);
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) throw new Error(`ACCEPTANCE_INVALID: reason for ${label} must be at least 10 characters`);
  if (typeof entry.reviewedBy !== 'string' || !entry.reviewedBy.trim()) throw new Error(`ACCEPTANCE_INVALID: reviewedBy for ${label} is required`);
  if (typeof entry.date !== 'string' || !DATE.test(entry.date)) throw new Error(`ACCEPTANCE_INVALID: date for ${label} must be YYYY-MM-DD`);
  for (const list of ['evidence', 'manualChecks']) {
    if (entry[list] !== undefined && (!Array.isArray(entry[list]) || entry[list].some(item => typeof item !== 'string'))) throw new Error(`ACCEPTANCE_INVALID: ${list} for ${label} must be a list of strings`);
  }
}

export function validateAcceptance(document, taskIds, mission) {
  if (!document || typeof document !== 'object' || document.version !== 1) throw new Error('ACCEPTANCE_INVALID: version must be 1');
  if (typeof document.mission !== 'string' || !document.mission) throw new Error('ACCEPTANCE_INVALID: mission is required');
  if (mission !== undefined && document.mission !== mission) throw new Error(`ACCEPTANCE_INVALID: mission ${document.mission} stored under ${mission}`);
  if (!document.tasks || typeof document.tasks !== 'object' || Array.isArray(document.tasks)) throw new Error('ACCEPTANCE_INVALID: tasks must be an object');
  for (const [task, entry] of Object.entries(document.tasks)) {
    if (!taskIds.includes(task)) throw new Error(`ACCEPTANCE_INVALID: unknown task ${task}`);
    validateEntry(entry, task);
  }
  if (document.missionDecision !== undefined) {
    validateEntry(document.missionDecision, 'mission');
    if (document.missionDecision.decision !== 'SUPERSEDED') throw new Error('ACCEPTANCE_INVALID: mission decision must be SUPERSEDED');
  }
  return document;
}

export function loadAcceptance(root, mission, taskIds) {
  const file = acceptanceFile(root, mission);
  if (!fs.existsSync(file)) return { version: 1, mission, tasks: {} };
  return validateAcceptance(JSON.parse(fs.readFileSync(file, 'utf8')), taskIds, mission);
}

function writeAcceptance(root, mission, taskIds, current) {
  validateAcceptance(current, taskIds, mission);
  const file = acceptanceFile(root, mission);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ordered = { version: 1, mission, ...(current.missionDecision ? { missionDecision: current.missionDecision } : {}), tasks: Object.fromEntries(Object.keys(current.tasks).sort().map(key => [key, current.tasks[key]])) };
  fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
  return ordered;
}

export function recordDecision(root, { mission, task, taskIds, decision, reason, reviewedBy, date, evidence = [], manualChecks = [] }) {
  if (!taskIds.includes(task)) throw new Error(`ACCEPTANCE_INVALID: unknown task ${task}`);
  const current = loadAcceptance(root, mission, taskIds);
  current.tasks[task] = { decision, reason, reviewedBy, date, evidence, manualChecks };
  return writeAcceptance(root, mission, taskIds, current);
}

export function recordMissionDecision(root, { mission, taskIds, reason, reviewedBy, date, evidence = [] }) {
  const current = loadAcceptance(root, mission, taskIds);
  current.missionDecision = { decision: 'SUPERSEDED', reason, reviewedBy, date, evidence };
  return writeAcceptance(root, mission, taskIds, current);
}

export function effectiveTaskStatus(status, entry) {
  if (!entry || status === 'VERIFIED') return status;
  if (entry.decision === 'SUPERSEDED') return ATTENTION.has(status) ? 'SUPERSEDED' : status;
  if (ATTENTION.has(status)) return entry.decision === 'ACCEPTED' ? 'ACCEPTED' : entry.decision === 'REVIEWED' ? 'REVIEWED' : status;
  return status;
}

export function effectiveMissionStatus(status, taskStatuses, missionDecision) {
  if (missionDecision?.decision === 'SUPERSEDED') return 'SUPERSEDED';
  if (status === 'VERIFIED') return 'VERIFIED';
  if (taskStatuses.length && taskStatuses.every(s => DONE.has(s))) return 'ACCEPTED';
  return status;
}
