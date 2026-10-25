import type { Health, Level } from './types';

export interface ConnectionIssue {
  title: string;
  detail: string;
  level: Level;
}

export function setEmbeddedMode(root: HTMLElement, currentWindow: { top: unknown; self: unknown }): void {
  try {
    root.classList.toggle('embedded', currentWindow.top !== currentWindow.self);
  } catch {
    root.classList.add('embedded');
  }
}

let health: Health | null = null;
let connected = true;

export function showHealth(next: Health): void {
  health = next;
  connected = true;
  notify();
}

export function showDisconnected(): void {
  connected = false;
  notify();
}

/** Telemetry problems (lost stream, collector error, missing admin rights), or null when healthy. */
export function connectionIssue(): ConnectionIssue | null {
  if (!connected) return { title: 'Dashboard disconnected', detail: 'reconnecting...', level: 'critical' };
  if (!health || health.status === 'ok' || health.status === 'starting') return null;
  if (health.status === 'error') return { title: 'Telemetry error', detail: health.lastError ?? 'sensor collection failed', level: 'critical' };
  return {
    title: 'Limited telemetry',
    detail: health.problems?.length ? health.problems.join('; ') :
      health.lastError ?? (health.elevated ? 'some sensors are unavailable' : 'not running as administrator - some sensors are missing'),
    level: 'warn'
  };
}

const listeners: Array<() => void> = [];

export function onConnectionChange(listener: () => void): void {
  listeners.push(listener);
}

function notify(): void {
  listeners.forEach(listener => listener());
}
