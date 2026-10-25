import './styles.css';
import { connectStream } from './api';
import { el } from './dom';
import { onConnectionChange, setEmbeddedMode, showDisconnected, showHealth } from './header';
import { initIssues } from './issues';
import { History } from './history';
import { Model, signatureOf } from './model';
import { onPrefsChange, prefs } from './prefs';
import { initSettings } from './settings';
import type { Snapshot } from './types';
import { initWindowChrome } from './window';
import { renderCpu } from './views/cpu';
import { renderGpu } from './views/gpu';
import { recordNetworkHistory, renderNetwork } from './views/network';
import { recordLoadHistory, renderOverview } from './views/overview';
import { renderPower } from './views/power';
import { renderRaw } from './views/raw';
import { renderStorage } from './views/storage';

const history = new History();
setEmbeddedMode(document.documentElement, window);
let model: Model | null = null;
let lastSignature = '';

function render(current: Model): void {
  const { showRaw } = prefs();
  el('rawSection').hidden = !showRaw;

  renderOverview(current, history);
  renderCpu(current);
  renderGpu(current);
  renderNetwork(current, history);
  renderPower(current);
  renderStorage(current);
  if (showRaw) renderRaw(current);
}

let stale = false;

function syncVisibility(): void {
  document.documentElement.toggleAttribute('data-paused', document.hidden);
  if (!document.hidden && stale && model) {
    stale = false;
    render(model);
    settings.refreshFans();
    issues.refresh();
  }
}

const settings = initSettings(() => model);
const issues = initIssues(() => model);
initWindowChrome();
onConnectionChange(issues.refresh);

function onSnapshot(snapshot: Snapshot): void {
  // The stream pushes every sample; skip the DOM work when nothing changed.
  const signature = signatureOf(snapshot);
  if (signature === lastSignature) return;
  lastSignature = signature;

  model = new Model(snapshot);
  if (document.hidden) {
    // Keep history current, but skip all DOM work until the window is visible again.
    recordLoadHistory(model, history);
    recordNetworkHistory(model, history);
    stale = true;
    return;
  }

  recordLoadHistory(model, history);
  recordNetworkHistory(model, history);
  render(model);
  settings.refreshFans();
  issues.refresh();
}

onPrefsChange(() => {
  if (model) render(model);
});

document.addEventListener('visibilitychange', syncVisibility);
syncVisibility();

connectStream({ onSnapshot, onHealth: showHealth, onDisconnect: showDisconnected });
