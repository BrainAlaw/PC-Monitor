import { cpuThermalTile, numericTile, signal } from '../components';
import { el, setHtml, setText } from '../dom';
import { clamp } from '../format';
import { h } from '../html';
import type { Model } from '../model';
import { bestCpuLoad, bestCpuPackagePower, bestCpuTemperature, colorForPercent } from '../scoring';

/**
 * Column count for the core grid: close to square, preferring a count that divides the cores evenly so the
 * last row is not left half empty (8 cores -> 4 x 2, 16 -> 4 x 4, 24 -> 6 x 4).
 */
export function coreColumns(count: number): number {
  if (count <= 4) return Math.max(1, count <= 2 ? count : 2);
  const base = Math.ceil(Math.sqrt(count));
  for (let columns = base; columns <= base + 2; columns += 1) {
    if (count % columns === 0) return columns;
  }
  return base;
}

export function renderCpu(model: Model): void {
  setText('cpuName', model.cpuName());

  const load = bestCpuLoad(model);
  const power = bestCpuPackagePower(model);
  const voltage = model.byContains(['Core', 'SVI2'], 'cpu', 'Voltage');

  setHtml('cpuSummary', h`<div class="signal-grid tile-grid compact">
    ${signal(load, 'CPU Total', 'processor utilisation')}
    ${cpuThermalTile(bestCpuTemperature(model))}
    ${numericTile(power, 'CPU Package', power?.deviceName, 'POWER')}
    ${numericTile(voltage, 'Core Voltage', voltage?.deviceName, 'VOLT')}
  </div>`);

  const cores = model.sensors
    .filter(s => s.category === 'cpu' && s.type === 'Load' && /^(?:CPU )?Core #/i.test(s.text))
    .sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }));

  el('coreGrid').style.setProperty('--cols', String(coreColumns(cores.length)));
  setHtml('coreGrid', h`${cores.map((core, index) => {
    const color = colorForPercent(core.number);
    const coreNumber = core.text.match(/#(\d+)/)?.[1] ?? String(index + 1);
    return h`<div class="core" data-key="${core.id}" style="--core-load:${clamp(core.number ?? 0, 0, 100)}%;--core-color:${color}" title="${core.pathText}">
      <div class="core-fill"></div>
      <div class="core-index">Core ${coreNumber}</div>
      <div class="core-load">${core.valueText || '--'}</div>
    </div>`;
  })}`);
}
