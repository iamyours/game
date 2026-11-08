import type { SeedPack } from '../../../tools/config/schema.js';
import type { BootManifest } from './BootManifest.js';
import type { RigDefinition } from '../physics/RigDefinition.js';

type Combat = SeedPack['combat'];
export type CombatLabConfig = Pick<Combat, 'arcade' | 'run' | 'pickups' | 'bowControl' | 'viewport' | 'input' | 'physics' | 'arrows' | 'player' | 'enemies' | 'damage' | 'reaction' | 'limits'>;
export type PhysicsLabConfig = CombatLabConfig & { readonly rig: RigDefinition };

/** Build-time schema/seed drift checks validate the payload; Boot rejects a mismatched resource pack. */
export function readPhysicsLabConfig(raw: unknown, manifest: BootManifest): CombatLabConfig {
  const asset = raw as { seedHash?: string; data?: CombatLabConfig & { configVersion?: number } } | null;
  if (!asset || asset.seedHash !== manifest.seedHash || !asset.data || asset.data.configVersion !== manifest.configVersion) {
    throw new Error('PhysicsLab 战斗配置与启动清单不一致；请重新生成配置');
  }
  return asset.data;
}
