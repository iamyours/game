import assert from 'node:assert/strict';
import test from 'node:test';
import { RunProgression } from '../assets/scripts/domain/RunProgression.js';
import { battleRewardLayout } from '../assets/scripts/domain/BattleLayout.js';
import { ShotBudget, EnemyAttack, AttackSlots } from '../assets/scripts/domain/BattleRules.js';
import { loadSeedPack, renderGenerated } from '../tools/config/files.js';
import { readRigDefinition } from '../assets/scripts/physics/RigDefinition.js';
import { readBootManifest } from '../assets/scripts/core/BootManifest.js';
import { biomeForStage } from '../assets/scripts/domain/Expedition.js';
const pack = await loadSeedPack(), generated = renderGenerated(pack);
const cfg = { ...pack.combat, rig: readRigDefinition(JSON.parse(generated.get('rig.json')!), readBootManifest(JSON.parse(generated.get('manifest.json')!))) };
const clearStage = (run: RunProgression) => { for (let i = 0; i < 5; i++) run.defeated(); };

test('段末必须选择一次；无效选项、重复确认不升级；下一段不跳过', () => {
  const run = new RunProgression(() => 0);
  for (let i = 0; i < 4; i++) run.defeated();
  assert.equal(run.pending, false); assert.equal(run.progress, 4);
  run.defeated(); assert.equal(run.pending, true); assert.equal(run.stage, 2);
  assert.equal(new Set(run.offers).size, 3);
  run.defeated(); assert.equal(run.stage, 2); assert.equal(run.progress, 0);
  assert.equal(run.choose('recover'), false); assert.equal(run.pending, true);
  assert.equal(run.choose('quick'), true); assert.equal(run.choose('quick'), false);
  assert.equal(run.upgrades.quick, 1); run.defeated(); assert.equal(run.progress, 1);
});

test('快弦实际缩短共享冷却，切箭仍不能绕过；升级不污染配置或改变弹速', () => {
  const run = new RunProgression(() => 0), original = JSON.stringify(cfg.arrows);
  clearStage(run); run.choose('quick');
  const normal = run.arrow(cfg.arrows[0]!), impact = run.arrow(cfg.arrows[1]!);
  const budget = new ShotBudget(cfg.player), context = { active: true, alive: true, armed: true, launchClear: true };
  assert.equal(budget.release(normal, context), null);
  budget.step(normal.intervalSec - 0.01, false, true);
  assert.equal(budget.release(impact, context), 'cooldown');
  budget.step(0.01, false, true); assert.equal(budget.release(impact, context), null);
  assert.ok(normal.intervalSec < cfg.arrows[0]!.intervalSec);
  assert.equal(normal.speedMps, cfg.arrows[0]!.speedMps); assert.equal(JSON.stringify(cfg.arrows), original);
});

test('不同箭种强化只改变对应箭，物理冲量保留安全标定', () => {
  for (const id of ['normal', 'impact', 'piercing'] as const) {
    let seed = 21;
    const run = new RunProgression(() => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646);
    for (let stage = 0; !run.upgrades[id] && stage < 50; stage++) {
      clearStage(run); assert.ok(run.choose(run.offers.includes(id) ? id : run.offers[0]!));
    }
    assert.equal(run.upgrades[id], 1);
    for (const base of cfg.arrows) {
      const arrow = run.arrow(base);
      if (base.id === id) assert.ok(arrow.baseDamage > base.baseDamage);
      assert.equal(arrow.impulseNs, base.impulseNs); assert.equal(arrow.speedMps, base.speedMps);
    }
  }
});

test('百段长局强化有上限，满级移出选池；全部满级仍可休整，重开清空', () => {
  const run = new RunProgression(() => 0);
  for (let stage = 0; stage < 100; stage++) {
    clearStage(run);
    assert.ok(run.offers.length >= 1 && run.offers.length <= 3);
    for (const id of run.offers) assert.ok(id === 'recover' || (run.upgrades[id] ?? 0) < 3);
    assert.ok(run.choose(run.offers[0]!));
  }
  assert.equal(run.stage, 101);
  for (const value of Object.values(run.upgrades)) assert.ok(value <= 3);
  for (const base of cfg.arrows) {
    const arrow = run.arrow(base); assert.ok(arrow.staminaCost >= base.staminaCost * 0.3999);
    assert.ok(arrow.intervalSec >= base.intervalSec * 0.6999);
  }
  run.reset(); assert.equal(run.stage, 1); assert.equal(run.pending, false); assert.deepEqual(run.upgrades, {});
  assert.deepEqual(run.arrow(cfg.arrows[0]!), cfg.arrows[0]!);
});

