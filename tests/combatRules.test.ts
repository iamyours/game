import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDamage, type DamageInput } from '../assets/scripts/domain/damage.js';
import { loadSeedPack } from '../tools/config/files.js';

const pack = await loadSeedPack();
const input: DamageInput = { baseDamage: 18, zoneMultiplier: 1, armor: 0, armorDamageFactor: 1, armorOverflow: false };
test('无甲直接扣生命，部位倍率来自配置而非重复常量', () => {
  assert.equal(resolveDamage({ ...input, zoneMultiplier: pack.combat.damage.zoneMultipliers.head }).hpDamage, 36);
  assert.equal(resolveDamage({ ...input, zoneMultiplier: pack.combat.damage.zoneMultipliers.limb }).hpDamage, 12);
});
test('普通箭破甲不把本次余伤传体，后续无甲命中才扣生命', () => {
  const hit = resolveDamage({ ...input, armor: 5 });
  assert.deepEqual(hit, { zoneDamage: 18, armorDamage: 5, hpDamage: 0, remainingArmor: 0 });
  assert.equal(resolveDamage({ ...input, armor: hit.remainingArmor }).hpDamage, 18);
});
test('穿甲原始伤害 32 / 耐久 20 / 系数 2 = 生命扣 22（仅公式测试，不放行 AC11）', () => {
  assert.deepEqual(resolveDamage({ ...input, baseDamage: 16, zoneMultiplier: 2, armor: 20, armorDamageFactor: 2, armorOverflow: true }),
    { zoneDamage: 32, armorDamage: 20, hpDamage: 22, remainingArmor: 0 });
});
test('完全吸收不扣血，恰好破甲不扣血', () => {
  assert.equal(resolveDamage({ ...input, armor: 100, armorOverflow: true }).hpDamage, 0);
  assert.equal(resolveDamage({ ...input, armor: 36, armorDamageFactor: 2, armorOverflow: true }).hpDamage, 0);
});
test('余伤最后向上取整，不能先对装甲等价伤害取整', () => {
  assert.equal(resolveDamage({ ...input, armor: 1, armorDamageFactor: 2, armorOverflow: true }).hpDamage, 18);
});
test('零伤害无副作用', () => {
  assert.deepEqual(resolveDamage({ ...input, baseDamage: 0, armor: 20 }), { zoneDamage: 0, armorDamage: 0, hpDamage: 0, remainingArmor: 20 });
});
test('拒绝 NaN / 无穷 / 负数 / 零倍率 / 运算溢出', () => {
  for (const key of ['baseDamage', 'zoneMultiplier', 'armor', 'armorDamageFactor']) {
    for (const value of [NaN, Infinity, -1]) assert.throws(() => resolveDamage({ ...input, [key]: value }));
  }
  assert.throws(() => resolveDamage({ ...input, armorDamageFactor: 0 }));
  assert.throws(() => resolveDamage({ ...input, zoneMultiplier: 0 }));
  assert.throws(() => resolveDamage({ ...input, baseDamage: Number.MAX_VALUE, zoneMultiplier: 2 }));
});
