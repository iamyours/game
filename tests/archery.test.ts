import assert from 'node:assert/strict';
import test from 'node:test';
import { aimHintPoints, applyDrawStrength, armGeometry, solveArm, limitedJointMotorSpeed, postureMotorAuthority, bowReleaseFlex } from '../assets/scripts/domain/archery.js';
import { readRigDefinition } from '../assets/scripts/physics/RigDefinition.js';
import { readBootManifest } from '../assets/scripts/core/BootManifest.js';
import { loadSeedPack, renderGenerated } from '../tools/config/files.js';

async function setup() {
  const pack = await loadSeedPack(), generated = renderGenerated(pack);
  const manifest = readBootManifest(JSON.parse(generated.get('manifest.json')!));
  const rig = readRigDefinition(JSON.parse(generated.get('rig.json')!), manifest);
  return { rig, bow: pack.combat.bowControl };
}

test('成功放箭后弓臂越过中立位并衰减，轻拉回弹更小，结束后静止', () => {
  assert.equal(bowReleaseFlex(1, 0), 1);
  assert.ok(bowReleaseFlex(1, 0.06) < 0, '弓臂应先向前回弹而非缓慢缩回');
  assert.ok(Math.abs(bowReleaseFlex(0.35, 0.06)) < Math.abs(bowReleaseFlex(1, 0.06)));
  assert.ok(Math.abs(bowReleaseFlex(1, 0.24)) < 0.03);
  assert.equal(bowReleaseFlex(1, 0.35), 0);
  assert.equal(bowReleaseFlex(1, Infinity), 0);
});

test('方向提示仅覆盖离弦后 0.15 秒，不泄露整段落点；保留重力与力度差异', () => {
  const origin = { x: 4, y: 5 }, dt = 1 / 60;
  const full = aimHintPoints(origin, 0, 18, [0, -9.8], dt, 0.31);
  const light = aimHintPoints(origin, 0, 6.3, [0, -9.8], dt, 0.31);
  const last = full.at(-1)!;
  assert.ok(Math.abs(last.x - (4 + 0.31 + 18 * 0.15)) < 1e-9);
  assert.ok(Math.abs(last.y - (5 - 9.8 * 0.15 * (0.15 + dt) / 2)) < 1e-9);
  assert.ok(last.x < 8, '13–17 米交战距离不应被整条落点线揭示');
  assert.ok(light.at(-1)!.x < last.x);
  assert.ok(full.every(p => p.y < origin.y && Number.isFinite(p.x)));
});

test('双臂 IK 使用实际锚点，两个手在拉弦全程可达且肘保留弯曲', async () => {
  const { rig, bow } = await setup();
  const right = armGeometry(rig, 'right'), left = armGeometry(rig, 'left');
  for (const deg of [-15, 0, 18, 45, 75]) for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const angle = deg * Math.PI / 180, dx = Math.cos(angle), dy = Math.sin(angle);
    const rs = { x: right.shoulderAnchorM[0], y: right.shoulderAnchorM[1] };
    const ls = { x: left.shoulderAnchorM[0], y: left.shoulderAnchorM[1] };
    const hold = { x: rs.x + dx * bow.bowArmReachM, y: rs.y + dy * bow.bowArmReachM };
    const pull = { x: hold.x - dx * (bow.braceDepthM + bow.drawTravelM * progress),
      y: hold.y - dy * (bow.braceDepthM + bow.drawTravelM * progress) };
    for (const solution of [solveArm(right, rs, hold, 0), solveArm(left, ls, pull, 0)]) {
      assert.ok(solution.errorM < 1e-7, `${deg}° / ${progress}: ${solution.errorM}`);
      assert.ok(solution.elbowRad > 0 && solution.elbowRad < Math.PI);
    }
  }
});

test('世界 IK 随胸部旋转换算关节目标，不把世界角直接当肩角', async () => {
  const { rig } = await setup();
  const right = armGeometry(rig, 'right');
  for (const tilt of [-Math.PI / 2, -Math.PI / 6, 0, Math.PI / 6]) {
    const shoulder = { x: 3, y: 4 }, target = { x: 3.42, y: 4 };
    const solution = solveArm(right, shoulder, target, tilt);
    assert.ok(solution.errorM < 1e-7);
  }
});

test('不可达或重合目标限幅到合法肘肩，不翻支、不产生 NaN', async () => {
  const { rig } = await setup();
  for (const side of ['right', 'left'] as const) {
    const g = armGeometry(rig, side);
    for (const target of [{ x: 10, y: 10 }, { x: 0, y: 0 }, { x: -10, y: -5 }]) {
      const solution = solveArm(g, { x: 0, y: 0 }, target, 0);
      assert.ok(Object.values(solution.reached).every(Number.isFinite));
      assert.ok(Number.isFinite(solution.errorM));
      assert.ok(solution.shoulderRad >= g.shoulderLimitsRad[0] && solution.shoulderRad <= g.shoulderLimitsRad[1]);
      assert.ok(solution.elbowRad >= g.elbowLimitsRad[0] && solution.elbowRad <= g.elbowLimitsRad[1]);
    }
  }
});

