import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
let failed = false;
for (const file of [...walk(path.join(root, 'scripts')), ...walk(path.join(root, 'tests'))].filter(file => file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); failed = true; }
}
for (const file of [...walk(path.join(root, 'templates')), path.join(root, 'kit.json'), path.join(root, 'package.json')].filter(file => file.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { console.error(`${file}: ${error.message}`); failed = true; }
}
const profile = JSON.parse(fs.readFileSync(path.join(root, 'kit.json'), 'utf8'));
for (const file of ['README.md', 'README.en.md', 'CLI.md', 'BOOTSTRAP.md']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const required of ['full-control', 'doctor', 'watch']) if (!text.includes(required)) { console.error(`${file}: missing ${required}`); failed = true; }
  if (profile.coordinator === 'codex' && /claude/i.test(text)) { console.error(`${file}: unexpected dependency on the other coordinator`); failed = true; }
}
process.exitCode = failed ? 1 : 0;
if (!failed) console.log('JavaScript syntax, JSON contracts and variant documentation checks passed.');
