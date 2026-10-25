// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setEmbeddedMode } from './header';

const stylesheet = readFileSync('src/styles.css', 'utf8');

describe('MK dashboard theme', () => {
  it('defines the shared MK token values and local JetBrains Mono faces', () => {
    for (const token of [
      '--void: #0a0506', '--panel: rgba(18,8,10,.82)', '--panel-2: rgba(30,12,16,.85)',
      '--raised: rgba(255,42,61,.1)', '--red: #ff2a3d', '--red-dim: #7a1420',
      '--magenta: #ff2bd6', '--cyan: #00f0ff', '--ok: #19f0c4', '--warn: #ffb020',
      '--crit: #ff2a3d', '--text: #f3d9dc', '--muted: rgba(243,217,220,.68)',
      '--dim: rgba(243,217,220,.45)', '--line: rgba(255,42,61,.35)',
      '--line-2: rgba(255,42,61,.5)', '--cut: 12px', '--cut-sm: 8px', '--radius: 2px'
    ]) expect(stylesheet).toContain(token);

    expect(stylesheet).toContain('@font-face');
    expect(stylesheet).toContain('url("./fonts/jb-mono-400.woff2")');
    expect(stylesheet).toContain('url("./fonts/jb-mono-700.woff2")');
    expect(stylesheet).not.toMatch(/url\(\s*["']?https?:/i);
    expect(stylesheet).not.toMatch(/@import[^;]*https?:/i);
    expect(stylesheet).toContain('"JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace');
  });

  it('switches the document root into embedded mode only inside an iframe', () => {
    const root = document.createElement('html');
    const top = {};
    const child = {};
    setEmbeddedMode(root, { top, self: child });
    expect(root.classList.contains('embedded')).toBe(true);

    setEmbeddedMode(root, { top, self: top });
    expect(root.classList.contains('embedded')).toBe(false);
  });
});
