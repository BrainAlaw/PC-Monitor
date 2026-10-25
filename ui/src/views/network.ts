import { areaChart, legend } from '../charts';
import { setHtml } from '../dom';
import { formatRate } from '../format';
import { h } from '../html';
import type { History } from '../history';
import { kilobytesPerSecond, type Model } from '../model';
import type { Sensor } from '../types';
import { deviceRoot, groupBy } from './util';

export interface Adapter {
  name: string;
  down: number;
  up: number;
  /** Tunnels, virtual switches and the like: their traffic also passes through a physical adapter. */
  virtual: boolean;
}

// LibreHardwareMonitor also lists per-adapter filter drivers ("Ethernet 2-QoS Packet Scheduler-0000"). They mirror the
// adapter they sit on, so counting them would multiply the real traffic.
const FILTER_INSTANCE = /-\d{4}$/;
const VIRTUAL_ADAPTER = /wireguard|openvpn|tailscale|surfshark|nordlynx|vpn|\btap\b|\btun\b|vethernet|vswitch|hyper-v|bluetooth|kernel debugger|local area connection\*/i;

export function isVirtualAdapter(name: string): boolean {
  return VIRTUAL_ADAPTER.test(name);
}

export function adapters(model: Model): Adapter[] {
  const speed = (sensors: Sensor[], pattern: RegExp): number =>
    kilobytesPerSecond(sensors.find(s => pattern.test(s.text)));

  return groupBy(model.sensors.filter(s => s.category === 'network' && !FILTER_INSTANCE.test(s.deviceName)), deviceRoot)
    .map(([name, sensors]) => ({
      name,
      down: speed(sensors, /download speed/i),
      up: speed(sensors, /upload speed/i),
      virtual: isVirtualAdapter(name)
    }))
    .sort((a, b) => b.down + b.up - (a.down + a.up));
}

export function recordNetworkHistory(model: Model, history: History): void {
  // Totals count physical adapters only, otherwise a VPN would double the real traffic.
  const physical = adapters(model).filter(a => !a.virtual);
  history.push('download', physical.reduce((sum, a) => sum + a.down, 0));
  history.push('upload', physical.reduce((sum, a) => sum + a.up, 0));
}

export function renderNetwork(model: Model, history: History): void {
  const download = history.get('download');
  const upload = history.get('upload');
  const nowDown = download.at(-1) ?? 0;
  const nowUp = upload.at(-1) ?? 0;
  const active = adapters(model).slice(0, 4);

  setHtml('networkSummary', h`
    <div class="rate-pair tile-grid">
      <div class="metric-tile">
        <div class="metric-title"><strong>Download</strong><span class="metric-type">PEAK ${formatRate(Math.max(...download, 1))}</span></div>
        <div class="metric-value" style="color:var(--blue)">${formatRate(nowDown)}</div>
      </div>
      <div class="metric-tile">
        <div class="metric-title"><strong>Upload</strong><span class="metric-type">PEAK ${formatRate(Math.max(...upload, 1))}</span></div>
        <div class="metric-value" style="color:var(--cyan)">${formatRate(nowUp)}</div>
      </div>
    </div>
    ${areaChart([
      { values: download, color: 'var(--blue)', label: 'Download' },
      { values: upload, color: 'var(--cyan)', label: 'Upload' }
    ])}
    ${legend([
      { label: 'Download', color: 'var(--blue)', value: '' },
      { label: 'Upload', color: 'var(--cyan)', value: '' }
    ])}
    <div class="adapter-list">${active.map(a => h`<div class="adapter-row" data-key="${a.name}">
      <span class="name" title="${a.virtual ? `${a.name} (virtual, not counted in totals)` : a.name}">${a.name}${a.virtual ? ' · virtual' : ''}</span>
      <span class="rate down">&darr; ${formatRate(a.down)}</span>
      <span class="rate up">&uarr; ${formatRate(a.up)}</span>
    </div>`)}</div>`);
}