test('开局有缓冲、相邻特殊敌人不重复；每五敌精英，百段压力封顶且无隐形头盔', () => {
  const run = new RunProgression(() => 0), original = JSON.stringify(cfg.enemies);
  let previous = '', lastMin = 0;
  for (let i = 0; i < 500; i++) {
    const e = run.encounter(cfg);
    if (i < 2) assert.equal(e.kind, 'archer');
    else assert.notEqual(e.kind, previous);
    assert.equal(e.kind === 'boss', (i + 1) % 15 === 0);
    assert.equal(e.kind === 'elite', (i + 1) % 5 === 0 && (i + 1) % 15 !== 0);
    assert.equal(e.spec.helmetDurability, 0); assert.ok(e.spec.hp <= 180);
    assert.ok(e.spec.telegraphSec >= 0.42);
    assert.equal(e.spec.speedMps, e.kind === 'boss' && biomeForStage(run.stage).id === 'frost' ? 18 * 1.12 : 18);
    if (e.kind === 'elite') {
      assert.equal(e.spec.phaseTwoHpRatio, 0.5);
      if (i > 25) assert.equal(e.spec.attackIntervalRangeSec[0], lastMin);
      lastMin = e.spec.attackIntervalRangeSec[0];
    }
    previous = e.kind; run.defeated(); if (run.pending) run.choose(run.offers[0]!);
  }
  assert.equal(JSON.stringify(cfg.enemies), original);
});

test('神射手和猎手的实际攻击机体现不同时间窗口，暂停不会偷跑蓄势', () => {
  const encounters = new Map();
  for (const random of [0, 0.5, 1]) {
    const run = new RunProgression(() => random); run.defeated(); run.defeated();
    const e = run.encounter(cfg); encounters.set(e.kind, e);
  }
  for (const kind of ['hunter', 'sniper']) {
    const e = encounters.get(kind)!;
    const attack = new EnemyAttack(e.spec, cfg.run, new AttackSlots(0.6), () => 0);
    const state = { active: true, alive: true, armed: true, hpRatio: 1 };
    assert.equal(attack.step(cfg.run.firstEnemyShotMinSec - e.spec.telegraphSec, state, () => 2.8)[0]?.kind, 'telegraph');
    assert.deepEqual(attack.step(30, { ...state, active: false }, () => 2.8), []);
    assert.deepEqual(attack.step(e.spec.telegraphSec - 0.01, state, () => 2.8), []);
    assert.equal(attack.step(0.01, state, () => 2.8)[0]?.kind, 'release');
  }
  assert.ok(encounters.get('hunter').spec.telegraphSec < encounters.get('sniper').spec.telegraphSec);
});

test('强化卡在手机和桌面安全区内，三卡不重叠且满足48逻辑像素', () => {
  for (const [w, h, scale] of [[1920, 1080, 0.75], [2337, 1080, 390 / 1080], [1920, 1440, 1024 / 1920]] as const) {
    const safe = { left: 80, right: w - 60, top: 30, bottom: h - 30 };
    const layout = battleRewardLayout(safe, 48 / scale);
    assert.ok(layout.panel.top >= safe.top && layout.panel.bottom <= safe.bottom);
    for (let i = 0; i < 3; i++) {
      const r = layout.cards[i]!;
      assert.ok(r.left >= safe.left && r.right <= safe.right);
      assert.ok((r.right - r.left) * scale >= 48 && (r.bottom - r.top) * scale >= 48);
      if (i > 0) assert.ok(r.left > layout.cards[i - 1]!.right);
    }
  }
});

test('每三段BOSS重复登场且半血有实际攻速变化，普通段末保持精英', () => {
  const run = new RunProgression(() => 0);
  for (let i = 0; i < 14; i++) { run.defeated(); if (run.pending) run.choose(run.offers[0]!); }
  const boss = run.encounter(cfg); assert.equal(boss.kind, 'boss'); assert.equal(boss.spec.hp, 180); assert.equal(run.bossIn, 1);
  const gaps = [1, 0.5].map(hpRatio => {
    const attack = new EnemyAttack(boss.spec, cfg.run, new AttackSlots(0.6), () => 0);
    const times: number[] = [];
    for (let i = 1; i < 1000 && times.length < 2; i++) {
      if (attack.step(1 / 60, { active: true, alive: true, armed: true, hpRatio }, () => 2.8).some(e => e.kind === 'release')) times.push(i / 60);
    }
    assert.equal(times.length, 2); return times[1]! - times[0]!;
  });
  assert.ok(gaps[1]! < gaps[0]! * 0.7);
  run.defeated(); assert.equal(run.afterBoss, true); run.choose(run.offers[0]!);
  assert.equal(run.bossIn, 15);
});
