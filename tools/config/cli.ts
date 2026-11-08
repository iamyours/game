import { checkGeneratedFiles, generateFiles, loadSeedPack, seedHash } from './files.js';

try {
  const command = process.argv[2] ?? 'check';
  if (!['check', 'generate', 'check-generated'].includes(command)) throw new Error(`未知命令：${command}`);
  const pack = await loadSeedPack();
  if (command === 'generate') await generateFiles(pack);
  if (command === 'check-generated') await checkGeneratedFiles(pack);
  console.log(JSON.stringify({
    ok: true, command, configVersion: pack.combat.configVersion, sourceKind: 'unverified_seed',
    runtimeVerified: false, seedHash: seedHash(pack),
    arrows: pack.combat.arrows.map((arrow) => arrow.id), levels: pack.levels.levels.map((level) => level.id),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
