import assert from 'node:assert/strict';
import test from 'node:test';
import { BowState, canRelease, FallDetector, platformAngularVelocity } from '../assets/scripts/domain/ArcadeRules.js';
import { EnemyAttack, AttackSlots, ShotBudget } from '../assets/scripts/domain/BattleRules.js';
import { ArcadeRecordRepository, type StoragePort } from '../assets/scripts/domain/SaveRepository.js';
import { InputRouter } from '../assets/scripts/input/InputRouter.js';
import { RuntimeDiagnostics } from '../assets/scripts/domain/RuntimeDiagnostics.js';
import { loadSeedPack } from '../tools/config/files.js';
const cfg = (await loadSeedPack()).combat;

test('活体持弓臂累计受创，重复命中不累加，失弓后死亡不生成第二把弓', () => {
  const b = new BowState(24);
  assert.equal(b.hit(1, 'chest', 50), false); assert.equal(b.trauma, 0);
  assert.equal(b.hit(2, 'rightForearm', 12), false);
  assert.equal(b.hit(2, 'rightForearm', 12), false); assert.equal(b.trauma, 12);
  assert.equal(b.hit(3, 'rightUpperArm', 12), true); assert.equal(b.armed, false);
  assert.equal(b.hit(4, 'rightForearm', 50), false); assert.equal(b.drop(), false);
  const dead = new BowState(24); assert.equal(dead.drop(), true); assert.equal(dead.drop(), false);
});

test('蓄势中失弓取消攻击，重新推进多个间隔也不补箭', () => {
  const attack = new EnemyAttack(cfg.enemies[0]!, cfg.run, new AttackSlots(0.6), () => 0.5);
  const live = { active: true, alive: true, armed: true, hpRatio: 1 };
  assert.equal(attack.step(1, live, () => 2.8)[0]?.kind, 'telegraph');
  assert.deepEqual(attack.step(0, { ...live, armed: false }, () => 2.8), []);
  for (let i = 0; i < 100; i++) assert.deepEqual(attack.step(0.1, live, () => 2.8), []);
  for (const key of ['alive', 'armed', 'handsReady', 'muzzleClear'] as const) {
    assert.equal(canRelease({ alive: true, armed: true, handsReady: true, muzzleClear: true, [key]: false }), false);
  }
  assert.equal(canRelease({ alive: true, armed: true, handsReady: true, muzzleClear: true }), true);
});

test('自然倒地过滤短促后仰、跨整圈角度及出生预热；倒地后不自动站起', () => {
  const f = new FallDetector();
  const step = (dt: number, deg: number, height = 0.35, ready = true) => f.step(dt, deg * Math.PI / 180, height, ready, 60, 0.12);
  assert.equal(step(1, 90, 0, false), false);
  assert.equal(step(0.1, 70), false); assert.equal(step(0.1, 20), false);
  assert.equal(step(0.1, 365), false);
  for (let i = 0; i < 8; i++) step(1 / 60, 80);
  assert.equal(f.downed, true); assert.equal(step(2, 0), true);
  f.reset(); assert.equal(step(0.13, 0, -0.1), true);
});

test('倾斜台通过角速度驱动，一周期无累计整圈漂移，峰值保持约定角度', () => {
  const amp = cfg.arcade.platformTiltDeg * Math.PI / 180, period = cfg.arcade.platformPeriodSec;
  const dt = 1 / 600; let angle = 0, peak = 0;
  for (let i = 0; i < period * 600; i++) {
    angle += platformAngularVelocity(i * dt, amp, period, 0) * dt;
    peak = Math.max(peak, Math.abs(angle));
  }
  assert.ok(Math.abs(angle) < 1e-8); assert.ok(Math.abs(peak - amp) < 0.0002);
});

class Memory implements StoragePort {
  values = new Map<string, string>(); fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
}
test('连续模式最高分幂等、设置持久化，失败保留内存；不覆写历史关卡存档', () => {
  const storage = new Memory(); storage.values.set('storm-archers.save', 'historical');
  const repo = new ArcadeRecordRepository(storage);
  repo.record(12); repo.record(4); repo.record(12); repo.setSound(false);
  assert.deepEqual(new ArcadeRecordRepository(storage).snapshot, { schemaVersion: 1, bestScore: 12, soundEnabled: false });
  storage.fail = true; assert.equal(repo.record(20).ok, false); assert.equal(repo.snapshot.bestScore, 20);
  storage.fail = false; assert.equal(repo.flush().ok, true);
  assert.equal(new ArcadeRecordRepository(storage).snapshot.bestScore, 20);
  assert.equal(storage.values.get('storm-archers.save'), 'historical');
  assert.throws(() => repo.record(NaN));
});

test('坏档先备份；未来版本、读取失败和备份冲突均不覆写原文', () => {
  const s = new Memory(); s.values.set('storm-archers.arcade', '{broken');
  new ArcadeRecordRepository(s).record(2);
  assert.equal(s.values.get('storm-archers.arcade.backup'), '{broken');
  s.values.set('storm-archers.arcade', '{another');
  assert.deepEqual(new ArcadeRecordRepository(s).record(3), { ok: false, reason: 'backup-failed' });
  assert.equal(s.values.get('storm-archers.arcade'), '{another');
  s.values.set('storm-archers.arcade', '{"schemaVersion":2}');
  assert.deepEqual(new ArcadeRecordRepository(s).record(40), { ok: false, reason: 'future-version' });
  assert.equal(s.values.get('storm-archers.arcade'), '{"schemaVersion":2}');
  const failed = new ArcadeRecordRepository({ getItem() { throw new Error('denied'); }, setItem() { assert.fail('must not overwrite unread data'); } });
  assert.deepEqual(failed.record(2), { ok: false, reason: 'read-failed' });
});

