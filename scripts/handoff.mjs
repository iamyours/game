import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard').split('\n'))]
  .filter(p => /^(assets|configs|scripts|tools|tests|settings|build-templates)\//.test(p) || /^(package(-lock)?\.json|tsconfig.*\.json|AGENTS\.md)$/.test(p)).sort();
const hashes = Object.fromEntries(files.filter(p => existsSync(resolve(root, p)))
  .map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const taskIds = readdirSync(resolve(root, 'tasks')).filter(p => /^T[0-9]{3}\.md$/.test(p)).map(p => p.slice(0, -3)).sort();
const tasks = taskIds.map(id => {
  const body = readFileSync(resolve(root, 'tasks', id + '.md'), 'utf8');
  return { id, state: /状态：([A-Z_]+)/.exec(body)?.[1] ?? 'UNKNOWN' };
});
const report = {
  generatedAt: new Date().toISOString(), sourceRevision: git('rev-parse', 'HEAD'),
  dirty: Boolean(git('status', '--porcelain')), sourceHash: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  engine: JSON.parse(readFileSync(resolve(root, 'configs/engine.lock.json'), 'utf8')).patch,
  seedHash: JSON.parse(readFileSync(resolve(root, 'assets/resources/config/manifest.json'), 'utf8')).seedHash,
  sourceFiles: hashes, tasks,
  assetsAwaitingEditorMeta: files.filter(p => p.startsWith('assets/') && !p.endsWith('.meta') && existsSync(resolve(root, p)) && !existsSync(resolve(root, p + '.meta'))),
  localEditorImportPresent: existsSync(resolve(root, 'temp/tsconfig.cocos.json')),
  localWebOutputPresent: existsSync(resolve(root, 'build/web-desktop/index.html')),
  acceptance: 'NOT_EVALUATED',
  note: 'Inventory only. Files or historical PASS records do not prove this revision builds or runs. Import new assets in Creator 3.8.8, commit generated meta, then rebuild and validate.',
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const target = process.argv[outputIndex + 1];
  if (!target) throw Error('--output requires a path');
  writeFileSync(resolve(root, target), JSON.stringify(report, null, 2) + '\n');
  console.log(`Handoff inventory written: ${target}; acceptance remains NOT_EVALUATED.`);
} else console.log(JSON.stringify(report, null, 2));
