import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Model } from './model';
import type { Snapshot } from './types';

const fixtureText = readFileSync(new URL('../mock/snapshot.sample.json', import.meta.url), 'utf8');

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.timestamp === 'string' &&
    Array.isArray(snapshot.hardware) &&
    snapshot.hardware.every(item => typeof item?.name === 'string' && typeof item?.type === 'string') &&
    Array.isArray(snapshot.sensors) &&
    snapshot.sensors.every(item =>
      typeof item?.id === 'string' &&
      typeof item?.device === 'string' &&
      Array.isArray(item?.path) &&
      item.path.every((part: unknown) => typeof part === 'string') &&
      typeof item?.group === 'string' &&
      typeof item?.name === 'string' &&
      typeof item?.type === 'string' &&
      (typeof item?.value === 'number' || item?.value === null) &&
      (typeof item?.min === 'number' || item?.min === null) &&
      (typeof item?.max === 'number' || item?.max === null) &&
      typeof item?.unit === 'string' &&
      Number.isInteger(item?.decimals)) &&
    Array.isArray(snapshot.volumes) &&
    snapshot.volumes.every(item =>
      typeof item?.id === 'string' &&
      typeof item?.label === 'string' &&
      typeof item?.fileSystem === 'string' &&
      typeof item?.totalBytes === 'number' &&
      typeof item?.freeBytes === 'number' &&
      Array.isArray(item?.disks) &&
      item.disks.every((disk: unknown) => typeof disk === 'string'));
}

describe('mock snapshot fixture', () => {
  it('parses as the dashboard snapshot model and contains representative hardware', () => {
    const parsed: unknown = JSON.parse(fixtureText);
    expect(isSnapshot(parsed)).toBe(true);
    if (!isSnapshot(parsed)) throw new Error('Fixture does not match Snapshot wire shape');

    const model = new Model(parsed);
    expect(model.hardware.some(device => device.type === 'Cpu')).toBe(true);
    expect(model.hardware.some(device => device.type === 'GpuNvidia')).toBe(true);
    expect(model.sensors.filter(sensor => sensor.category === 'cpu' && /^Core #\d+$/.test(sensor.text))).toHaveLength(8);
    expect(model.sensors.some(sensor => sensor.category === 'memory')).toBe(true);
    expect(model.volumes.length).toBeGreaterThan(0);
    expect(model.sensors.some(sensor => sensor.category === 'network')).toBe(true);
    expect(model.sensors.filter(sensor => sensor.groupName === 'Fans').length).toBeGreaterThanOrEqual(2);
    expect(model.cpuName()).toBe('Generic 8-Core Processor');
    expect(model.gpuName()).toBe('Generic NVIDIA Graphics');
  });

  it('contains no IPv4, MAC, or serial-looking strings', () => {
    const parsed: unknown = JSON.parse(fixtureText);
    expect(isSnapshot(parsed)).toBe(true);
    if (!isSnapshot(parsed)) throw new Error('Fixture does not match Snapshot wire shape');

    const strings: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
    };
    collect(parsed);
    const suspicious = strings.filter(value =>
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value) ||
      /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i.test(value) ||
      /\b(?:serial(?:\s*(?:number|no|#))?|s\/n)\s*[:#=-]?\s*[a-z0-9-]{4,}\b/i.test(value));
    expect(suspicious).toEqual([]);
  });
});
