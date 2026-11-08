import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
const out = process.env.T004_EVIDENCE_DIR || fileURLToPath(new URL('../evidence/T006/practice/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const report = { passed: false, date: process.env.EVIDENCE_DATE || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }), browser: browser.version(), mode: 'desktop Chrome WebGL; Playwright mouse; release-to-fire; fixed clock paused only while staging precision drags; no product playtest', errors: [], checks: {} };
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
page.on('requestfailed', request => report.errors.push(`${request.url()} ${request.failure()?.errorText}`));
const get = () => page.evaluate(() => window.practiceLab.snapshot());
const wait = async (predicate, label) => {
  for (let i = 0; i < 260; i++) { const s = await get(); if (predicate(s)) return s; await page.waitForTimeout(35); }
  throw new Error(`未观察到 ${label}: ${JSON.stringify(await get())}`);
};
const actor = s => s.combat.find(value => value.id === 'EnemyRagdoll');
const center = (s, r) => [(r.left + r.right) / 2 * 1440 / s.width, (r.top + r.bottom) / 2 * 810 / s.height];
try {
  await page.goto(process.env.T004_URL || 'http://127.0.0.1:7458/?practice=1');
  await page.waitForFunction(() => Boolean(window.System));
  report.runtime = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const until = performance.now() + 20000;
    while (performance.now() < until) {
      const scene = cc.director.getScene();
      const lab = scene?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
      if (lab) { window.practiceLab = lab; window.practiceWorld = cc.PhysicsSystem2D.instance.physicsWorld._world; return { scene: scene.name, version: cc.VERSION, backend: cc.PhysicsSystem2D.instance.physicsWorld.constructor.name }; }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('未启动 PhysicsLab');
  });
  assert.deepEqual(report.runtime, { scene: 'Boot', version: '3.8.8', backend: 'b2PhysicsWorld' });
  const base = await wait(s => s.calibration?.passed && s.stepId >= 80, '标定');
  report.seedHash = base.seedHash;
  const blocked = await page.evaluate(() => {
    const lab = window.practiceLab;
    const chest = lab.ragdolls[0].snapshot().positionsM.chest;
    return lab.projectiles.fire('PlayerRagdoll', { ...chest, angleRad: 0 }, lab.config.arrows[0]);
  });
  assert.equal(blocked, null, '不能从躯干内部发箭');
  report.checks.muzzleInsideChestCancelled = true;
  const [x, y] = center(base, base.layout.aim);
  const tapReset = async () => {
    const s = await get();
    await page.mouse.click(...center(s, s.resetRect));
    return wait(v => v.rig.resetCount === s.rig.resetCount + 1, '重置');
  };
  const bodyCount = () => page.evaluate(() => window.practiceWorld.GetBodyCount());
  const baselineBodies = await bodyCount();
  report.checks.box2d = { baselineBodies, flyingBodies: [], afterResetBodies: [] };
  // Two shots in separate rounds verify reuse after reset; use the real pointer path for aim/fire/reset.
  for (let i = 0; i < 2; i++) {
    const s = await wait(v => v.stepId > base.stepId + 45, '稳定');
    const launch = s.pose.bowSocket;
    const target = s.rig.ragdolls[1].positionsM.chest;
    const dx = target.x - launch.x - 0.30;
    const dy = target.y - launch.y + 4.9 * (dx / 18) ** 2;
    const angle = Math.atan2(dy, dx) + 0.015;
    // Freeze only the harness clock while Playwright sends separate OS mouse events.
    // Otherwise a slow host can advance the first-shot timer between pointer-down and move.
    await page.evaluate(() => window.practiceLab.physics.setPaused(true));
    await page.mouse.move(x, y);
    await page.mouse.down();
    const drag = i === 0 ? 160 : -160; // Forward aim and backward bow pull hit the same target.
    await page.mouse.move(x + drag, y - drag * Math.tan(angle));
    assert.ok(Math.abs((await get()).aimDeg - angle * 180 / Math.PI) < 0.6);
    await page.evaluate(() => window.practiceLab.physics.setPaused(false));
    const held = await wait(v => v.drawProgress === 1 && v.pose.player.drawAmount > 0.95 && v.pose.hands.ready, '双手拉满');
    assert.equal(held.shots, 0, '未松手不得射箭');
    await page.mouse.up();
    const flight = await wait(v => v.shots === 1 && v.projectiles === 1, '松手单箭飞行');
    const bodiesInFlight = await bodyCount();
    assert.equal(bodiesInFlight, baselineBodies + 1, '复用后 Box2D 只有一个额外箭体');
    report.checks.box2d.flyingBodies.push(bodiesInFlight);
    const hit = await wait(v => actor(v).hits === 1, '部位命中');
    const event = actor(hit).lastHit;
    assert.equal(actor(hit).hp, 60 - event.result.hpDamage);
    assert.equal(hit.projectiles, 0);
    assert.equal(hit.embedded, 1);
    assert.ok(event.stepId - flight.lastShot.stepId >= 35, '命中不能瞬移');
    const settled = await wait(v => v.stepId >= event.stepId + 38, '去重观察');
    assert.equal(settled.shots, 1);
    assert.equal(actor(settled).hits, 1);
    report.checks[`round${i + 1}`] = { gesture: i === 0 ? 'forward' : 'pull-back', launchStep: flight.lastShot.stepId, approximateDistanceM: event.pointM.x - launch.x, targetHp: actor(hit).hp, event };
    if (!i) await page.screenshot({ path: `${out}/physicslab.png` });
    const reset = await tapReset();
    assert.equal(actor(reset).hp, 60);
    assert.equal(reset.shots + reset.projectiles + reset.embedded, 0);
    const stable = await wait(v => v.stepId >= reset.stepId + 95, '重置后稳定');
    const chest = stable.rig.ragdolls[1].positionsM.chest;
    assert.ok(Math.abs(chest.x - 18) < 0.5 && chest.y > 4.35, '重置后靶手应仍站在台上');
    const bodiesAfterReset = await bodyCount();
    // Cocos keeps the pooled b2Body registered but disables it when its node is inactive.
    assert.equal(bodiesAfterReset, baselineBodies + 1);
    report.checks.box2d.afterResetBodies.push(bodiesAfterReset);
  }
  const reset = await get();
  await page.mouse.click(...center(reset, reset.layout.arrowSwitch));
  assert.equal((await get()).arrow, 'impact');
  await page.mouse.click(...center(reset, reset.layout.arrowSwitch));
  assert.equal((await get()).arrow, 'piercing');
  report.checks.mouseSwitch = ['normal', 'impact', 'piercing'];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y - 32);
  const drawing = await wait(v => v.drawProgress === 1 && v.pose.player.drawAmount > 0.95 && v.pose.hands.ready, '再次拉满');
  report.checks.redrawProgress = drawing.drawProgress;
  await page.screenshot({ path: `${out}/bow-draw.png` });
  const held = await wait(v => v.stepId >= drawing.stepId + 120, '按住两秒不放');
  assert.equal(held.shots, 0, '拉满一直按住不能自动发射');
  await page.mouse.up();
  const released = await wait(v => v.shots === 1, '松手单发');
  assert.equal(released.drawProgress, 0);
  const quiet = await wait(v => v.stepId >= released.stepId + 95, '松手后无第二箭');
  assert.equal(quiet.shots, 1);
  report.checks.releaseSingleShot = { heldSteps: held.stepId - drawing.stepId, fired: released.shots, extraShots: quiet.shots - released.shots };
  await page.mouse.click(...center(quiet, quiet.pauseRect));
  assert.equal((await get()).paused, true);
  const pausedReset = await tapReset();
  assert.equal(pausedReset.paused, false);
  assert.equal(pausedReset.shots + pausedReset.projectiles + pausedReset.embedded, 0);
  report.checks.resetFromPause = true;
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${out}/web-verification.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
