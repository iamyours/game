import assert from 'node:assert/strict';
import test from 'node:test';
import { ArcadeCycle, chooseArcadeSpawn } from '../assets/scripts/domain/ArcadeRules.js';
import { lethalHeadshot, resolveDamage } from '../assets/scripts/domain/damage.js';
import { loadSeedPack } from '../tools/config/files.js';
import { readRigDefinition } from '../assets/scripts/physics/RigDefinition.js';
import { readBootManifest } from '../assets/scripts/core/BootManifest.js';
import { renderGenerated } from '../tools/config/files.js';
const pack = await loadSeedPack(), generated = renderGenerated(pack);
const rig = readRigDefinition(JSON.parse(generated.get('rig.json')!), readBootManifest(JSON.parse(generated.get('manifest.json')!)));
const cfg = { ...pack.combat, rig };
test('死亡只计一次，等待平台坠落后重生；玩家死亡停止生成，暂停不推进时钟', () => {
 const c = new ArcadeCycle(1.2); assert.equal(c.canSpawn(true), false);
 assert.equal(c.defeated(1), true); assert.equal(c.defeated(1), false);
 c.step(1.19); assert.equal(c.canSpawn(true), false);
 c.step(0.01); assert.equal(c.canSpawn(false), false); assert.equal(c.canSpawn(true), true);
 c.spawned(); assert.equal(c.canSpawn(true), false); assert.equal(c.score, 1);
 c.defeated(2); assert.equal(c.defeated(1), false); assert.equal(c.score, 2);
 c.reset(); assert.equal(c.score, 0); assert.equal(c.canSpawn(true), false);
});
test('随机平台在约定范围，普通箭静态可达，随机源可重放', () => {
 for (const r of [0, 0.25, 0.5, 0.99, 1]) {
  const a = chooseArcadeSpawn(cfg, () => r);
  assert.ok(a.x >= 16.8 && a.x <= 20.5); assert.ok(a.y >= 3 && a.y <= 6.3);
  assert.ok(a.width >= 1.6 && a.width <= 2.8);
  assert.deepEqual(a, chooseArcadeSpawn(cfg, () => r));
 }
 assert.throws(() => chooseArcadeSpawn(cfg, () => NaN));
});
test('随机源连续落在不可达候选时仍回退到可达网格，不阻塞连续模式启动', () => {
 const values = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
 let i = 0;
 const a = chooseArcadeSpawn(cfg, () => values[i++ % values.length]!);
 assert.ok(a.x >= 16.8 && a.x <= 20.5);
 assert.ok(a.y >= 3 && a.y <= 6.3);
});
test('爆头致命不作用于身体或被甲吸收的伤害，原伤害结果不变', () => {
 const hit = resolveDamage({baseDamage:18,zoneMultiplier:2,armor:0,armorDamageFactor:1,armorOverflow:false});
 assert.equal(lethalHeadshot(hit, 85, true).hpDamage, 85);
 assert.equal(lethalHeadshot(hit, 85, false).hpDamage, 36); assert.equal(hit.hpDamage, 36);
 const armor = resolveDamage({baseDamage:18,zoneMultiplier:2,armor:45,armorDamageFactor:1,armorOverflow:false});
 assert.equal(lethalHeadshot(armor, 85, true).hpDamage, 0);
});
