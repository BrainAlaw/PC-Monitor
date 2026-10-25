import { areaChart, legend } from '../charts';
import { cpuThermalTile, signal, thermalTile } from '../components';
import { setHtml } from '../dom';
import { h } from '../html';
import type { History } from '../history';
import type { Model } from '../model';
import { bestCpuLoad, bestCpuTemperature, chooseStorageTemperature, isLiveTemperature } from '../scoring';
import type { Sensor } from '../types';
import { deviceRoot, groupBy } from './util';

export function recordLoadHistory(model: Model, history: History): void {
  history.push('cpu', bestCpuLoad(model)?.number ?? 0);
  history.push('gpu', model.byText('GPU Core', 'gpu', 'Load')?.number ?? 0);
  history.push('ram', model.byText('Memory', 'memory', 'Load')?.number ?? 0);
}

export function renderOverview(model: Model, history: History): void {
  renderThermals(model);
  renderLoads(model);
  renderLoadHistory(history);
}

function hottestDrive(model: Model): { sensor: Sensor; name: string } | undefined {
  const drives = groupBy(model.sensors.filter(s => s.category === 'storage' && isLiveTemperature(s)), deviceRoot)
    .flatMap(([name, sensors]) => {
      const sensor = chooseStorageTemperature(sensors);
      return sensor ? [{ sensor, name }] : [];
    });
  return drives.sort((a, b) => (b.sensor.number ?? 0) - (a.sensor.number ?? 0))[0];
}

function renderThermals(model: Model): void {
  const cpuTemp = bestCpuTemperature(model);
  const gpuTemp = model.byText('GPU Core', 'gpu', 'Temperature');
  const gpuHotspot = model.byText('GPU Hot Spot', 'gpu', 'Temperature');
  const gpuJunction = model.byText('GPU Memory Junction', 'gpu', 'Temperature');
  const drive = hottestDrive(model);

  setHtml('thermalSummary', h`<div class="signal-grid tile-grid compact">
    ${cpuThermalTile(cpuTemp)}
    ${thermalTile(gpuTemp, 'GPU Core', gpuTemp?.deviceName)}
    ${thermalTile(gpuHotspot, 'GPU Hot Spot', gpuHotspot?.deviceName)}
    ${thermalTile(gpuJunction, 'GPU Memory', gpuJunction?.deviceName)}
    ${drive ? thermalTile(drive.sensor, 'Hottest drive', drive.name) : ''}
  </div>`);
}

function renderLoads(model: Model): void {
  const byGpu = (text: string, type = 'Load'): Sensor | undefined => model.byText(text, 'gpu', type);
  const vramUsed = byGpu('GPU Memory Used', 'SmallData');
  const vramTotal = byGpu('GPU Memory Total', 'SmallData');
  const vramPct = vramUsed?.number != null && vramTotal?.number ? Math.min(100, (vramUsed.number / vramTotal.number) * 100) : 0;
  const vramSub = `${vramUsed?.valueText || '--'} / ${vramTotal?.valueText || '--'}`;
  const gpuPackagePower = byGpu('GPU Package', 'Power');

  setHtml('loadSummary', h`<div class="signal-grid tile-grid">
    ${signal(bestCpuLoad(model), 'CPU Total', 'processor load')}
    ${signal(byGpu('GPU Core'), 'GPU Core', 'graphics load')}
    ${signal(byGpu('GPU Memory'), 'GPU Memory', 'vram load')}
    ${signal(byGpu('GPU Memory Controller'), 'GPU Memory Ctrl', 'controller load')}
    ${signal(model.byText('Memory', 'memory', 'Load'), 'System RAM', model.byText('Memory Used', 'memory', 'Data')?.valueText)}
    ${signal(vramUsed, 'VRAM Used', vramSub, vramPct)}
    ${signal(byGpu('GPU Power'), 'GPU Power', gpuPackagePower?.valueText || 'board load')}
  </div>`);
}

function renderLoadHistory(history: History): void {
  const last = (key: string): string => `${Math.round(history.get(key).at(-1) ?? 0)}%`;
  setHtml('loadHistory', h`
    ${areaChart([
      { values: history.get('ram'), color: 'var(--cyan)', label: 'RAM' },
      { values: history.get('gpu'), color: 'var(--magenta)', label: 'GPU' },
      { values: history.get('cpu'), color: 'var(--green)', label: 'CPU' }
    ], 100)}
    ${legend([
      { label: 'CPU', color: 'var(--green)', value: last('cpu') },
      { label: 'GPU', color: 'var(--magenta)', value: last('gpu') },
      { label: 'RAM', color: 'var(--cyan)', value: last('ram') }
    ])}`);
}
