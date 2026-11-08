import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = data => createHash('sha256').update(data).digest('hex');
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) result.push(...await files(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}
async function fingerprint(paths) {
  const result = {};
  for (const path of paths.sort()) result[relative(root, path)] = hash(await readFile(path));
  return result;
}
const report = JSON.parse(await readFile(resolve(root, 'evidence/T003/web-verification.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'assets/resources/config/manifest.json'), 'utf8'));
assert.equal(report.passed, true, '不得给失败运行生成最终通过快照');
const sourceDirs = ['assets', 'configs', 'tools', 'scripts', 'tests', 'settings', '.creator', 'docs', 'tasks', 'build-templates'];
const sourceFiles = await fingerprint((await Promise.all(sourceDirs.map(dir => files(resolve(root, dir))))).flat().concat(
  ['AGENTS.md', 'README.md', '.gitignore', '.npmrc', '.nvmrc', 'package.json', 'package-lock.json',
    'tsconfig.json', 'tsconfig.creator.json', 'qa_cases.csv', 'tasks.csv'].map(path => resolve(root, path))));
const engineRoot = '/Applications/CocosCreator.app/Contents/Resources/resources/3d/engine';
const engineFiles = {};
for (const path of ['cocos/physics-2d/framework/physics-system.ts', 'cocos/physics-2d/box2d/rigid-body.ts',
  'cocos/physics-2d/box2d/physics-world.ts', 'cocos/input/input.ts', 'pal/input/web/touch-input.ts',
  'pal/screen-adapter/web/screen-adapter.ts']) engineFiles[path] = hash(await readFile(resolve(engineRoot, path)));
const output = { capturedDate: report.date, algorithm: 'sha256', creator: report.runtime.version,
  seedHash: manifest.seedHash, sourceRevision: hash(JSON.stringify(sourceFiles)), engineRoot, engineFiles, sourceFiles,
  buildFiles: await fingerprint(await files(resolve(root, 'build/web-desktop'))),
  evidenceFiles: await fingerprint((await files(resolve(root, 'evidence/T003'))).filter(path => !path.endsWith('/snapshot-manifest.json'))) };
await writeFile(resolve(root, 'evidence/T003/snapshot-manifest.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ sourceRevision: output.sourceRevision, sourceCount: Object.keys(sourceFiles).length,
  buildCount: Object.keys(output.buildFiles).length, seedHash: output.seedHash }, null, 2));
