import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSeedPack } from '../tools/config/files.js';
import { AttackSlots, EnemyAttack, ShotBudget, ballisticAngles } from '../assets/scripts/domain/BattleRules.js';
import { RunSession } from '../assets/scripts/domain/RunSession.js';
import { PickupRules } from '../assets/scripts/domain/PickupRules.js';
import { LifecycleRules, RuntimeDiagnostics } from '../assets/scripts/domain/RuntimeDiagnostics.js';
const { combat, levels } = await loadSeedPack();
const ready = { active: true, alive: true, armed: true, launchClear: true };
const life = { active: true, alive: true, armed: true, hpRatio: 1 };
const dt = 1 / 60;

test('三箭共享已发生的冷却；受阻不消耗体力，暂停不恢复，重开回满', () => {
  const budget = new ShotBudget(combat.player);
  const [normal, impact] = combat.arrows;
  assert.equal(budget.release(normal!, { ...ready, launchClear: false }), 'blocked');
  assert.equal(budget.stamina, 100);
  assert.equal(budget.release(normal!, ready), null);
  assert.equal(budget.stamina, 94);
  assert.equal(budget.release(impact!, ready), 'cooldown');
  budget.step(30, false, false);
  assert.equal(budget.stamina, 94); assert.equal(budget.cooldownSec, normal!.intervalSec);
  budget.step(normal!.intervalSec, true, true);
  assert.equal(budget.release(impact!, ready), null);
  assert.equal(budget.cooldownSec, impact!.intervalSec);
  assert.equal(budget.release(normal!, { ...ready, alive: false }), 'dead');
  assert.equal(budget.release(normal!, { ...ready, armed: false }), 'disarmed');
  budget.reset(); assert.equal(budget.stamina, 100); assert.equal(budget.cooldownSec, 0);
});

test('体力耗尽不产生待发意图；恢复后必须重新调用新释放', () => {
  const budget = new ShotBudget({ ...combat.player, stamina: 6, staminaRegenHeldPerSec: 0 });
  const arrow = combat.arrows[0]!;
  assert.equal(budget.release(arrow, ready), null);
  budget.step(1, true, true);
  assert.equal(budget.release(arrow, ready), 'exhausted');
  budget.step(1, false, true);
  assert.equal(budget.stamina, 6);
  assert.equal(budget.release(arrow, ready), null);
  assert.throws(() => budget.step(NaN, false, true));
});

test('同波敌人错峰蓄势，首发时间、蓄势时长及冻结满足种子', () => {
  const slots = new AttackSlots(combat.run.enemyAttackStartSeparationSec);
  const enemies = [0, 1].map(() => new EnemyAttack(combat.enemies[0]!, combat.run, slots, () => 0.5));
  const events: { enemy: number; kind: string; time: number }[] = [];
  for (let step = 1; step <= 400; step++) {
    enemies.forEach((enemy, index) => {
      for (const event of enemy.step(dt, life, () => 0.2)) events.push({ enemy: index, kind: event.kind, time: step * dt });
    });
  }
  const starts = events.filter(e => e.kind === 'telegraph');
  const releases = events.filter(e => e.kind === 'release');
  assert.ok(releases[0]!.time >= combat.run.firstEnemyShotMinSec - 1e-8);
  assert.ok(starts[1]!.time - starts[0]!.time >= 0.6 - 1e-8);
  for (const e of releases) {
    const start = starts.filter(s => s.enemy === e.enemy && s.time < e.time).at(-1)!;
    assert.ok(e.time - start.time >= combat.enemies[0]!.telegraphSec - 1e-8);
  }
  const enemy = new EnemyAttack(combat.enemies[0]!, combat.run, new AttackSlots(0.6), () => 0.5);
  assert.deepEqual(enemy.step(100, { ...life, active: false }, () => 0), []);
  assert.deepEqual(enemy.step(dt, life, () => 0), []);
});

