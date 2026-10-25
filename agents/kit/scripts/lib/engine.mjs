import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FINAL, validateMission, dependencyStatus, selectWorker, owns, fail, identifier, relativePath } from './policy.mjs';
import { git, execute, alive, terminate } from './process.mjs';

export function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const supervisor = fileURLToPath(new URL('./attempt.mjs', import.meta.url));

export class MissionRunner {
  constructor({ root, config, manifest, waitForCapacity = false }) {
    this.root = fs.realpathSync(root);
    this.config = config;
    this.manifest = validateMission(structuredClone(manifest));
    if (config.version !== 2 || config.profile !== 'full-control') fail('PROFILE', 'Initialize version 2 with full-control');
    if (!Array.isArray(config.workers) || !config.workers.length) fail('WORKERS', 'Configure at least one worker');
    const workerIds = new Set();
    for (const worker of config.workers) {
      identifier(worker.id); identifier(worker.pool);
      if (workerIds.has(worker.id)) fail('DUPLICATE_WORKER', worker.id);
      workerIds.add(worker.id);
    }
    if (config.workers.filter(w => w.tool === 'codex').length > 2) fail('CAPACITY', 'At most two Codex workers per project');
    for (const task of manifest.tasks) if (!task.workers.some(tool => config.workers.some(w => w.tool === tool))) fail('NO_COMPATIBLE_WORKER', task.id);
    if (config.coordinator === 'codex' && config.workers.some(w => w.tool === 'claude')) fail('VARIANT', 'This coordinator variant excludes that tool');
    this.directory = path.join(this.root, '.worktrees', 'agent-kit', manifest.id);
    this.stateFile = path.join(this.directory, 'state.json');
    this.controlFile = path.join(this.directory, 'control.json');
    this.lockFile = path.join(this.directory, 'runner.lock');
    this.poolFile = path.join(this.root, '.worktrees', 'agent-kit', 'pools.json');
    this.waitForCapacity = waitForCapacity;
    this.fingerprint = crypto.createHash('sha256').update(JSON.stringify(this.manifest)).digest('hex');
    if (fs.existsSync(this.stateFile)) {
      this.state = loadJson(this.stateFile);
      if (this.state.fingerprint !== this.fingerprint) fail('MISSION_CHANGED', 'Use a new mission id for a changed scope');
    } else {
      this.state = { version: 2, id: manifest.id, fingerprint: this.fingerprint, startedAt: Date.now(), status: 'READY', tasks: Object.fromEntries(manifest.tasks.map(t => [t.id, { status: 'READY', attempts: [], repairs: 0, excluded: [] }])), workers: {}, pools: fs.existsSync(this.poolFile) ? loadJson(this.poolFile) : {} };
    }
    this.active = new Map();
    // A known reset entered while stopped overrides the mission snapshot.
    if (fs.existsSync(this.poolFile)) this.state.pools = loadJson(this.poolFile);
    for (const pool of Object.values(this.state.pools)) if (pool.mission !== manifest.id) { pool.exhausted = false; pool.failures = 0; }
  }
  lanePath(lane) { return path.join(this.root, '.worktrees', `${this.manifest.id}-${lane}`); }
  branch(lane) { return `mission/${this.manifest.id}/${lane}`; }
  persist() {
    const snapshot = JSON.stringify({ ...this.state, updatedAt: undefined });
    if (snapshot === this.lastSnapshot) return;
    this.state.updatedAt = Date.now(); saveJson(this.stateFile, this.state);
    const pools = JSON.stringify(this.state.pools);
    if (pools !== this.lastPools) { saveJson(this.poolFile, this.state.pools); this.lastPools = pools; }
    this.lastSnapshot = snapshot;
  }
  acquire() {
    fs.mkdirSync(this.directory, { recursive: true });
    if (fs.existsSync(this.lockFile)) {
      const lock = loadJson(this.lockFile);
      if (alive(lock.pid)) fail('RUNNER_ACTIVE', `PID ${lock.pid}`);
      fs.unlinkSync(this.lockFile);
    }
    fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    this.hasLock = true;
    // Pool state is shared across missions. Serialize project schedulers to avoid double allocation.
    this.projectLock = path.join(this.root, '.worktrees', 'agent-kit', 'scheduler.lock');
    try {
      if (fs.existsSync(this.projectLock) && !alive(loadJson(this.projectLock).pid)) fs.unlinkSync(this.projectLock);
      fs.writeFileSync(this.projectLock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
    } catch (error) { fs.unlinkSync(this.lockFile); this.hasLock = false; fail('PROJECT_RUNNER_ACTIVE', error.message); }
  }
  release() {
    if (!this.hasLock) return;
    fs.rmSync(this.lockFile, { force: true }); fs.rmSync(this.projectLock, { force: true }); this.hasLock = false;
  }
  prepareLane(task) {
    const dir = this.lanePath(task.lane);
    if (!fs.existsSync(dir)) {
      git(this.root, ['worktree', 'add', '-b', this.branch(task.lane), dir, this.manifest.base]);
    }
    if (git(dir, ['branch', '--show-current']) !== this.branch(task.lane)) fail('WORKTREE_BRANCH', dir);
    if (!fs.existsSync(path.join(dir, 'AGENTS.md'))) fail('INSTRUCTIONS_MISSING', 'Commit the project bootstrap before starting a mission');
    const laneChangesDependencies = this.manifest.tasks.filter(t => t.lane === task.lane).some(t => ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].some(file => owns(t.owned, file)));
    if (!laneChangesDependencies) for (const raw of this.config.project?.linkDirs ?? []) {
      const relative = relativePath(raw);
      const source = path.join(this.root, relative); const link = path.join(dir, relative);
      if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail('DEPENDENCY_DIRECTORY_MISSING', relative);
      const ignored = git(this.root, ['check-ignore', '--', relative]);
      if (!ignored) fail('DEPENDENCY_NOT_IGNORED', relative);
      if (!fs.existsSync(link)) {
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
      }
    }
    const common = git(this.root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const exclude = path.join(common, 'info', 'exclude');
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    for (const entry of ['.agent-kit-runtime/', '.worktrees/']) if (!existing.split(/\r?\n/).includes(entry)) fs.appendFileSync(exclude, `\n${entry}\n`);
    const runtime = path.join(dir, '.agent-kit-runtime'); fs.mkdirSync(runtime, { recursive: true });
    return { dir, runtime };
  }
  async attempt(task, worker) {
    const item = this.state.tasks[task.id];
    const { dir, runtime } = this.prepareLane(task);
    const index = item.attempts.length + 1;
    const folder = path.join(this.directory, 'attempts', task.id, String(index));
    fs.mkdirSync(folder, { recursive: true });
    const report = path.join(runtime, 'result.json'); fs.rmSync(report, { force: true });
    fs.rmSync(path.join(runtime, 'control.json'), { force: true });
    const taskFile = path.join(runtime, 'task.json'); saveJson(taskFile, task);
    const prior = item.feedback ?? 'No prior failures.';
    const prompt = [
      '# Accepted worker assignment', `Task: ${task.id}; lane: ${task.lane}; worktree: ${dir}; branch: ${this.branch(task.lane)}.`,
      'Role: WORKER. Profile: FULL CONTROL. Work autonomously through every accepted item; do not ask for routine approval. Read AGENTS.md. Do not act as coordinator.',
      `Owned paths: ${JSON.stringify(task.owned)}. You may also update agents/state/CURRENT_STATE_${task.id}.md. No other paths.`,
      'Do not merge, push, reset, clean, discard existing changes, read credential files, or edit another worktree. Preserve unfinished work from previous attempts.',
      'Configured dependency links are shared read-only inputs: do not install into or remove linked dependency directories. Lanes changing package manifests use isolated dependencies; follow their accepted install instructions.',
      'Create/update your state file first. Use RED -> GREEN -> REFACTOR for behavior changes and regression fixes. Commit completed checkpoints with English messages. Continue until all accepted items are complete.',
      'Before each milestone, check .agent-kit-runtime/control.json when present. On pause/stop, finish the next safe checkpoint, record precise resume notes and exit without starting another milestone.',
      task.prompt, '\n## Acceptance', ...task.acceptance.map(c => `- ${c}`), '\n## Required checks', JSON.stringify(task.checks, null, 2),
      '\n## Handover and repair feedback', prior,
      `Write ${report} as JSON: {"status":"DONE|PARTIAL|BLOCKED|OUT_OF_BUDGET","summary":"nonempty","acceptance":[{"criterion":"exact acceptance criterion","evidence":"actual evidence"}],"unverified":[],"resumeNotes":"remaining work or empty"}.`,
      'Never claim checks or real-machine observations you did not perform. If blocked, preserve work and explain exactly what remains.',
    ].join('\n');
    fs.writeFileSync(path.join(runtime, 'TASK.md'), `${prompt}\n`);
    const requestFile = path.join(folder, 'request.json');
    const attempt = { worker: worker.id, tool: worker.tool, pool: worker.pool, startedAt: Date.now(), folder, status: 'RUNNING' };
    item.attempts.push(attempt); item.status = 'RUNNING';
    const budget = (this.manifest.attemptMinutes ?? 60) * 60000;
    const deadline = this.state.startedAt + (this.manifest.budgetMinutes ?? 120) * 60000 + (this.manifest.graceMinutes ?? 10) * 60000;
    saveJson(requestFile, { worker, prompt: 'Read AGENTS.md and .agent-kit-runtime/TASK.md, then complete the entire assignment.', cwd: dir, timeoutMs: Math.max(1, Math.min(budget, deadline - Date.now())), taskFile, report, folder });
    const child = spawn(process.execPath, [supervisor, requestFile], { cwd: dir, detached: true, windowsHide: true, stdio: 'ignore' });
    const pid = await new Promise((resolve, reject) => { child.once('spawn', () => resolve(child.pid)); child.once('error', reject); });
    attempt.pid = pid; child.unref(); this.persist();
    await this.observe(task, attempt);
  }
  async observe(task, attempt) {
    const resultFile = path.join(attempt.folder, 'exit.json');
    while (!fs.existsSync(resultFile)) {
      if (!attempt.pid && fs.existsSync(path.join(attempt.folder, 'supervisor.json'))) attempt.pid = loadJson(path.join(attempt.folder, 'supervisor.json')).pid;
      if (!alive(attempt.pid)) {
        await sleep(100);
        if (!fs.existsSync(resultFile)) { await this.handleResult(task, attempt, { failure: 'CRASH', code: 1, output: 'Attempt supervisor exited without a result' }); return; }
      }
      const control = fs.existsSync(this.controlFile) ? loadJson(this.controlFile) : {};
      if (control.action) saveJson(path.join(this.lanePath(task.lane), '.agent-kit-runtime', 'control.json'), control);
      const now = Date.now();
      const deadline = this.state.startedAt + (this.manifest.budgetMinutes ?? 120) * 60000;
      if (control.action === 'stop' || ((control.action === 'pause' ? now - control.at : now - deadline) > (this.manifest.graceMinutes ?? 10) * 60000)) {
        const processFile = path.join(attempt.folder, 'process.json');
        if (fs.existsSync(processFile)) terminate(loadJson(processFile).pid);
        terminate(attempt.pid);
        await this.handleResult(task, attempt, { failure: 'CANCELLED', code: 1, output: 'Stopped with work preserved' }); return;
      }
      await sleep(100);
    }
    await this.handleResult(task, attempt, loadJson(resultFile));
  }
  changedFiles(dir) {
    return [...new Set([
      ...git(dir, ['diff', '--name-only', '-z', `${this.manifest.base}...HEAD`]).split('\0'),
      ...git(dir, ['diff', '--name-only', '-z', 'HEAD']).split('\0'),
      ...git(dir, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ].filter(Boolean))];
  }
  async handleResult(task, attempt, result) {
    const item = this.state.tasks[task.id];
    attempt.finishedAt = Date.now(); attempt.code = result.code; attempt.failure = result.failure; attempt.status = 'FINISHED';
    attempt.tokens = result.tokens ?? null;
    item.feedback = result.output?.slice(-12000) ?? '';
    if (result.failure) {
      const failure = result.failure;
      if (failure === 'LIMIT') {
        const pool = this.state.pools[attempt.pool] ?? {};
        this.state.pools[attempt.pool] = { until: Number.isFinite(result.resetAt) ? Math.max(result.resetAt, Date.now() + 1000) : Date.now() + 3600000, failures: (pool.failures ?? 0) + 1, exhausted: pool.mission === this.manifest.id && pool.failures >= 1, mission: this.manifest.id };
      } else if (['AUTH', 'PERMISSION', 'CONFIG'].includes(failure)) {
        for (const worker of this.config.workers.filter(w => w.tool === attempt.tool && w.pool === attempt.pool)) this.state.workers[worker.id] = { disabled: failure };
      } else if (failure === 'CANCELLED') {
        item.status = 'PAUSED'; this.persist(); return;
      } else {
        const count = item.attempts.filter(a => a.worker === attempt.worker && a.failure === failure).length;
        if (failure !== 'TRANSIENT' || count >= 2) item.excluded.push(attempt.worker);
      }
      item.status = 'READY'; this.persist(); return;
    }
    const dir = this.lanePath(task.lane);
    // The whole lane may contain verified changes from earlier packages.
    const laneTasks = this.manifest.tasks.filter(t => t.lane === task.lane && (t.id === task.id || this.state.tasks[t.id].status === 'VERIFIED'));
    const owned = laneTasks.flatMap(t => [...t.owned, `agents/state/CURRENT_STATE_${t.id}.md`]);
    const outside = this.changedFiles(dir).filter(file => !owns(owned, file));
    if (outside.length) { item.status = 'NEEDS_REVIEW'; item.feedback = `OWNERSHIP_VIOLATION: ${outside.join(', ')}`; this.persist(); return; }
    let report;
    try { report = loadJson(path.join(dir, '.agent-kit-runtime', 'result.json')); } catch { report = null; }
    if (!report || typeof report.summary !== 'string' || !report.summary.trim() || !Array.isArray(report.unverified) || typeof report.resumeNotes !== 'string' || !['DONE', 'PARTIAL', 'BLOCKED', 'OUT_OF_BUDGET'].includes(report.status)) {
      await this.repair(task, 'REPORT_INVALID: missing or invalid worker report'); return;
    }
    item.report = report;
    if (report.status !== 'DONE') {
      item.status = report.status === 'BLOCKED' ? 'BLOCKED' : 'READY';
      item.feedback = report.resumeNotes;
      item.excluded.push(attempt.worker); this.persist(); return;
    }
    const missingEvidence = task.acceptance.filter(c => !report.acceptance?.some(e => e.criterion === c && typeof e.evidence === 'string' && e.evidence.trim()));
    if (missingEvidence.length) { await this.repair(task, `ACCEPTANCE_EVIDENCE_MISSING: ${missingEvidence.join('; ')}`); return; }
    item.status = 'VERIFYING'; this.persist();
    for (let index = 0; index < task.checks.length; index++) {
      const check = task.checks[index];
      const log = path.join(attempt.folder, `check-${index + 1}.log`);
      const deadline = this.state.startedAt + ((this.manifest.budgetMinutes ?? 120) + (this.manifest.graceMinutes ?? 10)) * 60000;
      const checked = await execute(check.command, check.args, { cwd: dir, timeoutMs: Math.max(1, Math.min(check.timeoutMs ?? 300000, 3600000, deadline - Date.now())), onData: text => fs.appendFileSync(log, text), onStart: pid => { attempt.checkPid = pid; this.persist(); }, shouldStop: () => {
        const control = fs.existsSync(this.controlFile) ? loadJson(this.controlFile) : {};
        return control.action === 'stop' || (control.action === 'pause' && Date.now() - control.at > (this.manifest.graceMinutes ?? 10) * 60000);
      } });
      delete attempt.checkPid;
      if (checked.cancelled) { item.status = 'PAUSED'; this.persist(); return; }
      if (checked.code !== 0 || checked.timedOut) { await this.repair(task, `CHECK_FAILED ${check.command} ${JSON.stringify(check.args)}\n${checked.output}`); return; }
    }
    // Checks can write files too. Do not silently accept a formatter or generator crossing ownership.
    const unexpected = this.changedFiles(dir).filter(file => !owns(owned, file));
    if (unexpected.length) { item.status = 'NEEDS_REVIEW'; item.feedback = `CHECK_OWNERSHIP_VIOLATION: ${unexpected.join(', ')}`; }
    // Keep the reason visible: the coordinator must know which claims still need a real-machine check.
    else { item.status = report.unverified.length ? 'NEEDS_REVIEW' : 'VERIFIED'; item.feedback = report.unverified.length ? `UNVERIFIED: ${report.unverified.map(String).join('; ')}` : ''; }
    this.persist();
  }
  async repair(task, feedback) {
    const item = this.state.tasks[task.id];
    item.feedback = feedback;
    if (item.repairs >= 2) item.status = 'NEEDS_REVIEW';
    else { item.repairs++; item.status = 'READY'; }
    this.persist();
  }
  async run() {
    this.acquire();
    try {
      this.state.status = 'RUNNING'; this.state.pid = process.pid; this.persist();
      for (const task of this.manifest.tasks) {
        const item = this.state.tasks[task.id];
        if (['RUNNING', 'VERIFYING'].includes(item.status)) {
          const attempt = item.attempts.at(-1);
          if (attempt.checkPid && alive(attempt.checkPid)) terminate(attempt.checkPid);
          const promise = this.observe(task, attempt).finally(() => this.active.delete(task.id)); this.active.set(task.id, promise);
        } else if (['PAUSED', 'WAITING_CAPACITY'].includes(item.status)) item.status = 'READY';
      }
      for (;;) {
        const control = fs.existsSync(this.controlFile) ? loadJson(this.controlFile) : {};
        const expired = Date.now() - this.state.startedAt >= (this.manifest.budgetMinutes ?? 120) * 60000;
        if (!control.action && !expired) {
          for (const task of this.manifest.tasks) {
            const item = this.state.tasks[task.id];
            if (FINAL.has(item.status) || this.active.has(task.id)) continue;
            const dependency = dependencyStatus(task, this.manifest.tasks, this.state);
            item.status = dependency;
            if (dependency !== 'READY') continue;
            const preceding = this.manifest.tasks.slice(0, this.manifest.tasks.indexOf(task)).filter(t => t.lane === task.lane);
            if (preceding.some(t => this.state.tasks[t.id].status !== 'VERIFIED')) { item.status = 'WAITING_DEPENDENCY'; continue; }
            const running = [...this.active.keys()].map(id => this.state.tasks[id].attempts.at(-1));
            const worker = selectWorker(task, this.config.workers, this.state, running.map(a => a.worker));
            if (!worker) { item.status = 'WAITING_CAPACITY'; continue; }
            // Reserve the lane synchronously before the child is spawned.
            item.status = 'RUNNING';
            const promise = this.attempt(task, worker).catch(error => { item.status = 'NEEDS_REVIEW'; item.feedback = error.message; }).finally(() => this.active.delete(task.id));
            this.active.set(task.id, promise);
          }
        }
        this.persist();
        if (!this.active.size) {
          if (control.action || expired) { this.state.status = control.action === 'stop' ? 'STOPPED' : control.action === 'pause' ? 'PAUSED' : 'BUDGET_EXHAUSTED'; break; }
          if (Object.values(this.state.tasks).every(t => FINAL.has(t.status))) { this.state.status = Object.values(this.state.tasks).every(t => t.status === 'VERIFIED') ? 'VERIFIED' : 'NEEDS_REVIEW'; break; }
          const canRecover = Object.values(this.state.pools).some(p => !p.exhausted && p.until > Date.now() && p.until < this.state.startedAt + (this.manifest.budgetMinutes ?? 120) * 60000);
          if (!this.waitForCapacity || !canRecover) { this.state.status = 'NEEDS_ATTENTION'; break; }
        }
        await Promise.race([...this.active.values(), sleep(250)]);
      }
      this.persist();
      fs.writeFileSync(path.join(this.directory, 'REPORT.md'), `# Mission ${this.manifest.id}: ${this.state.status}\n\n${this.manifest.tasks.map(t => `- ${t.id}: ${this.state.tasks[t.id].status}; branch ${this.branch(t.lane)}; attempts ${this.state.tasks[t.id].attempts.length}\n  ${this.state.tasks[t.id].feedback ?? ''}`).join('\n')}\n\nNo merge or push performed. Coordinator review and user acceptance are required.\n`);
      return this.state;
    } finally { this.release(); }
  }
}
