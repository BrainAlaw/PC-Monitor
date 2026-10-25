import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
    if (!candidate.includes('\\') && !candidate.includes('/')) {
      const result = spawnSync('where.exe', [candidate], { encoding: 'utf8', windowsHide: true });
      if (result.status === 0) return candidate;
    }
  }
  throw new Error('Browser not found. Set BROWSER or install Edge/Chrome in a supported path.');
}

export async function startMockServer(port) {
  const script = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Mock server exited early. ' + output);
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/health');
      if (response.ok) return { child, url: 'http://127.0.0.1:' + port + '/' };
    } catch {
      await delay(150);
    }
  }
  child.kill();
  throw new Error('Mock server did not become ready. ' + output);
}

export function createBrowserProfile() {
  return mkdtempSync(join(tmpdir(), 'pcmonitor-headless-'));
}

export function removeBrowserProfile(profile) {
  rmSync(profile, { recursive: true, force: true });
}
