import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleLoadout } from '../assets/scripts/domain/BattleLoadout.js';
import { RunProgression } from '../assets/scripts/domain/RunProgression.js';
import { ShotBudget } from '../assets/scripts/domain/BattleRules.js';
import { PickupRules } from '../assets/scripts/domain/PickupRules.js';
import { battleEquipmentLayout, battleAimRect } from '../assets/scripts/domain/BattleLayout.js';
import { loadSeedPack } from '../tools/config/files.js';
const cfg = (await loadSeedPack()).combat;
const inspect = (loadout: BattleLoadout) => loadout.snapshot;

test('切弓保留各自等级、共享技能和冷却；装备确实改变射击消耗与伤害', () => {
  const loadout = new BattleLoadout(), base = cfg.arrows[0]!, budget = new ShotBudget(cfg.player);
  loadout.upgrade(); const thunder = loadout.arrow(base);
  const context = { active: true, alive: true, armed: true, launchClear: true };
  assert.equal(budget.release(thunder, context), null);
  loadout.switchBow(); const gale = loadout.arrow(base);
  assert.ok(gale.intervalSec < thunder.intervalSec); assert.ok(gale.baseDamage < thunder.baseDamage);
  assert.equal(budget.release(gale, context), 'cooldown'); assert.equal(loadout.level, 1);
  loadout.switchBow(); assert.ok(loadout.arrow(base).baseDamage > base.baseDamage);
  loadout.switchBow(); assert.equal(loadout.level, 2);
  for (let i = 0; i < 10; i++) loadout.upgrade(); assert.equal(loadout.level, 4); assert.equal(loadout.upgrade(), false);
});

test('技能仅强化实际松手箭；预览、取消与拒射不消耗；切弓不会重置蓄能', () => {
  const loadout = new BattleLoadout(), point = { x: 4, y: 5 }, base = cfg.arrows[0]!;
  assert.equal(loadout.activate(point), true); assert.equal(loadout.activate(point), false);
  for (let i = 0; i < 50; i++) { assert.equal(loadout.arrow(base).skill, 'thunder'); }
  assert.equal(loadout.snapshot.primed?.shots, 1);
  loadout.switchBow(); assert.equal(loadout.snapshot.energy, 0); assert.equal(loadout.arrow(base).skill, 'thunder');
  const actual = loadout.arrow(base); loadout.fired(actual, point);
  assert.equal(loadout.snapshot.primed, null); assert.equal(loadout.arrow(base).skill, undefined);
  loadout.step(10); assert.equal(loadout.snapshot.energy, 50); loadout.charge(60); assert.equal(loadout.snapshot.energy, 100);
  assert.equal(loadout.activate(point), true); assert.equal(inspect(loadout).primed?.shots, 3);
  for (let i = 0; i < 3; i++) {
    const arrow = loadout.arrow(base); assert.equal(arrow.skill, 'gale'); assert.ok(arrow.intervalSec < base.intervalSec / 2);
    loadout.fired(arrow, point);
  }
  assert.equal(loadout.snapshot.primed, null); assert.equal(loadout.snapshot.energy, 0);
});

test('月蚀蓄能、符石和装备升级可叠加，但不改变弹速、物理冲量和发射数量', () => {
  const loadout = new BattleLoadout(), base = cfg.arrows[2]!;
  loadout.switchBow(); loadout.switchBow(); loadout.upgrade();
  const plain = loadout.arrow(base); loadout.activate({ x: 0, y: 0 }); loadout.useItem('rune', 50, 100);
  const enchanted = loadout.arrow(base);
  assert.equal(enchanted.baseDamage, plain.baseDamage * 3 * 1.5);
  assert.equal(enchanted.speedMps, base.speedMps); assert.equal(enchanted.impulseNs, base.impulseNs);
  loadout.fired(enchanted, { x: 0, y: 0 }); assert.equal(loadout.snapshot.rune, false);
  assert.equal(loadout.snapshot.primed, null);
});

