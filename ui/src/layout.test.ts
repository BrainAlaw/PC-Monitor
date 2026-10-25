import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const viewSources = ['overview.ts', 'cpu.ts', 'gpu.ts', 'power.ts', 'network.ts', 'storage.ts']
  .map(file => readFileSync(new URL(`./views/${file}`, import.meta.url), 'utf8'));

describe('responsive dashboard layout', () => {
  it('marks every tile collection with the shared tile-grid class', () => {
    const sources = [index, ...viewSources];
    const gridClassNames = ['signal-grid', 'device-grid', 'core-grid', 'cooling-grid', 'drive-grid', 'members', 'rate-pair'];

    for (const className of gridClassNames) {
      const pattern = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`, 'g');
      const usages = sources.flatMap(source => source.match(pattern) ?? []);
      expect(usages.length, `${className} usages`).toBeGreaterThan(0);
      expect(usages.every(usage => /\btile-grid\b/.test(usage)), `${className} uses tile-grid`).toBe(true);
    }
  });

  it('defines wide-screen multi-column layout and mobile overflow protections', () => {
    expect(stylesheet).toMatch(/@media\s*\(min-width:\s*1800px\)/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.content\s*\{[^}]*padding/);
    expect(stylesheet).toMatch(/\.tile-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(stylesheet).toMatch(/font-size:\s*(?:1[2-9]|[2-9]\d)px/);
  });

  it('keeps the multi-column wide layout inside the embedded iframe and stacks only below 1800px', () => {
    const stack = stylesheet.match(/@media\s*\(max-width:\s*1799px\)\s*\{([\s\S]*?)\r?\n\}/);
    expect(stack, 'embedded stacking media block').not.toBeNull();
    expect(stack![1]).toMatch(/html\.embedded\s+\.content\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(stylesheet.replace(stack![0], '')).not.toMatch(/html\.embedded\s+\.content\s*\{[^}]*grid-template-columns/);
  });
});