test('轻拉/半拉/满弓的速度、局部冲量和伤害递增，满弓保留种子值且不修改原配置', () => {
  const seed = { speedMps: 20, impulseNs: 4, baseDamage: 24, id: 'normal' };
  const shots = [0, 0.5, 1].map(p => applyDrawStrength(seed, p, 0.35));
  assert.equal(shots[0]!.speedMps, 7);
  assert.deepEqual(shots[2], seed);
  for (const key of ['speedMps', 'impulseNs', 'baseDamage'] as const) {
    assert.ok(shots[0]![key] < shots[1]![key] && shots[1]![key] < shots[2]![key]);
  }
  assert.equal(seed.speedMps, 20);
  assert.deepEqual(applyDrawStrength(seed, 2, 0.35), seed);
  assert.deepEqual(applyDrawStrength(seed, NaN, 0.35), shots[0]);
});

test('手臂皮肤的中线端点与肩肘握点对齐，避免把竖直贴图错贴在斜向关节上', async () => {
  const { armVisualLayout } = await import('../assets/scripts/domain/archery.js');
  const { rig } = await setup();
  for (const part of rig.bodyDefinitions) {
    const layout = armVisualLayout(rig, part);
    if (!part.id.endsWith('UpperArm') && !part.id.endsWith('Forearm')) { assert.equal(layout, null); continue; }
    assert.ok(layout);
    for (const [sign, endpoint] of [[1, layout.proximal], [-1, layout.distal]] as const) {
      const x = layout.xM - Math.sin(layout.angleRad) * sign * layout.lengthM / 2;
      const y = layout.yM + Math.cos(layout.angleRad) * sign * layout.lengthM / 2;
      assert.ok(Math.hypot(x - endpoint[0], y - endpoint[1]) < 1e-9, part.id);
    }
    assert.ok(Math.abs(layout.angleRad) > 0.5, '回归：旧贴图直接使用零角，不沿连线');
    assert.ok(layout.heightM >= layout.lengthM);
  }
});

test('持弓手不再锁成约 90 度折臂，伸展后全瞄准范围两手仍可达', async () => {
  const { rig, bow } = await setup();
  const g = armGeometry(rig, 'right');
  const shoulder = { x: g.shoulderAnchorM[0], y: g.shoulderAnchorM[1] };
  const held = solveArm(g, shoulder, { x: shoulder.x + bow.bowArmReachM, y: shoulder.y }, 0);
  const bend = Math.abs(held.elbowRad + g.foreRestRad - g.upperRestRad) * 180 / Math.PI;
  assert.ok(bend < 45 && bend > 8, `持弓臂保留小弯曲而非直角：${bend}`);
});

test('肩关节跨限位间隙时走合法区间：150→-150 向负转，反向向正转', () => {
  assert.equal(limitedJointMotorSpeed(150, -150, [-160, 160], 360), -360);
  assert.equal(limitedJointMotorSpeed(-150, 150, [-160, 160], 360), 360);
  assert.equal(limitedJointMotorSpeed(160, -160, [-160, 160], 360), -360);
  assert.equal(limitedJointMotorSpeed(-160, 160, [-160, 160], 360), 360);
});

test('所有已配置铰链的驱动方向均指向合法目标，不绕整圈顶住限位', async () => {
  const { rig } = await setup();
  for (const joint of rig.jointDefinitions) {
    const [lo, hi] = joint.limitsDeg;
    for (const current of [lo, (lo + hi) / 2, hi]) for (const wanted of [lo - 30, lo, (lo + hi) / 2, hi, hi + 30]) {
      const target = Math.max(lo, Math.min(hi, wanted));
      const speed = limitedJointMotorSpeed(current, wanted, joint.limitsDeg, 135);
      assert.equal(Math.sign(speed), Math.sign(target - current), `${joint.id}: ${current}→${target}`);
      assert.ok(Math.abs(speed) <= 135);
      assert.equal(limitedJointMotorSpeed(current, wanted, joint.limitsDeg, 0), 0);
    }
  }
});

test('受限伺服数值规则跨 ±150° 能到达目标且不越界（非引擎物理验收）', () => {
  for (const [start, target] of [[150, -150], [-150, 150]]) {
    let current = start!;
    for (let i = 0; i < 240; i++) {
      current += limitedJointMotorSpeed(current, target!, [-160, 160], 360) / 60;
      assert.ok(current >= -160 && current <= 160);
    }
    assert.ok(Math.abs(current - target!) < 0.01);
  }
});

test('倒地仅保留双臂主动瞄准；死亡全部释放，站立/后仰保留控制', async () => {
  const { rig } = await setup();
  for (const joint of rig.jointDefinitions) {
    const arm = joint.id.endsWith('Shoulder') || joint.id.endsWith('Elbow');
    assert.equal(postureMotorAuthority(joint.id, 'downed', true), arm ? 0.8 : 0);
    for (const pose of ['standing', 'staggered', 'downed'] as const) assert.equal(postureMotorAuthority(joint.id, pose, false), 0);
    assert.equal(postureMotorAuthority(joint.id, 'standing', true), 1);
    assert.equal(postureMotorAuthority(joint.id, 'staggered', true), 1);
  }
});

test('拒绝非有限驱动值、倒置限位和负速度，防止向 Box2D 写入 NaN', () => {
  assert.throws(() => limitedJointMotorSpeed(NaN, 0, [-160, 160], 360));
  assert.throws(() => limitedJointMotorSpeed(0, Infinity, [-160, 160], 360));
  assert.throws(() => limitedJointMotorSpeed(0, 0, [10, -10], 360));
  assert.throws(() => limitedJointMotorSpeed(0, 0, [-10, 10], -1));
});
