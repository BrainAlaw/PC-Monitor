import { execute, runSync } from './process.mjs';
import { classifyFailure } from './policy.mjs';

export const REQUIREMENTS = {
  codex: ['--dangerously-bypass-approvals-and-sandbox', '--json'],
  claude: ['--dangerously-skip-permissions', '--output-format'],
  copilot: ['--autopilot', '--allow-all', '--no-ask-user'],
  cursor: ['--force', '--trust', '--sandbox', '--approve-mcps'],
  opencode: ['--auto', '--format'],
};
export function agentArguments(tool, prompt, worker = {}) {
  const model = worker.model ? ['--model', worker.model] : [];
  switch (tool) {
    case 'codex': return ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json', ...model, prompt];
    case 'claude': return ['--print', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', ...model, prompt];
    case 'copilot': return ['--autopilot', '--allow-all', '--no-ask-user', '--max-autopilot-continues', '20', ...model, '-p', prompt];
    case 'cursor': return ['-p', prompt, '--force', '--trust', '--sandbox', 'disabled', '--approve-mcps', '--output-format', 'stream-json', ...model];
    case 'opencode': return ['run', '--auto', '--format', 'json', ...model, prompt];
    default: throw new Error(`UNSUPPORTED_TOOL: ${tool}`);
  }
}
export function agentEnvironment(tool) {
  // An intentionally independent CLI worker must not inherit the parent chat's nested-session marker.
  if (tool === 'claude') return { CLAUDECODE: undefined };
  return tool === 'opencode' ? { OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: 'allow' }) } : {};
}
export function inspectWorker(worker) {
  const command = worker.command ?? (worker.tool === 'cursor' ? 'agent' : worker.tool);
  const version = runSync(command, ['--version']);
  const help = runSync(command, worker.tool === 'codex' ? ['exec', '--help'] : worker.tool === 'opencode' ? ['run', '--help'] : ['--help']);
  const text = `${help.stdout ?? ''}\n${help.stderr ?? ''}`;
  const missing = (REQUIREMENTS[worker.tool] ?? []).filter(flag => !text.includes(flag));
  return { id: worker.id, command, version: version.stdout?.trim(), ok: version.status === 0 && help.status === 0 && !missing.length, missing, error: version.error?.message ?? (version.status !== 0 ? version.stderr : undefined) };
}
export async function runAgent(worker, prompt, options) {
  const result = await execute(worker.command ?? (worker.tool === 'cursor' ? 'agent' : worker.tool), [...(worker.prefixArgs ?? []), ...agentArguments(worker.tool, prompt, worker)], { ...options, env: { ...agentEnvironment(worker.tool), ...worker.env } });
  const errors = result.output.split(/\r?\n/).flatMap(line => {
    try { const event = JSON.parse(line); return event.type === 'error' || event.type === 'turn.failed' || event.is_error === true ? [JSON.stringify(event)] : []; } catch { return []; }
  });
  const errorOutput = errors.length ? errors.join('\n') : result.output;
  const epoch = /"(?:reset_at|resets_at)"\s*:\s*"?(\d{10,13})/.exec(errorOutput)?.[1];
  const resetAt = epoch ? Number(epoch) * (epoch.length === 10 ? 1000 : 1) : undefined;
  return { ...result, resetAt, failure: result.timedOut ? 'TIMEOUT' : classifyFailure(errorOutput, errors.length ? 1 : result.code) };
}
