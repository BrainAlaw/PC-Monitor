#!/usr/bin/env node
import path from 'node:path';
import { bootstrap, installTools, kitRoot } from './lib/setup.mjs';
import { loadJson } from './lib/engine.mjs';

try {
  const args = process.argv.slice(2);
  const value = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const variant = loadJson(path.join(kitRoot, 'kit.json'));
  const tools = value('--tools', variant.defaultTools.join(',')).split(',').filter(Boolean);
  const coordinator = value('--coordinator', variant.coordinator);
  if (coordinator !== variant.coordinator) throw new Error(`VARIANT: this checkout uses ${variant.coordinator}; select the correct branch first`);
  if (value('--profile') !== 'full-control') throw new Error('PROFILE: pass --profile full-control before installation or initialization');
  if (!tools.length || tools.some(tool => !variant.defaultTools.includes(tool) && tool !== variant.coordinator)) throw new Error('TOOLS: unsupported selection for this variant');
  if (args.includes('--install')) {
    const result = installTools(tools); console.log(JSON.stringify(result, null, 2));
    if (result.some(r => !r.installed && r.tool !== 'cursor')) throw new Error('INSTALL_FAILED: fix the reported installation before retrying');
  }
  const root = path.resolve(value('--project', process.cwd()));
  bootstrap({ root, coordinator, tools, profile: value('--profile'), opencodeModel: value('--opencode-model') });
  console.log(`Initialized ${root}. Full-control authorization is local to this project.\nNext: node agents/kit/scripts/runner.mjs doctor --probe\nReview and commit bootstrap files before starting a mission. No commit or push was performed.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
