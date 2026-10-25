import { numericTile, signal, thermalTile } from '../components';
import { setHtml, setText } from '../dom';
import { h } from '../html';
import type { Model } from '../model';

export function renderGpu(model: Model): void {
  setText('gpuName', model.gpuName());

  const gpu = (text: string, type: string) => model.byText(text, 'gpu', type);
  const coreLoad = gpu('GPU Core', 'Load');
  const memoryLoad = gpu('GPU Memory', 'Load');
  const controllerLoad = gpu('GPU Memory Controller', 'Load');
  const temperature = gpu('GPU Core', 'Temperature');
  const hotspot = gpu('GPU Hot Spot', 'Temperature');
  const coreClock = gpu('GPU Core', 'Clock');
  const memoryClock = gpu('GPU Memory', 'Clock');
  const packagePower = gpu('GPU Package', 'Power');
  const vramUsed = gpu('GPU Memory Used', 'SmallData');
  const vramTotal = gpu('GPU Memory Total', 'SmallData');
  const vramPct = vramUsed?.number != null && vramTotal?.number ? Math.min(100, (vramUsed.number / vramTotal.number) * 100) : 0;
  const vramSub = `${vramUsed?.valueText || '--'} / ${vramTotal?.valueText || '--'}`;

  setHtml('gpuCards', h`
    <article class="device-card">
      <div class="device-head"><div class="device-name">Core State</div></div>
      <div class="signal-grid tile-grid">
        ${signal(coreLoad, 'Core Load', 'GPU utilisation')}
        ${thermalTile(temperature, 'Core Temp', temperature?.deviceName)}
        ${thermalTile(hotspot, 'Hot Spot', hotspot?.deviceName)}
      </div>
    </article>
    <article class="device-card">
      <div class="device-head"><div class="device-name">Memory State</div></div>
      <div class="signal-grid tile-grid">
        ${signal(memoryLoad, 'Memory Load', 'VRAM utilisation')}
        ${signal(controllerLoad, 'Memory Controller', 'controller utilisation')}
        ${signal(vramUsed, 'VRAM Used', vramSub, vramPct)}
      </div>
    </article>
    <article class="device-card">
      <div class="device-head"><div class="device-name">Clocks And Power</div></div>
      <div class="signal-grid tile-grid">
        ${numericTile(coreClock, 'Core Clock', coreClock?.deviceName, 'CLOCK')}
        ${numericTile(memoryClock, 'Memory Clock', memoryClock?.deviceName, 'CLOCK')}
        ${numericTile(packagePower, 'Package Power', packagePower?.deviceName, 'POWER')}
      </div>
    </article>`);
}
