import fs from 'node:fs';
import path from 'node:path';
const [operation, source, link] = process.argv.slice(2);
if (!['create', 'remove'].includes(operation) || !source || !link) throw new Error('Usage: worktree-link.mjs create|remove <source> <link>');
if (operation === 'create') fs.symlinkSync(path.resolve(source), path.resolve(link), process.platform === 'win32' ? 'junction' : 'dir');
else {
  if (!fs.lstatSync(link).isSymbolicLink()) throw new Error(`REFUSE_REAL_DIRECTORY: ${link}`);
  fs.unlinkSync(link);
}