test('蓄势中死亡或失弓取消；无解目标不发射；瞄准在蓄势时冻结', () => {
  for (const disabled of [{ ...life, alive: false }, { ...life, armed: false }]) {
    const enemy = new EnemyAttack(combat.enemies[0]!, combat.run, new AttackSlots(0.6), () => 0.5);
    assert.equal(enemy.step(1, life, () => 0.2)[0]?.kind, 'telegraph');
    assert.deepEqual(enemy.step(dt, disabled, () => 0.8), []);
    assert.deepEqual(enemy.step(10, life, () => 0.8), []);
  }
  const enemy = new EnemyAttack(combat.enemies[0]!, combat.run, new AttackSlots(0.6), () => 0.5);
  assert.deepEqual(enemy.step(1, life, () => null), []);
  assert.equal(enemy.step(10, life, () => 0.2)[0]?.kind, 'telegraph');
  assert.equal(enemy.step(0.5, life, () => 0.8)[0]?.aimRad, 0.2);
});

test('抛物线候选可命中左右静态目标；远距、垂直和无效数返回无解', () => {
  for (const dx of [14, -14]) for (const dy of [0, 3]) {
    for (const angle of ballisticAngles(dx, dy, 18, 9.8)) {
      const t = dx / (18 * Math.cos(angle));
      assert.ok(t > 0);
      assert.ok(Math.abs(18 * Math.sin(angle) * t - 9.8 * t * t / 2 - dy) < 1e-7);
    }
  }
  assert.ok(ballisticAngles(14, 0, 18, 9.8).length > 0);
  assert.deepEqual(ballisticAngles(100, 0, 18, 9.8), []);
  assert.deepEqual(ballisticAngles(0, 0, 18, 9.8), []);
  assert.deepEqual(ballisticAngles(NaN, 0, 18, 9.8), []);
});

const frame = (run: RunSession, dead = false, hostileProjectiles = 0) => ({ playerAlive: true, playerOutOfBounds: false,
  enemies: run.enemiesToSpawn.map(e => ({ id: e.id, alive: !dead, outOfBounds: false })), hostileProjectiles });

test('同一步双亡失败且仅结算一次；未出生/失弓存活者不能提前清波', () => {
  const run = new RunSession('mutual', levels.levels[0]!, combat.run.waveTransitionSec);
  assert.equal(run.snapshot.canFire, false);
  assert.equal(run.start().length, 2); assert.deepEqual(run.start(), []);
  assert.deepEqual(run.afterStep(dt, { ...frame(run), enemies: [] }), []);
  assert.deepEqual(run.afterStep(dt, frame(run)), []);
  const result = run.afterStep(dt, { ...frame(run, true), playerAlive: false });
  assert.equal(result.at(-1)?.outcome, 'lost');
  assert.deepEqual(run.afterStep(dt, frame(run, true)), []);
  assert.equal(run.snapshot.canFire, false);
});

test('三关九波规则模拟：敌箭未清不能转场，暂停冻结，转场必须清箭，首领独占', () => {
  for (const level of levels.levels) {
    const run = new RunSession(level.id, level, combat.run.waveTransitionSec);
    run.start();
    for (let wave = 0; wave < 3; wave++) {
      assert.equal(run.snapshot.waveIndex, wave);
      assert.deepEqual(run.afterStep(dt, frame(run, true, 1)), []);
      assert.equal(run.snapshot.canFire, false, '清波后在途敌箭仍可能命中，必须停止新的射击');
      const events = run.afterStep(dt, frame(run, true));
      assert.equal(events[0]?.kind, 'clear-projectiles');
      if (wave < 2) {
        assert.equal(run.snapshot.canFire, false);
        run.setPaused(true); assert.deepEqual(run.afterStep(100, frame(run, true)), []);
        run.setHidden(true); run.setPaused(false);
        assert.deepEqual(run.afterStep(100, frame(run, true)), []);
        run.setHidden(false);
        assert.equal(run.afterStep(1.49, frame(run, true)).length, 0);
        assert.equal(run.afterStep(0.01, frame(run, true)).at(-1)?.kind, 'spawn-wave');
      } else assert.equal(events.at(-1)?.outcome, 'won');
    }
    assert.equal(run.snapshot.phase, 'won');
  }
  assert.deepEqual(levels.levels[2]!.waves[2]!.map(e => e.enemyId), ['boss']);
});