test('连续模式只有ShotBudget拥有冷却：受阻不消费、切箭不能缩短冷却、无自动补射', () => {
  const router = new InputRouter({ deadzoneDesign: 10, initialRad: 0.2, minRad: -0.2, maxRad: 1.2,
    firstShotDelaySec: 0.12, pullBackToAim: true, fullDrawDistanceDesign: 120 }, cfg.arrows, true);
  const budget = new ShotBudget(cfg.player), context = { active: true, alive: true, armed: true, launchClear: true };
  const normal = cfg.arrows[0]!, impact = cfg.arrows[1]!;
  assert.equal(budget.release(normal, { ...context, launchClear: false }), 'blocked');
  assert.equal(budget.stamina, 100); assert.equal(budget.cooldownSec, 0);
  assert.equal(budget.release(normal, context), null); assert.equal(budget.release(impact, context), 'cooldown');
  const layout = { aim: { left: 0, top: 0, right: 300, bottom: 300 }, arrowSwitch: { left: 400, top: 0, right: 500, bottom: 100 } };
  const pull = () => { router.press(1, { x: 150, y: 150 }, layout); for (let i = 0; i < 9; i++) router.step(1 / 60); router.release(1, { x: 50, y: 150 }, layout); return router.step(1 / 60); };
  assert.ok(pull()); assert.ok(pull()); // intent itself does not own an additional cooldown
  budget.step(0.55, false, true); assert.equal(budget.release(impact, context), null);
  for (let i = 0; i < 120; i++) assert.equal(router.step(1 / 60), null);
  budget.reset(); assert.equal(budget.stamina, 100); assert.equal(budget.cooldownSec, 0);
});

test('缺少监听计数时保持未知，不使用常量假装泄漏检测通过', () => {
  const d = new RuntimeDiagnostics();
  for (let i = 0; i < 30; i++) d.restart({ bodies: 30, joints: 20, listeners: null, memoryBytes: null });
  assert.equal(d.report().monotonicGrowth.listeners, null);
  assert.equal(d.report().acceptance, 'NOT_EVALUATED');
});

test('敌人骨架在米制配置镜像，关节锚点/限位及握点一致，左右射击两手均可达', async () => {
  const { variantRig } = await import('../assets/scripts/physics/RigDefinition.js');
  const { armGeometry, solveArm } = await import('../assets/scripts/domain/archery.js');
  const pack = await loadSeedPack(), base = pack.rig;
  const rig = variantRig(base, cfg.arcade.heavyMassMultiplier, -1);
  assert.equal(rig.massKg, base.massKg * cfg.arcade.heavyMassMultiplier);
  for (const [i, b] of rig.bodyDefinitions.entries()) {
    assert.equal(b.positionM[0], -base.bodyDefinitions[i]!.positionM[0]);
    assert.equal(b.massKg, base.bodyDefinitions[i]!.massKg * cfg.arcade.heavyMassMultiplier);
  }
  for (const [i, j] of rig.jointDefinitions.entries()) {
    const before = base.jointDefinitions[i]!;
    assert.deepEqual(j.limitsDeg, [-before.limitsDeg[1], -before.limitsDeg[0]]);
    for (const side of ['parent', 'child'] as const) {
      const anchor = j[`${side}AnchorM`], original = before[`${side}AnchorM`];
      assert.equal(anchor[0], -original[0]); assert.equal(anchor[1], original[1]);
    }
  }
  for (let deg = 130; deg <= 205; deg += 5) for (const draw of [0, 0.5, 1]) {
    const a = deg * Math.PI / 180, right = armGeometry(rig, 'right'), left = armGeometry(rig, 'left');
    const shoulder = { x: right.shoulderAnchorM[0], y: right.shoulderAnchorM[1] };
    const hold = solveArm(right, shoulder, { x: shoulder.x + Math.cos(a) * cfg.bowControl.bowArmReachM,
      y: shoulder.y + Math.sin(a) * cfg.bowControl.bowArmReachM }, 0);
    const depth = cfg.bowControl.braceDepthM + cfg.bowControl.drawTravelM * draw;
    const string = { x: hold.reached.x - Math.cos(a) * depth, y: hold.reached.y - Math.sin(a) * depth };
    const pull = solveArm(left, { x: left.shoulderAnchorM[0], y: left.shoulderAnchorM[1] }, string, 0);
    assert.ok(hold.errorM < 1e-8, `bow ${deg}/${draw}`); assert.ok(pull.errorM < 1e-8, `string ${deg}/${draw}`);
  }
  assert.equal(base.bodyDefinitions[0]!.massKg * cfg.arcade.heavyMassMultiplier, rig.bodyDefinitions[0]!.massKg);
  assert.throws(() => variantRig(base, NaN));
});
