import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedPack } from './schema.js';
import { validateSeedPack } from './validate.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const configNames = ['combat', 'rig', 'levels', 'platform'] as const;
export const GENERATED_DIR = resolve(ROOT, 'assets/resources/config');

export async function loadSeedPack(root = ROOT): Promise<SeedPack> {
  const entries = await Promise.all(configNames.map(async (name) => {
    const path = resolve(root, 'configs', `${name}.seed.json`);
    return [name, JSON.parse(await readFile(path, 'utf8')) as unknown] as const;
  }));
  return validateSeedPack(Object.fromEntries(entries));
}

export function seedHash(pack: SeedPack): string {
  return createHash('sha256').update(JSON.stringify(pack)).digest('hex');
}

/** No timestamps: repeated generation from the same source is byte-for-byte reproducible. */
export function renderGenerated(pack: SeedPack): Map<string, string> {
  const hash = seedHash(pack);
  const render = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;
  const files = new Map<string, string>();
  for (const name of configNames) {
    files.set(`${name}.json`, render({ generatedFrom: `configs/${name}.seed.json`,
      sourceKind: 'unverified_seed', runtimeVerified: false, seedHash: hash, data: pack[name] }));
  }
  files.set('manifest.json', render({
    formatVersion: 1, configVersion: 2, sourceKind: 'unverified_seed', runtimeVerified: false, seedHash: hash,
    resources: configNames.map((name) => `config/${name}`),
    summary: {
      designWidth: pack.combat.viewport.designWidth, designHeight: pack.combat.viewport.designHeight,
      worldWidthM: pack.combat.viewport.worldWidthM, worldHeightM: pack.combat.viewport.worldHeightM,
      arrowIds: pack.combat.arrows.map((arrow) => arrow.id), levelIds: pack.levels.levels.map((level) => level.id),
      bodyCount: pack.rig.bodyCount,
    },
  }));
  return files;
}

export async function generateFiles(pack: SeedPack, directory = GENERATED_DIR): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const [name, content] of renderGenerated(pack)) {
    await writeFile(resolve(directory, name), content, 'utf8');
  }
}

export async function checkGeneratedFiles(pack: SeedPack, directory = GENERATED_DIR): Promise<void> {
  for (const [name, expected] of renderGenerated(pack)) {
    const actual = await readFile(resolve(directory, name), 'utf8');
    if (actual !== expected) throw new Error(`${name} 与种子或生成格式不一致；运行 npm run config:generate`);
  }
}
