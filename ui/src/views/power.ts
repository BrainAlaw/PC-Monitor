import { coolingCard, valueSignal } from '../components';
import { setHtml, setText } from '../dom';
import { fanKey, visibleCoolingSensors } from '../fans';
import { h } from '../html';
import type { Model } from '../model';
import { prefs, type PowerAssumptions } from '../prefs';
import { bestCpuLoad, hardwareKind, measuredCpuPackagePower } from '../scoring';
import { deviceRoot, groupBy } from './util';

const NVME_WATTS = 5;
const SATA_SSD_WATTS = 2;
const CPU_IDLE_WATTS = 35;
const CPU_LOAD_SPAN_WATTS = 80;
const GPU_IDLE_WATTS = 25;
const GPU_LOAD_SPAN_WATTS = 320;

export interface PowerEstimate {
  measuredDc: number;
  internalDc: number;
  peripherals: number;
  wall: number;
}

/**
 * Rough power model. Measured: CPU and GPU package power. Estimated from load when a sensor is missing,
 * and from the user's assumptions for board, RAM, fans, drives and peripherals.
 */
export function estimatePower(model: Model, assumptions: PowerAssumptions): PowerEstimate {
  const cpuMeasured = measuredCpuPackagePower(model)?.number ?? 0;
  const gpuMeasured = model.byText('GPU Package', 'gpu', 'Power')?.number ?? 0;
  const cpuLoad = bestCpuLoad(model)?.number ?? 0;
  const gpuLoad = (model.byText('GPU Board Power', 'gpu', 'Load') ?? model.byText('GPU Power', 'gpu', 'Load'))?.number ?? 0;

  const kinds = groupBy(model.sensors.filter(s => s.category === 'storage'), deviceRoot)
    .map(([, sensors]) => (sensors[0] ? hardwareKind(sensors[0]) : ''));
  const drives = kinds.filter(k => k === 'NVMe').length * NVME_WATTS + kinds.filter(k => k === 'SSD').length * SATA_SSD_WATTS;

  const cpu = cpuMeasured > 0 ? cpuMeasured : CPU_IDLE_WATTS + (cpuLoad / 100) * CPU_LOAD_SPAN_WATTS;
  const gpu = gpuMeasured > 0 ? gpuMeasured : GPU_IDLE_WATTS + (gpuLoad / 100) * GPU_LOAD_SPAN_WATTS;
  const internalDc = cpu + gpu + drives + assumptions.platformWatts;
  const peripherals = assumptions.usbWatts + assumptions.monitors * assumptions.monitorWatts;

  return {
    measuredDc: cpuMeasured + gpuMeasured,
    internalDc,
    peripherals,
    wall: internalDc / (assumptions.efficiencyPercent / 100) + peripherals
  };
}

export function renderPower(model: Model): void {
  const assumptions = prefs().power;
  const estimate = estimatePower(model, assumptions);
  const watts = (value: number): string => `${Math.round(value)} W`;

  setHtml('powerSummary', h`<div class="signal-grid tile-grid compact">
    ${valueSignal('Wall (est.)', watts(estimate.wall), 'at the socket', Math.min(100, estimate.wall / 7), 'var(--orange)')}
    ${valueSignal('CPU + GPU', watts(estimate.measuredDc), 'measured', Math.min(100, estimate.measuredDc / 5), 'var(--green)')}
    ${valueSignal('Internal DC', watts(estimate.internalDc), 'before PSU losses', Math.min(100, estimate.internalDc / 6), 'var(--blue)')}
    ${valueSignal('Peripherals', watts(estimate.peripherals), `${assumptions.monitors} monitors + USB`, Math.min(100, estimate.peripherals), 'var(--cyan)')}
  </div>`);

  const fans = visibleCoolingSensors(model);
  setText('powerFanCount', fans.length ? `${fans.length} fans` : '');
  setHtml('powerCoolingGrid', fans.length
    ? h`${fans.map((fan, index) => coolingCard(fan, fanKey(fan), index))}`
    : h`<div class="muted">No active fan or pump telemetry reported.</div>`);
}