test('药瓶不能复活或在满血浪费，符石不能重复消耗；库存上限与重开清理生效', () => {
  const loadout = new BattleLoadout();
  assert.equal(loadout.useItem('potion', 0, 100), null); assert.equal(loadout.useItem('potion', 100, 100), null);
  assert.equal(loadout.snapshot.items.potion, 2);
  assert.deepEqual(loadout.useItem('potion', 90, 100), { hp: 10 }); assert.equal(loadout.snapshot.items.potion, 1);
  assert.deepEqual(loadout.useItem('rune', 90, 100), { hp: 0 }); assert.equal(loadout.useItem('rune', 90, 100), null);
  for (let i = 0; i < 10; i++) loadout.addItem('rune'); assert.equal(loadout.snapshot.items.rune, 3);
  loadout.reset(); assert.equal(loadout.snapshot.energy, 100); assert.equal(loadout.snapshot.rune, false);
  assert.deepEqual(loadout.snapshot.items, { potion: 2, rune: 1 }); assert.equal(loadout.level, 1);
});

test('补给库存使用真实单次收取规则，敌箭不收取，旧练习补给行为保留', () => {
  for (const [roll, expected] of [[0, 'potion'], [1, 'rune']] as const) {
    const rules = new PickupRules(cfg.pickups, () => roll, true);
    const p = rules.step(100, true, () => ({ x: 9, y: 5 }))!;
    assert.equal(rules.collect(p.id, 'enemy'), null);
    assert.equal(rules.collect(p.id, 'player')!.item, expected); assert.equal(rules.collect(p.id, 'player'), null);
  }
});

test('段间锻造仅在当前弓可升级时入池，不引入无效的满级升级', () => {
  const loadout = new BattleLoadout(), run = new RunProgression(() => 1, () => loadout.canUpgrade);
  for (let i = 0; i < 5; i++) run.defeated(); assert.ok(run.offers.includes('forge'));
  assert.ok(run.choose('forge')); assert.ok(loadout.upgrade()); assert.equal(loadout.level, 2);
  loadout.upgrade(); loadout.upgrade();
  for (let i = 0; i < 5; i++) run.defeated(); assert.ok(!run.offers.includes('forge'));
});

test('技能特效数量和寿命有界，固定步不推进时保持，重开全部释放', () => {
  const loadout = new BattleLoadout();
  for (let i = 0; i < 100; i++) loadout.effect('thunder', { x: i, y: 0 }, true);
  assert.equal(loadout.effects.length, 16); loadout.step(0); assert.equal(loadout.effects[0]!.age, 0);
  loadout.step(0.5); assert.equal(loadout.effects.length, 0);
  loadout.effect('moon', { x: NaN, y: 0 }, true); assert.equal(loadout.effects.length, 0);
  loadout.activate({ x: 0, y: 0 }); loadout.reset(); assert.equal(loadout.effects.length, 0);
});

test('装备、技能、道具按钮互不重叠，位于瞄准区以外并满足48逻辑像素', () => {
  for (const [width, height, scale] of [[1920, 1080, 0.75], [2337, 1080, 390 / 1080], [1920, 1440, 1024 / 1920]] as const) {
    const safe = { left: 80, right: width - 60, top: 30, bottom: height - 30 };
    const buttons = Object.values(battleEquipmentLayout(safe, 48 / scale)), aim = battleAimRect(safe);
    for (const [i, button] of buttons.entries()) {
      assert.ok(button.left > aim.right && button.top >= safe.top && button.bottom <= safe.bottom);
      assert.ok((button.right - button.left) * scale >= 48 && (button.bottom - button.top) * scale >= 48);
      for (const other of buttons.slice(i + 1)) assert.ok(button.right <= other.left || button.left >= other.right || button.bottom <= other.top || button.top >= other.bottom);
    }
  }
});
