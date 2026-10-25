import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectWorker, runAgent } from './adapters.mjs';
import { git, runSync } from './process.mjs';
import { saveJson, loadJson } from './engine.mjs';

export async function doctor(root, config, { probe = false } = {}) {
  const system = ['git', 'bash', 'node', 'npm'].map(command => { const result = runSync(command, ['--version']); return { command, ok: result.status === 0, version: result.stdout?.trim() }; });
  const user = ['user.name', 'user.email'].map(key => ({ key, ok: runSync('git', ['-C', root, 'config', '--get', key]).status === 0 }));
  let metadata;
  try { metadata = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']); fs.accessSync(metadata, fs.constants.W_OK); } catch { metadata = null; }
  const results = [];
  const byTool = new Map();
  for (const worker of config.workers) {
    const result = inspectWorker(worker);
    if (worker.tool === 'opencode' && !worker.model) { result.ok = false; result.error = 'MODEL_REQUIRED: select an available provider/model in project.json'; }
    if (worker.tool === 'codex') {
      const login = runSync(worker.command ?? 'codex', ['login', 'status']);
      if (login.status !== 0) { result.ok = false; result.error = 'AUTH: run codex login'; }
    }
    const cacheKey = JSON.stringify([worker.tool, worker.command, worker.model, worker.pool]);
    if (probe && result.ok && system.every(s => s.ok)) {
      if (byTool.has(cacheKey)) result.probe = byTool.get(cacheKey);
      else {
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit preflight '));
        try {
          git(temporary, ['init', '-b', 'main']); git(temporary, ['config', 'user.name', 'Agent Kit Probe']); git(temporary, ['config', 'user.email', 'probe@example.invalid']);
          fs.writeFileSync(path.join(temporary, 'AGENTS.md'), 'This is an isolated preflight repository. Complete only the specified probe.');
          git(temporary, ['add', 'AGENTS.md']); git(temporary, ['commit', '-m', 'test: initialize probe']);
          const before = git(temporary, ['rev-parse', 'HEAD']);
          const run = await runAgent(worker, 'Read AGENTS.md. Without asking questions: create probe.txt containing exactly AGENT_KIT_OK; run node -e "process.exit(0)"; git add probe.txt; git commit -m "test: unattended probe". Do not access any other repository. Report success only after the commit.', { cwd: temporary, timeoutMs: 180000 });
          const file = path.join(temporary, 'probe.txt');
          result.probe = { ok: !run.failure && fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === 'AGENT_KIT_OK' && git(temporary, ['rev-parse', 'HEAD']) !== before && !git(temporary, ['status', '--porcelain']), failure: run.failure, log: run.output.slice(-3000) };
          byTool.set(cacheKey, result.probe);
        } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      }
      worker.qualification = result.probe.ok ? { version: result.version, at: Date.now(), profile: 'full-control' } : null;
    }
    result.qualified = result.ok && worker.qualification?.version === result.version && worker.qualification?.profile === 'full-control';
    results.push(result);
  }
  const report = { system, gitIdentity: user, writableGitMetadata: Boolean(metadata), workers: results, ok: system.every(s => s.ok) && user.every(u => u.ok) && Boolean(metadata) && results.every(r => r.qualified) };
  if (probe) {
    saveJson(path.join(root, 'agents/kit/project.json'), config);
    saveJson(path.join(root, '.worktrees/agent-kit/doctor.json'), report);
  }
  return report;
}
