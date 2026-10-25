import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS } from './adapters.mjs';
import { loadJson, saveJson } from './engine.mjs';
import { git, runSync } from './process.mjs';
import { fail } from './policy.mjs';

export const kitRoot = fileURLToPath(new URL('../../', import.meta.url));
function managedSection(file, text) {
  const begin = '<!-- agent-kit:start -->'; const end = '<!-- agent-kit:end -->';
  const prior = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (prior.includes(begin) !== prior.includes(end)) fail('BROKEN_MARKERS', file);
  const block = `${begin}\n${text.trim()}\n${end}`;
  const next = prior.includes(begin) ? prior.slice(0, prior.indexOf(begin)) + block + prior.slice(prior.indexOf(end) + end.length) : `${prior.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(file, next.trimStart());
}
export function bootstrap({ root, kitRoot: source = kitRoot, coordinator, tools, profile, opencodeModel }) {
  if (profile !== 'full-control') fail('PROFILE', 'Pass --profile full-control to authorize unattended workers in this project');
  if (!['codex', 'claude'].includes(coordinator)) fail('COORDINATOR', 'Choose the kit branch coordinator');
  if (coordinator === 'codex' && tools.includes('claude')) fail('VARIANT', 'This variant excludes that worker');
  if (!tools.length || tools.some(tool => !REQUIREMENTS[tool])) fail('TOOLS', 'Choose supported CLI tools');
  git(root, ['rev-parse', '--show-toplevel']);
  const target = path.join(root, 'agents', 'kit');
  const configFile = path.join(target, 'project.json');
  const existing = fs.existsSync(configFile) ? loadJson(configFile) : null;
  if (existing && (existing.version !== 2 || existing.coordinator !== coordinator)) fail('UPGRADE_REVIEW', 'Review the existing configuration before changing coordinator or major format');
  fs.mkdirSync(target, { recursive: true });
  for (const directory of ['scripts', 'templates']) {
    if (fs.realpathSync(source) !== fs.realpathSync(target)) fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });
  }
  for (const name of ['CLI.md', 'BOOTSTRAP.md', 'README.md', 'README.en.md', 'kit.json']) {
    if (path.resolve(source, name) !== path.resolve(target, name)) fs.copyFileSync(path.join(source, name), path.join(target, name));
  }
  for (const dir of ['agents/state', 'agents/rounds', 'agents/missions']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  const workers = [];
  for (const tool of [...new Set(tools)]) {
    for (let i = 1; i <= (tool === 'codex' ? 2 : 1); i++) {
      const id = tool === 'codex' ? `codex-${i}` : tool;
      const prior = existing?.workers.find(w => w.id === id);
      const worker = prior ?? { id, tool, pool: tool, command: tool === 'cursor' ? (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'cursor-agent', 'agent.ps1') : 'agent') : tool };
      if (tool === 'opencode' && opencodeModel) worker.model = opencodeModel;
      workers.push(worker);
    }
  }
  const manifestPath = path.join(root, 'package.json');
  const project = fs.existsSync(manifestPath) ? loadJson(manifestPath) : {};
  const checks = ['test', 'check', 'lint', 'typecheck'].filter(name => project.scripts?.[name]).map(name => ({ command: 'npm', args: ['run', name] }));
  const config = { ...existing, version: 2, kitVersion: '2.0.0', coordinator, profile, authorizedAt: existing?.authorizedAt ?? new Date().toISOString(), workers, project: existing?.project ?? { name: project.name ?? path.basename(root), checks, realMachine: [], linkDirs: fs.existsSync(path.join(root, 'node_modules')) ? ['node_modules'] : [] } };
  saveJson(configFile, config);
  const fill = text => text.replaceAll('<PROJECT_NAME>', config.project.name);
  managedSection(path.join(root, 'AGENTS.md'), fill(fs.readFileSync(path.join(source, 'templates/AGENTS.md'), 'utf8')));
  managedSection(path.join(root, 'COORDINATOR.md'), fill(fs.readFileSync(path.join(source, 'templates/COORDINATOR.md'), 'utf8')));
  if (coordinator === 'claude') managedSection(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n@COORDINATOR.md');
  const state = path.join(root, 'CURRENT_STATE.md');
  if (!fs.existsSync(state)) fs.writeFileSync(state, `# ${config.project.name}: current state\n\nNo missions yet.\n\nCoordinator: ${coordinator}. Profile: full-control.\nChecks: ${JSON.stringify(config.project.checks)}\nReal-machine validation: unverified.\n`);
  const ignore = path.join(root, '.gitignore');
  const priorIgnore = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  const additions = ['.worktrees/', '.agent-kit-runtime/', 'agents/kit/project.json'].filter(entry => !priorIgnore.split(/\r?\n/).includes(entry));
  if (additions.length) fs.appendFileSync(ignore, `\n# agent-kit local runtime and account configuration\n${additions.join('\n')}\n`);
  fs.copyFileSync(path.join(source, 'templates/STATE_TEMPLATE.md'), path.join(root, 'agents/STATE_TEMPLATE.md'));
  return config;
}

export function installTools(tools) {
  const packages = { codex: '@openai/codex', claude: '@anthropic-ai/claude-code', copilot: '@github/copilot', opencode: 'opencode-ai' };
  const results = [];
  for (const tool of tools) {
    const installed = runSync(tool === 'cursor' ? (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'cursor-agent/agent.ps1') : 'agent') : tool, ['--version']);
    if (installed.status === 0) { results.push({ tool, installed: true, retained: installed.stdout?.trim() }); continue; }
    if (tool === 'cursor') { results.push({ tool, installed: false, action: 'Install Cursor Agent using https://cursor.com/docs/cli/installation; then rerun doctor.' }); continue; }
    if (!packages[tool]) fail('TOOLS', tool);
    const result = runSync('npm', ['install', '--global', packages[tool]], { timeout: 300000 });
    results.push({ tool, installed: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-4000) });
  }
  return results;
}
