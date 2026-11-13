import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerRepository, RunChallenges, biomeForStage } from '../assets/scripts/domain/Expedition.js';
import { battlePauseLayout } from '../assets/scripts/domain/BattleLayout.js';
import { embeddedArrowPose } from '../assets/scripts/domain/ProjectilePresentation.js';
import { ReactionWeights, transferredImpulsePoint } from '../assets/scripts/domain/reaction.js';

class Memory {
  data = new Map<string, string>(); fail = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('quota'); this.data.set(key, value); }
}

test('三个场景每15战轮换；长局只使用三套资源', () => {
  assert.equal(biomeForStage(1).id, 'storm'); assert.equal(biomeForStage(3).id, 'storm');
  assert.equal(biomeForStage(4).id, 'frost'); assert.equal(biomeForStage(7).id, 'ember');
  assert.equal(biomeForStage(10).id, 'storm');
  assert.equal(new Set(Array.from({ length: 1000 }, (_, i) => biomeForStage(i + 1).id)).size, 3);
});

test('挑战仅按真实击败推进，受伤打断无伤目标；死亡同帧不发道具，不会自动发箭', () => {
  const run = new RunChallenges();
  for (let i = 0; i < 2; i++) assert.equal(run.defeated(true, false, true), null);
  assert.equal(run.defeated(true, false, true), 'rune'); assert.equal(run.snapshot.completed, 1);
  run.defeated(false, false, true); run.defeated(false, false, true); run.damaged();
  assert.equal(run.snapshot.progress, 0); assert.equal(run.snapshot.chain, 0);
  run.defeated(false, false, true); run.defeated(false, false, true);
  assert.equal(run.defeated(false, false, true), 'potion');
  for (let i = 0; i < 4; i++) assert.equal(run.defeated(false, false, true), null);
  assert.equal(run.defeated(false, true, false), null); assert.equal(run.snapshot.completed, 2);
  assert.equal(run.defeated(false, false, true), 'forge');
  assert.equal(run.tallies.bosses, 1); assert.equal(run.tallies.heads, 3);
  run.step(3); assert.equal(run.snapshot.banner, '');
  run.reset(); assert.deepEqual(run.tallies, { kills: 0, heads: 0, bosses: 0 }); assert.equal(run.snapshot.completed, 0);
});

test('修炼检查点幂等，写入失败后重试不会重发经验；最高传承伤害10%', () => {
  const storage = new Memory(), career = new CareerRepository(storage);
  assert.equal(career.snapshot.rank, 1);
  const tally = { kills: 5, heads: 3, bosses: 0 };
  storage.fail = true; assert.equal(career.checkpoint('run1', tally).ok, false);
  assert.equal(career.snapshot.xp, 8); assert.equal(career.snapshot.rank, 2);
  storage.fail = false; assert.equal(career.checkpoint('run1', tally).ok, true); assert.equal(career.snapshot.xp, 8);
  const loaded = new CareerRepository(storage); loaded.checkpoint('run1', tally); assert.equal(loaded.snapshot.xp, 8);
  assert.throws(() => loaded.checkpoint('run1', { kills: 4, heads: 2, bosses: 0 }));
  loaded.checkpoint('run2', { kills: 100, heads: 10, bosses: 6 });
  assert.equal(loaded.snapshot.damageBonus, .1); assert.equal(loaded.snapshot.nextXp, null);
  loaded.setMusic(false); assert.equal(new CareerRepository(storage).snapshot.music, false);
});

test('修炼坏档先备份，未来版本及不可读数据不被覆盖；最高分旧档保留', () => {
  const storage = new Memory(); storage.data.set('storm-archers.arcade', 'legacy');
  storage.data.set('storm-archers.career', '{broken');
  new CareerRepository(storage).setMusic(false);
  assert.equal(storage.data.get('storm-archers.career.backup'), '{broken');
  assert.equal(storage.data.get('storm-archers.arcade'), 'legacy');
  storage.data.set('storm-archers.career', '{"schemaVersion":2}');
  assert.deepEqual(new CareerRepository(storage).setMusic(false), { ok: false, reason: 'future-version' });
  assert.equal(storage.data.get('storm-archers.career'), '{"schemaVersion":2}');
  const denied = new CareerRepository({ getItem() { throw Error('denied'); }, setItem() { assert.fail(); } });
  assert.deepEqual(denied.setMusic(false), { ok: false, reason: 'read-failed' });
});

test('音乐、音效、全屏、重开四按钮满足手机触摸尺寸且互不重叠', () => {
  for (const [width, height, scale] of [[1920, 1080, .75], [2337, 1080, 390 / 1080], [1920, 1440, 1024 / 1920]]) {
    const safe = { left: 70, right: width! - 60, top: 30, bottom: height! - 30 };
    const { options, panel, retry } = battlePauseLayout(safe, 48 / scale!);
    assert.equal(options.length, 4);
    for (const [i, rect] of options.entries()) {
      assert.ok((rect.right - rect.left) * scale! >= 48 - 1e-8);
      assert.ok((rect.bottom - rect.top) * scale! >= 48 - 1e-8);
      assert.ok(rect.top >= panel.top && rect.bottom < retry.top);
      if (i) assert.ok(rect.left > options[i - 1]!.right);
    }
  }
});

test('插箭先短促扎入，再有限余震后完全静止；地面浅插，强弱有别', () => {
  assert.deepEqual(embeddedArrowPose(0, 22, false), { penetrationM: 0, angleRad: 0 });
  for (const terrain of [true, false]) {
    const final = embeddedArrowPose(1, 22, terrain);
    assert.equal(final.angleRad, 0); assert.ok(final.penetrationM > 0 && final.penetrationM <= .16);
    assert.ok(embeddedArrowPose(.02, 22, terrain).penetrationM < final.penetrationM);
    assert.ok(Math.abs(embeddedArrowPose(.02, 22, terrain).angleRad) > .001);
    assert.deepEqual(embeddedArrowPose(2, 22, terrain), final);
  }
  assert.ok(embeddedArrowPose(1, 22, false).penetrationM > embeddedArrowPose(1, 12, false).penetrationM);
  assert.ok(embeddedArrowPose(1, 12, false).penetrationM > embeddedArrowPose(1, 12, true).penetrationM);
});

test('躯干受力点保留头/腿方向且力臂有界，受击马达先让位再恢复', () => {
  assert.deepEqual(transferredImpulsePoint({ x: 9, y: 9 }, { x: 5, y: 3 }), { x: 5.22, y: 3.3 });
  assert.deepEqual(transferredImpulsePoint({ x: 5, y: 0 }, { x: 5, y: 3 }), { x: 5, y: 2.7 });
  const weights = new ReactionWeights(); weights.register([{ joint: 'waist', weight: .1, recoverySec: .4 }]);
  weights.step(.1); assert.equal(weights.weight('waist'), .1);
  weights.step(.1); assert.ok(weights.weight('waist') > .1 && weights.weight('waist') < 1);
  weights.step(.2); assert.equal(weights.weight('waist'), 1);
});
