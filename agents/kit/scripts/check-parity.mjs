import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const other = process.argv[2];
if (!other) throw new Error('Usage: node scripts/check-parity.mjs <other-variant-checkout>');
function walk(directory, prefix = '') {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(directory, path.join(prefix, entry.name)) : [path.join(prefix, entry.name)]);
}
const common = ['scripts', 'tests', 'templates'].flatMap(dir => walk(path.join(root, dir)).map(file => path.join(dir, file))).filter(file => path.basename(file) !== 'CLAUDE.md');
const differences = common.filter(file => !fs.existsSync(path.join(other, file)) || !fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(other, file))));
if (differences.length) { console.error(`Shared core differs:\n${differences.join('\n')}`); process.exitCode = 1; }
else console.log(`Shared core parity passed (${common.length} files).`);
