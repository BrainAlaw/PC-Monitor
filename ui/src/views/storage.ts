import { setHtml, setText } from '../dom';
import { clamp, formatBytes, formatRate } from '../format';
import { h, type Safe } from '../html';
import { kilobytesPerSecond, type Model } from '../model';
import { chooseStorageTemperature, hardwareKind, scoreVolume, tempColor, volumeUsedPercent } from '../scoring';
import type { Sensor, Volume } from '../types';
import { deviceRoot, groupBy } from './util';

function usedColor(percent: number): string {
  if (percent >= 95) return 'var(--red)';
  if (percent >= 85) return 'var(--yellow)';
  return 'var(--green)';
}

function find(sensors: Sensor[], type: string, pattern: RegExp): Sensor | undefined {
  return sensors.find(s => s.type === type && pattern.test(s.text));
}

function member(name: string, sensors: Sensor[] | undefined): Safe {
  if (!sensors) {
    return h`<div class="member" data-key="${name}"><div class="member-name">${name}</div></div>`;
  }

  const temp = chooseStorageTemperature(sensors);
  const life = find(sensors, 'Level', /remaining life|available spare/i);
  const read = find(sensors, 'Throughput', /read rate/i);
  const write = find(sensors, 'Throughput', /write rate/i);

  return h`<div class="member" data-key="${name}">
    <div class="member-name" title="${name}">${name}<span class="drive-kind">${hardwareKind(sensors[0] as Sensor)}${life ? ` · health ${life.valueText}` : ''}</span></div>
    <div class="member-io">R <b>${formatRate(kilobytesPerSecond(read))}</b> · W <b>${formatRate(kilobytesPerSecond(write))}</b></div>
    <div class="member-temp" style="color:${tempColor(temp?.number ?? null)}">${temp?.valueText || '--'}</div>
  </div>`;
}

function volumeCard(volume: Volume, drives: Map<string, Sensor[]>): Safe {
  const used = volumeUsedPercent(volume);
  const raid = volume.disks.length > 1;
  const risk = scoreVolume(volume);
  const title = `${volume.id} ${volume.label}`.trim();

  return h`<article class="volume-card${raid ? ' is-raid' : ''}" data-key="${volume.id}">
    <div class="volume-head">
      <div class="volume-title">${title}</div>
      ${raid ? h`<span class="chip chip-raid" title="This volume spans several drives (Windows dynamic disk / software RAID)">software RAID · ${volume.disks.length} drives</span>` : ''}
      <span class="volume-fs">${volume.fileSystem}</span>
    </div>
    <div class="bar" title="${Math.round(used)}% used"><i style="--w:${clamp(used, 0, 100)}%;--bar-color:${usedColor(used)}"></i></div>
    <div class="volume-stats">
      <span><b>${formatBytes(volume.totalBytes - volume.freeBytes)}</b> used of <b>${formatBytes(volume.totalBytes)}</b></span>
      <span class="${risk.level === 'ok' ? '' : risk.level === 'critical' ? 'bad-text' : 'warn-text'}"><b>${formatBytes(volume.freeBytes)}</b> free</span>
    </div>
    <div class="members tile-grid">${volume.disks.map(name => member(name, drives.get(name)))}</div>
  </article>`;
}

/** Drives that no volume refers to (unformatted, offline or not mapped). */
function looseDriveCard(names: string[], drives: Map<string, Sensor[]>): Safe {
  return h`<article class="volume-card" data-key="loose-drives">
    <div class="volume-head"><div class="volume-title">Other drives</div></div>
    <div class="members tile-grid">${names.map(name => member(name, drives.get(name)))}</div>
  </article>`;
}

export function renderStorage(model: Model): void {
  const drives = new Map(groupBy(model.sensors.filter(s => s.category === 'storage'), deviceRoot));
  const covered = new Set(model.volumes.flatMap(v => v.disks));
  const loose = [...drives.keys()].filter(name => !covered.has(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  setText('storageCount', `${model.volumes.length} volumes · ${drives.size} drives`);

  if (model.volumes.length === 0 && drives.size === 0) {
    setHtml('driveGrid', h`<div class="muted">No storage telemetry reported.</div>`);
    return;
  }

  setHtml('driveGrid', h`${model.volumes.map(volume => volumeCard(volume, drives))}${loose.length ? looseDriveCard(loose, drives) : ''}`);
}
