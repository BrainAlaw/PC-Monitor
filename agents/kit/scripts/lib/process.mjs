import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export function commandSpec(command, args = []) {
  if (process.platform !== 'win32' || command === process.execPath) return { command, args };
  const folders = command.includes('/') || command.includes('\\') ? [''] : (process.env.PATH ?? '').split(path.delimiter);
  for (const folder of folders) {
    for (const suffix of path.extname(command) ? [''] : ['.exe', '.cmd', '.ps1', '']) {
      const file = path.resolve(folder, command + suffix);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      if (/\.cmd$/i.test(file)) {
        const shim = fs.readFileSync(file, 'utf8');
        // npm.cmd mentions npm-prefix.js before npm-cli.js; execute the final entrypoint.
        const match = [...shim.matchAll(/%(?:dp0%|~dp0)[\\/]([^"\r\n]+?\.(?:mjs|cjs|js))/gi)].at(-1);
        if (match) return { command: process.execPath, args: [path.resolve(path.dirname(file), match[1]), ...args] };
        continue;
      }
      if (/\.ps1$/i.test(file)) return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', file, ...args] };
      return { command: file, args };
    }
  }
  return { command, args };
}
export function runSync(command, args, options = {}) {
  const spec = commandSpec(command, args);
  return spawnSync(spec.command, spec.args, { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024, ...options });
}
export function git(root, args) {
  const result = runSync('git', ['-C', root, ...args]);
  if (result.error || result.status !== 0) throw new Error(`GIT: ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
export function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
export function terminate(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0 && alive(pid)) throw new Error(`STOP_FAILED: ${pid}`);
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { if (alive(pid)) process.kill(pid, 'SIGKILL'); }
  }
}
export function execute(command, args, { cwd, env = {}, timeoutMs = 3600000, onData = () => {}, onStart = () => {}, shouldStop = () => false } = {}) {
  const spec = commandSpec(command, args);
  return new Promise(resolve => {
    // PWD follows cwd: CLIs that resolve their project from PWD must not see the coordinator's directory.
    const child = spawn(spec.command, spec.args, { cwd, env: { ...process.env, ...(cwd ? { PWD: cwd } : {}), ...env }, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let timedOut = false; let cancelled = false;
    const receive = data => { const text = data.toString(); output = (output + text).slice(-262144); onData(text); };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.once('spawn', () => onStart(child.pid));
    const timer = setTimeout(() => { timedOut = true; try { terminate(child.pid); } catch (error) { receive(error.message); } }, timeoutMs);
    const cancellation = setInterval(() => {
      if (!cancelled && shouldStop()) { cancelled = true; try { terminate(child.pid); } catch (error) { receive(error.message); } }
    }, 100);
    child.once('error', error => receive(error.message));
    child.once('close', code => { clearTimeout(timer); clearInterval(cancellation); resolve({ code: code ?? 1, output, timedOut, cancelled }); });
  });
}
