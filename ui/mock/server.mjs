import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const staticRoot = resolve(here, '../../src/PCMonitor/wwwroot');
const fixturePath = resolve(here, 'snapshot.sample.json');
const initialSnapshot = JSON.parse(readFileSync(fixturePath, 'utf8'));
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon']
]);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('Invalid ' + name + ' value');
  return value;
}

const port = option('--port', 5199);
let settings = {
  port,
  samplingMs: 1000,
  startMinimized: false,
  closeToTray: true,
  autostart: false,
  allowLan: false,
  lanUrls: []
};
let tick = 0;

function currentSnapshot() {
  const snapshot = structuredClone(initialSnapshot);
  const phase = tick;
  snapshot.timestamp = new Date().toISOString();
  for (const sensor of snapshot.sensors) {
    if (sensor.value === null) continue;
    const amplitude = sensor.type === 'Load' ? 3 : sensor.type === 'Temperature' ? 0.7 : sensor.type === 'Fan' ? 24 : 0;
    if (amplitude === 0) continue;
    const value = sensor.value + Math.sin(phase / 2 + sensor.id.length) * amplitude;
    sensor.value = Math.min(sensor.max ?? value, Math.max(sensor.min ?? value, Number(value.toFixed(sensor.decimals))));
  }
  return snapshot;
}

function health(snapshot) {
  return {
    status: 'ok',
    elevated: false,
    hardwareCount: snapshot.hardware.length,
    sensorCount: snapshot.sensors.length,
    lastError: null,
    lastUpdate: snapshot.timestamp,
    problems: [],
    driver: { installed: true, version: 'mock', error: null },
    availableSensorCount: snapshot.sensors.filter(sensor => sensor.value !== null).length,
    port,
    version: '2.0.5'
  };
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

async function readJson(request, limit = 4096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendEvent(response, name, value) {
  response.write('event: ' + name + '\ndata: ' + JSON.stringify(value) + '\n\n');
}

function serveStatic(request, response, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400).end('Bad path');
    return;
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = resolve(staticRoot, relative);
  if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = readFileSync(filePath, { flag: 'r' });
  } catch {
    response.writeHead(404).end('Built dashboard not found. Run npm --prefix ui run build first.');
    return;
  }
  const type = mimeTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.length, 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') response.end();
  else response.end(stat);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:' + port);
  const pathname = url.pathname;

  if (request.method === 'GET' && pathname === '/__measure') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(readFileSync(resolve(here, 'measure.html')));
    return;
  }
  if (request.method === 'GET' && pathname === '/__measure-delay.css') {
    setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('/* Allow the initial mock snapshot to render before the wrapper load event. */');
    }, 2200);
    return;
  }
  if (request.method === 'GET' && pathname === '/api/snapshot') {
    json(response, 200, currentSnapshot());
    return;
  }
  if (request.method === 'GET' && pathname === '/api/health') {
    json(response, 200, health(currentSnapshot()));
    return;
  }
  if (request.method === 'GET' && pathname === '/api/diagnostics') {
    const snapshot = currentSnapshot();
    json(response, 200, {
      generatedAt: new Date().toISOString(),
      operatingSystem: 'Mock operating system',
      architecture: 'x64',
      hardwareLibraryVersion: 'mock',
      health: health(snapshot),
      enabled: { cpu: true, motherboard: true, gpu: true },
      hardware: snapshot.hardware.filter(device => device.type !== 'Network'),
      sensors: snapshot.sensors.filter(sensor => !sensor.id.startsWith('/nic/'))
    }, { 'Content-Disposition': 'attachment; filename=PCMonitor-diagnostics.json' });
    return;
  }
  if (pathname === '/api/settings' && request.method === 'GET') {
    json(response, 200, settings);
    return;
  }
  if (pathname === '/api/settings' && request.method === 'PUT') {
    const origin = request.headers.origin;
    const sameOrigin = origin === 'http://127.0.0.1:' + port || origin === 'http://localhost:' + port;
    if (!sameOrigin || !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      json(response, 403, { error: 'Cross-origin or non-JSON request rejected' });
      return;
    }
    try {
      const patch = await readJson(request);
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        json(response, 400, { error: 'Invalid JSON' });
        return;
      }
      const booleanSettings = ['startMinimized', 'closeToTray', 'autostart', 'allowLan', 'regenerateToken'];
      if (booleanSettings.some(key => patch[key] !== undefined && typeof patch[key] !== 'boolean')) {
        json(response, 400, { error: 'Invalid JSON' });
        return;
      }
      if ((patch.port !== undefined && (!Number.isInteger(patch.port) || patch.port < 1 || patch.port > 65535)) ||
          (patch.samplingMs !== undefined && (!Number.isInteger(patch.samplingMs) || patch.samplingMs < 250 || patch.samplingMs > 60000))) {
        json(response, 400, { error: 'Port or sampling interval out of range' });
        return;
      }
      const restartRequired = (patch.port !== undefined && patch.port !== port) ||
        (patch.allowLan !== undefined && patch.allowLan !== settings.allowLan);
      settings = {
        ...settings,
        ...Object.fromEntries(Object.entries(patch).filter(([key]) =>
          ['port', 'samplingMs', 'startMinimized', 'closeToTray', 'autostart', 'allowLan'].includes(key)))
      };
      json(response, 200, { ok: true, restartRequired, firewallOk: true });
    } catch (error) {
      json(response, error instanceof SyntaxError ? 400 : 413, { error: error instanceof SyntaxError ? 'Invalid JSON' : 'Request body too large' });
    }
    return;
  }
  if (request.method === 'GET' && pathname === '/api/stream') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive'
    });
    let previousHealth = '';
    const publish = () => {
      tick += 1;
      const snapshot = currentSnapshot();
      sendEvent(response, 'snapshot', snapshot);
      const serializedHealth = JSON.stringify(health(snapshot));
      if (serializedHealth !== previousHealth) {
        previousHealth = serializedHealth;
        sendEvent(response, 'health', JSON.parse(serializedHealth));
      }
    };
    publish();
    const timer = setInterval(publish, Math.max(500, settings.samplingMs));
    response.on('close', () => clearInterval(timer));
    return;
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    serveStatic(request, response, pathname);
    return;
  }
  response.writeHead(405, { Allow: 'GET, HEAD, PUT' }).end();
});

server.on('error', error => {
  console.error('Mock server failed: ' + error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('PC Monitor mock server listening at http://127.0.0.1:' + port);
});