test('补给必须世界确认可达，敌箭不收取，玩家只收取一次；暂停及超限无积压', () => {
  const rules = new PickupRules(combat.pickups, () => 0);
  assert.equal(rules.step(9, true, () => ({ x: 9, y: 5 })), null);
  assert.equal(rules.step(100, false, () => ({ x: 9, y: 5 })), null);
  assert.equal(rules.step(1, true, () => null), null);
  const fruit = rules.step(10, true, () => ({ x: 9, y: 5 }))!;
  assert.equal(fruit.kind, 'red');
  assert.equal(rules.collect(fruit.id, 'enemy'), null);
  assert.deepEqual(rules.collect(fruit.id, 'player'), { hp: 25, stamina: 0 });
  assert.equal(rules.collect(fruit.id, 'player'), null);
  const bounded = new PickupRules({ ...combat.pickups, ttlSec: 100 }, () => 0.9);
  bounded.step(14, true, () => ({ x: 9, y: 5 })); bounded.step(14, true, () => ({ x: 9, y: 5 }));
  assert.equal(bounded.step(14, true, () => { throw Error('maxAlive 应在请求点前拦截'); }), null);
  assert.equal(bounded.snapshot.length, 2);
  assert.deepEqual(bounded.collect(bounded.snapshot[0]!.id, 'player'), { hp: 0, stamina: 30 });
  bounded.step(200, true, () => null); assert.equal(bounded.snapshot.length, 0);
});

test('生命周期手动暂停与后台暂停独立，恢复清输入/时间差，销毁后无回调', () => {
  const events: string[] = [];
  const lifecycle = new LifecycleRules({ clearInput: () => events.push('clear'), resetTime: () => events.push('reset'),
    setPaused: p => events.push(String(p)) });
  lifecycle.pause(true); lifecycle.visibility(true); lifecycle.visibility(false);
  assert.equal(events.at(-1), 'true');
  lifecycle.pause(false); assert.deepEqual(events.slice(-3), ['clear', 'reset', 'false']);
  lifecycle.dispose(); const count = events.length;
  lifecycle.visibility(false); lifecycle.pause(false); lifecycle.dispose(); assert.equal(events.length, count);
});

test('性能采样有界，完整累计时长与滑动分位数区分，30 次重开增长可见', () => {
  const d = new RuntimeDiagnostics(3);
  const base = { bodies: 27, joints: 20, listeners: 4, memoryBytes: null };
  for (const frameMs of [1000, 10, 20, 30]) d.sample({ ...base, frameMs });
  for (let i = 0; i < 31; i++) d.restart({ ...base, bodies: 27 + i });
  const r = d.report();
  assert.equal(r.totalSamples, 4); assert.equal(r.retainedSamples, 3);
  assert.equal(r.worstFrameMs, 1000); assert.equal(r.p95FrameMs, 30);
  assert.equal(r.observedDurationSec, 1.06);
  assert.equal(r.restartCountRetained, 30);
  assert.deepEqual(r.monotonicGrowth, { bodies: true, joints: false, listeners: false });
  assert.equal(r.acceptance, 'NOT_EVALUATED');
  assert.throws(() => d.sample({ ...base, frameMs: -1 }));
});

test('延迟出生敌人不得提前蓄势；预测瞄准在释放后飞行结束处接近移动目标', async () => {
  const { predictAim } = await import('../assets/scripts/domain/BattleRules.js');
  const enemy = new EnemyAttack(combat.enemies[0]!, combat.run, new AttackSlots(0.6), () => 0.5, 5);
  assert.deepEqual(enemy.step(4.99, life, () => 0.2), []);
  assert.equal(enemy.step(0.01, life, () => 0.2)[0]?.kind, 'telegraph');
  const angle = predictAim({ x: -14, y: 1 }, { x: 0.5, y: 0 }, 18, 9.8, 0.5)!;
  assert.ok(angle !== null);
  const t = (-14 + 0.5 * 0.5) / (18 * Math.cos(angle) - 0.5);
  assert.ok(Math.abs(18 * Math.sin(angle) * t - 9.8 * t * t / 2 - 1) < 1e-4);
  assert.equal(predictAim({ x: 100, y: 0 }, { x: 10, y: 0 }, 18, 9.8, 0.5), null);
});
