import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
const releaseOnly = process.argv.includes('--release-only');
const out = resolve(process.env.T004_POSE_EVIDENCE_DIR || 'evidence/T004/two-hand/runtime');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const report = { passed: false, scope: releaseOnly ? 'release input + two-hand coordination + native rotation regression; excludes AC04 three-pose acceptance' : 'T004 three-pose acceptance', timestamp: new Date().toISOString(), mode: 'desktop WebGL / real Box2D / pointer gestures; no transform writes', browser: browser.version(), errors: [], cases: {} };
page.on('pageerror', e => report.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
const get = () => page.evaluate(() => {
  const lab = window.poseLab, s = lab.snapshot();
  return { ...s, chestAngleDeg: lab.ragdolls[0].worldAngleDeg('chest'),
    nativeElbows: Object.fromEntries(['leftElbow', 'rightElbow'].map(id => [id,
      lab.ragdolls[0].joints.get(id).impl.impl.GetJointAngle() * 180 / Math.PI])),
    elbows: { left: lab.ragdolls[0].relativeAngleDeg('leftElbow'), right: lab.ragdolls[0].relativeAngleDeg('rightElbow') } };
});
const wait = async (fn, label, ms = 18000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const s = await get(); if (fn(s)) return s; await page.waitForTimeout(30); }
  throw Error(`${label}: ${JSON.stringify(await get())}`);
};
const center = (s, r) => [(r.left + r.right) / 2 * 1440 / s.width, (r.top + r.bottom) / 2 * 810 / s.height];
const hold = async (angleDeg = 18) => {
  const s = await get(), [x, y] = center(s, s.layout.aim);
  await page.evaluate(() => window.poseLab.physics.setPaused(true));
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 140, y - 140 * Math.tan(angleDeg * Math.PI / 180));
  await page.evaluate(() => window.poseLab.physics.setPaused(false));
};
const reset = async () => {
  const s = await get();
  await page.mouse.up(); await page.mouse.click(...center(s, s.resetRect));
  const r = await wait(v => v.rig.resetCount === s.rig.resetCount + 1, 'reset');
  return wait(v => v.stepId >= r.stepId + 140 && v.pose.hands.ready, 'settle after reset');
};
try {
  await page.goto(process.env.T004_URL || 'http://127.0.0.1:7458/');
  await page.waitForFunction(() => Boolean(window.System));
  report.runtime = await page.evaluate(async () => {
    const cc = await System.import('cc'), end = performance.now() + 20000;
    while (performance.now() < end) {
      const lab = cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
      if (lab) { window.poseLab = lab; return { version: cc.VERSION, world: cc.PhysicsSystem2D.instance.physicsWorld.constructor.name }; }
      await new Promise(r => setTimeout(r, 30));
    }
    throw Error('PhysicsLab did not boot');
  });
  const initial = await wait(s => s.calibration?.passed && s.stepId >= 180 && s.pose.hands.ready, 'initial hands ready');
  report.seedHash = initial.seedHash;
  await hold();
  const observations = [initial];
  const start = await get();
  while ((await get()).stepId < start.stepId + 230) { observations.push(await get()); await page.waitForTimeout(20); }
  const drawing = observations.map(s => {
    const h = s.pose.hands, a = s.aimDeg * Math.PI / 180;
    return { stepId: s.stepId, shots: s.shots, drawAmount: s.pose.player.drawAmount,
      pullDepthM: (h.bowGrip.x - h.stringGrip.x) * Math.cos(a) + (h.bowGrip.y - h.stringGrip.y) * Math.sin(a),
      bowErrorM: h.bowErrorM, stringErrorM: h.stringErrorM, elbows: s.elbows, nativeElbows: s.nativeElbows };
  });
  report.cases.coordination = { samples: drawing, shots: observations.at(-1).shots,
    pullTravelM: Math.max(...drawing.map(s => s.pullDepthM)) - Math.min(...drawing.map(s => s.pullDepthM)),
    lastRelease: observations.at(-1).lastShot };
  assert.equal(report.cases.coordination.shots, 0, '按住超过多个冷却周期也绝不能自动射箭');
  assert.ok(report.cases.coordination.pullTravelM > 0.07, '实际拉弦手应可观察地前后移动');
  assert.ok(drawing.every(s => Object.values(s.nativeElbows).every(a => a >= -2.5 && a <= 152.5)), '双肘应保持真实原生铰链限位，不能只在画面上看似配合');
  assert.ok(Math.max(...drawing.map(s => s.stringErrorM)) < 0.2, '弓弦手须持续靠近目标，不得大幅甩动');
  assert.ok(drawing.every(s => Number.isFinite(s.pullDepthM) && s.bowErrorM < 0.18), '持弓手保持目标而非随弦一起后拉');
  await wait(s => s.pose.player.drawAmount > 0.95 && s.pose.hands.ready, 'full draw snapshot');
  await page.screenshot({ path: `${out}/two-hand-draw.png` });
  await page.mouse.up();
  const released = await wait(s => s.shots === start.shots + 1, '松手单发');
  const quiet = await wait(s => s.stepId > released.stepId + 50, 'release settle');
  assert.equal(quiet.shots, released.shots);
  assert.equal(quiet.pose.player.drawAmount, 0);
  report.cases.release = { shots: quiet.shots, drawAmount: quiet.pose.player.drawAmount, hands: quiet.pose.hands };

  for (const pose of (releaseOnly ? [] : ['standing', 'staggered', 'downed'])) {
    await reset();
    if (pose !== 'standing') {
      const s = await get(), button = s.poseButtons.find(b => b.pose === pose);
      await page.mouse.click(...center(s, button.rect));
      await wait(v => v.pose.player.pose === pose, `${pose} requested`);
      if (pose === 'downed') {
        await wait(v => Math.abs(v.chestAngleDeg) > 50, 'native physical fall');
        const passive = await page.evaluate(() => {
          const lab = window.poseLab;
          return { weights: lab.snapshot().pose.player.jointControlWeights,
            motorTorques: Object.fromEntries([...lab.ragdolls[0].joints].map(([id, joint]) => [id, joint.maxMotorTorque])) };
        });
        for (const joint of ['neck', 'waist', 'leftHip', 'leftKnee', 'rightHip', 'rightKnee']) {
          assert.equal(passive.weights[joint], 0, `${joint}: 倒地不应主动维持躯干/腿部姿态`);
          assert.equal(passive.motorTorques[joint], 0, `${joint}: 实际组件扭矩应归零`);
        }
        assert.ok(passive.weights.rightShoulder > 0 && passive.weights.leftShoulder > 0, '存活倒地保留双臂驱动');
        report.cases.downedPassiveBody = passive;
      }
      else await wait(v => Math.abs(v.chestAngleDeg) > 8, 'native stagger');
    }
    const before = await get();
    await hold(30);
    await wait(s => s.pose.player.drawAmount > 0.95 && s.pose.hands.ready, `${pose} hands at full draw`);
    assert.equal((await get()).shots, before.shots);
    await page.mouse.up();
    const fired = await wait(s => s.shots === before.shots + 1, `${pose} release shoot`, 24000);
    report.cases[pose] = { chestAngleDeg: fired.chestAngleDeg, chest: fired.rig.ragdolls[0].positionsM.chest,
      hp: fired.combat[0].hp, lastShot: fired.lastShot, hands: fired.pose.hands };
    assert.ok(fired.combat[0].hp > 0);
    assert.ok(Math.abs(fired.lastShot.socket.angleRad - Math.PI / 6) < 0.01);
    const h = fired.lastShot.hands, socket = fired.lastShot.socket;
    assert.ok(Math.hypot(h.bowGrip.x - socket.x, h.bowGrip.y - socket.y) < 1e-6);
    if (pose === 'downed') assert.ok(Math.abs(fired.chestAngleDeg) > 50, '不能先自动站起来才算倒地射击');
    await page.screenshot({ path: `${out}/${pose}.png` });
  }
  await reset();
  await hold();
  await wait(s => s.drawProgress === 1 && s.pose.hands.ready, 'cancel at full draw');
  const cancelled = await get();
  await page.evaluate(() => window.poseLab.cancel());
  await page.mouse.up();
  const cancelSettled = await wait(s => s.stepId > cancelled.stepId + 90, 'cancel settle');
  assert.equal(cancelSettled.shots, cancelled.shots);
  report.cases.cancelNeverFires = true;
  report.cases.strength = [];
  for (const strength of [0.2, 0.6, 1]) {
    const idle = await reset(), [x, y] = center(idle, idle.layout.aim);
    const travel = (10 + 110 * strength) * 1440 / idle.width;
    const angle = 18 * Math.PI / 180;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x - travel * Math.cos(angle), y + travel * Math.sin(angle));
    const held = await wait(s => s.stepId >= idle.stepId + 80 && Math.abs(s.drawProgress - strength) < 0.001 &&
      Math.abs(s.pose.player.drawAmount - strength) < 0.001 && s.pose.hands.ready, 'spatial draw strength');
    assert.equal(held.shots, 0, '任何力度一直按住均不应发射');
    await page.screenshot({ path: `${out}/strength-${strength}.png` });
    await page.mouse.up();
    const fired = await wait(s => s.shots === 1, 'strength release');
    const physical = await page.evaluate(() => {
      const flight = [...window.poseLab.projectiles.flying.values()][0];
      return flight ? { vx: flight.slot.body.linearVelocity.x, vy: flight.slot.body.linearVelocity.y,
        speedMps: flight.arrow.speedMps, baseDamage: flight.arrow.baseDamage, impulseNs: flight.arrow.impulseNs } : null;
    });
    assert.ok(physical, '应观察到真实飞行刚体');
    assert.ok(Math.abs(physical.vx / Math.cos(fired.lastShot.aimRad) - fired.lastShot.speedMps) < 0.01);
    assert.ok(Math.abs(fired.lastShot.strength - strength) < 0.001);
    report.cases.strength.push({ strength, actualDraw: held.pose.player.drawAmount, shot: fired.lastShot, physical });
  }
  for (let i = 1; i < report.cases.strength.length; i++) {
    const a = report.cases.strength[i - 1].physical, b = report.cases.strength[i].physical;
    for (const key of ['vx', 'speedMps', 'baseDamage', 'impulseNs']) assert.ok(b[key] > a[key], `${key} must grow with draw`);
  }
  report.cases.insideChestBlocked = await page.evaluate(() => {
    const lab = window.poseLab, p = lab.ragdolls[0].snapshot().positionsM.chest;
    return lab.projectiles.fire('PlayerRagdoll', { ...p, angleRad: 0 }, lab.config.arrows[0]) === null;
  });
  assert.equal(report.cases.insideChestBlocked, true);
  report.cases.nativeMultiTurn = await page.evaluate(async () => {
    const cc = await System.import('cc'), lab = window.poseLab, body = lab.probe.glide;
    cc.director.pause();
    const startAngle = body.impl.impl.GetAngle(), startStep = lab.snapshot().stepId;
    body.angularVelocity = 2;
    try {
      for (let i = 0; i < 120; i++) lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
      const nativeAngle = body.impl.impl.GetAngle(), q = body.node.worldRotation;
      const publishedAngle = Math.atan2(2 * q.w * q.z, 1 - 2 * q.z * q.z);
      return { steps: lab.snapshot().stepId - startStep, nativeDeltaRad: nativeAngle - startAngle,
        nativeAngle, publishedAngle, angularVelocity: body.angularVelocity,
        publicationErrorRad: Math.atan2(Math.sin(nativeAngle - publishedAngle), Math.cos(nativeAngle - publishedAngle)) };
    } finally { body.angularVelocity = 0; cc.director.resume(); }
  });
  assert.equal(report.cases.nativeMultiTurn.steps, 120);
  assert.ok(Math.abs(report.cases.nativeMultiTurn.nativeDeltaRad - 4) < 0.001, '发布节点不得把超过 180 度的原生角反写折返');
  assert.ok(Math.abs(report.cases.nativeMultiTurn.publicationErrorRad) < 1e-5);
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (e) {
  report.failure = String(e);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await writeFile(`${out}/web-verification.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
