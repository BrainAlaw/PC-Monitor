// Measures tile/card layouts from styles.css and views: .layout (index.html panel rows),
// .signal-grid (overview/cpu/gpu/power tiles), .device-grid (GPU cards), .core-grid (CPU cores),
// .cooling-grid (power fans), .drive-grid and .members (storage cards), and .rate-pair (network tiles).
// The final .core-grid row is exempt from --assert because prime core counts cannot fill a square grid.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findBrowser, startMockServer, createBrowserProfile, removeBrowserProfile } from './browser-utils.mjs';

const viewports = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 }
];
const assertMode = process.argv.includes('--assert');
const embeddedMode = process.argv.includes('--embedded');
const portIndex = process.argv.indexOf('--port');
const port = portIndex < 0 ? 5199 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port value');

function runMeasure(browser, url, viewport) {
  const profile = createBrowserProfile();
  try {
    const target = url + '__measure?width=' + viewport.width + '&height=' + viewport.height + (embeddedMode ? '&embedded=1' : '');
    const result = spawnSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--enable-logging=stderr',
      '--v=0',
      '--timeout=9000',
      '--window-size=' + viewport.width + ',' + viewport.height,
      '--dump-dom',
      '--user-data-dir=' + profile,
      target
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Browser measurement failed: ' + result.stderr);
    const match = result.stdout.match(/<pre id="layout-report" hidden="">(.*?)<\/pre>/s) ??
      result.stdout.match(/<pre id="layout-report"[^>]*>(.*?)<\/pre>/s);
    if (!match) throw new Error('Measurement report missing from browser DOM: ' + result.stdout.slice(-1000));
    const decoded = match[1]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&#39;', "'");
    let report;
    try {
      report = JSON.parse(decoded);
    } catch (error) {
      throw new Error('Invalid measurement JSON: ' + error + '\n' + result.stderr.slice(-2000) + '\n' + result.stdout.slice(-3000));
    }
    if (report.error) throw new Error(report.error);
    return report;
  } finally {
    removeBrowserProfile(profile);
  }
}

function failuresFor(report) {
  const failures = [];
  if (report.measuredViewportWidth !== report.viewport.width) {
    failures.push('measurement viewport is ' + report.measuredViewportWidth + 'px, expected ' + report.viewport.width + 'px');
  }
  for (const container of report.containers) {
    container.rows.forEach((row, index) => {
      if (container.selector === '.core-grid' && index === container.rows.length - 1) return;
      if (row.coverage < 0.97) failures.push(container.selector + ' row ' + (index + 1) + ' covers ' + (row.coverage * 100).toFixed(1) + '%');
    });
  }
  report.panelRows.forEach(row => {
    if (row.difference > 2) failures.push(row.panels.map(panel => panel.title).join(' / ') + ' panel heights differ by ' + row.difference + 'px');
  });
  if (!report.embedded && report.viewport.width >= 1800) {
    const content = report.containers.find(container => container.selector === '.content');
    if (!content || content.rows.some(row => row.items < 2)) failures.push('wide layout does not place panels in multiple columns');
  }
  if (report.overflow.horizontal) failures.push('horizontal overflow: ' + report.overflow.documentWidth + 'px > ' + report.overflow.viewportWidth + 'px');
  return failures;
}

const browser = findBrowser();
const server = await startMockServer(port);
const reports = [];
try {
  for (const viewport of viewports) reports.push(runMeasure(browser, server.url, viewport));
} finally {
  server.child.kill();
}

const results = reports.map(report => ({ ...report, assertionFailures: failuresFor(report) }));
console.log(JSON.stringify({ embedded: embeddedMode, reports: results }, null, 2));
console.log('');
console.log('Viewport | container rows (items/coverage) | panel height max delta | horizontal overflow');
for (const report of results) {
  const rows = report.containers.map(container =>
    container.selector + ': ' + container.rows.map(row => row.items + '/' + (row.coverage * 100).toFixed(0) + '%').join(','))
    .join(' ; ');
  const delta = report.panelRows.length ? Math.max(...report.panelRows.map(row => row.difference)) : 0;
  console.log(
    report.viewport.width + 'x' + report.viewport.height + ' | ' + (rows || 'none') + ' | ' +
    delta.toFixed(2) + 'px | ' + (report.overflow.horizontal ? 'yes' : 'no')
  );
}
const failures = results.flatMap(report => report.assertionFailures.map(message =>
  report.viewport.width + 'x' + report.viewport.height + ': ' + message));
if (assertMode && failures.length) {
  console.error('');
  console.error('Layout assertions failed:');
  failures.forEach(failure => console.error('- ' + failure));
  process.exitCode = 1;
}
