const viewports = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 }
];

function parseArguments() {
  const outputIndex = process.argv.indexOf('--out');
  const out = outputIndex < 0 ? null : process.argv[outputIndex + 1];
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex < 0 ? 5199 : Number(process.argv[portIndex + 1]);
  if (!out) throw new Error('Usage: node shots.mjs --out <directory> [--port <port>]');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port value');
  return { out, port };
}

const { mkdirSync } = await import('node:fs');
const { resolve } = await import('node:path');
const { spawnSync } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');
const { findBrowser, startMockServer, createBrowserProfile, removeBrowserProfile } = await import('./browser-utils.mjs');
const { out, port } = parseArguments();
const outDir = resolve(out);
mkdirSync(outDir, { recursive: true });
const browser = findBrowser();
const server = await startMockServer(port);
try {
  for (const viewport of viewports) {
    const name = viewport.width + 'x' + viewport.height + '.png';
    const imagePath = resolve(outDir, name);
    const profile = createBrowserProfile();
    try {
      const result = spawnSync(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--timeout=9000',
        '--window-size=' + viewport.width + ',' + viewport.height,
        '--screenshot=' + imagePath,
        '--user-data-dir=' + profile,
        server.url
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error('Browser failed for ' + name + ': ' + result.stderr);
      console.log(imagePath);
    } finally {
      removeBrowserProfile(profile);
    }
  }
} finally {
  server.child.kill();
}
