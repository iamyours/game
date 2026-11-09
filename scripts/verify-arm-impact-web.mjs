import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
const out = resolve(process.env.ARM_IMPACT_EVIDENCE_DIR || 'evidence/arm-impact/runtime');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const report = { passed: false, time: new Date().toISOString(), scope: 'Real Box2D: skin endpoints and isolated same-point hit response. Injects after-step hit snapshots; does NOT verify projectile collision, AC04 or G1.', errors: [], cases: [] };
page.on('pageerror', e => report.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
try {
  await page.goto(process.env.T004_URL || 'http://127.0.0.1:7458/?practice=1');
  await page.waitForFunction(() => Boolean(window.System));
  await page.waitForFunction(async () => {
    const cc = await System.import('cc');
    const lab = cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
    if (!lab || lab.snapshot().stepId < 180 || !lab.ragdolls.every(r => r.bodyNodes.get('head').getChildByName('Skin_head'))) return false;
    window.armImpact = { lab, cc }; return true;
  }, null, { timeout: 30000 });
  report.runtime = await page.evaluate(() => ({ version: window.armImpact.cc.VERSION,
    backend: window.armImpact.cc.PhysicsSystem2D.instance.physicsWorld.constructor.name,
    seedHash: window.armImpact.lab.snapshot().seedHash }));
  assert.equal(report.runtime.version, '3.8.8');
  assert.equal(report.runtime.backend, 'b2PhysicsWorld');
  for (const part of ['head', 'chest', 'rightForearm', 'leftShin']) {
    for (const arrowId of ['normal', 'impact', 'piercing']) {
      const result = await page.evaluate(({ part, arrowId }) => {
        const { lab, cc } = window.armImpact;
        const step = () => lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
        cc.director.pause();
        lab.resetRagdolls(); step();
        for (let i = 0; i < 180; i++) step();
        const actor = lab.ragdolls[1], body = actor.bodies.get(part);
        const p = body.getWorldPoint(new cc.Vec2(0, 3.2), new cc.Vec2());
        const before = { x: body.linearVelocity.x, y: body.linearVelocity.y };
        const momentum = () => [...actor.bodies.values()].reduce((sum, b) => sum + b.getMass() * b.linearVelocity.x, 0);
        const beforeMomentum = momentum();
        const arrow = lab.config.arrows.find(a => a.id === arrowId);
        lab.hitResolver.resolve({ shotId: 100000 + lab.physics.steps, stepId: lab.physics.steps, attackerId: 'PlayerRagdoll',
          targetId: actor.id, partId: part, pointM: { x: p.x / 32, y: p.y / 32 }, normal: { x: -1, y: 0 },
          incomingVelocityMps: { x: arrow.speedMps, y: 0 }, arrow, source: 'sweep', fraction: 0.5 }, body);
        const after = { x: body.linearVelocity.x, y: body.linearVelocity.y };
        const deltaMomentum = momentum() - beforeMomentum;
        const hit = lab.snapshot().combat.find(a => a.id === actor.id).lastHit;
        const samples = [];
        for (let i = 0; i < 60; i++) {
          step();
          if ([0, 5, 14, 29, 59].includes(i)) samples.push({ step: i + 1, pose: lab.enemyAim.poseSnapshot,
            positions: actor.snapshot().positionsM, finite: actor.snapshot().finite, anchorErrorM: actor.snapshot().maxJointErrorM });
        }
        return { part, arrowId, deltaMomentum, mass: body.getMass(), deltaVx: after.x - before.x, hit, samples };
      }, { part, arrowId });
      assert.ok(Math.abs(result.deltaMomentum - result.hit.impulseNs) < 1e-4, '全身即时动量增量等于唯一冲量预算，不重复施力');
      assert.ok(Math.abs(result.deltaVx * result.mass - result.hit.localImpulseNs) < 1e-4, '命中部位只收到分配的局部冲量');
      assert.ok(result.samples.every(s => s.finite && s.anchorErrorM < 0.02));
      report.cases.push(result);
    }
    const cases = report.cases.filter(c => c.part === part);
    const normal = cases.find(c => c.arrowId === 'normal'), impact = cases.find(c => c.arrowId === 'impact'), piercing = cases.find(c => c.arrowId === 'piercing');
    assert.ok(impact.deltaMomentum > normal.deltaMomentum && normal.deltaMomentum > piercing.deltaMomentum);
    assert.ok(impact.hit.jointReaction[0].weight < normal.hit.jointReaction[0].weight);
  }
  report.skins = await page.evaluate(() => {
    const { lab, cc } = window.armImpact;
    const errors = [];
    for (const actor of lab.ragdolls) for (const side of ['left', 'right']) {
      const shoulder = lab.config.rig.jointDefinitions.find(j => j.id === side + 'Shoulder');
      const elbow = lab.config.rig.jointDefinitions.find(j => j.id === side + 'Elbow');
      for (const suffix of ['UpperArm', 'Forearm']) {
        const node = actor.bodyNodes.get(side + suffix), skin = node.getChildByName('Skin_' + side + suffix);
        const a = suffix === 'UpperArm' ? shoulder.childAnchorM : elbow.childAnchorM;
        const b = suffix === 'UpperArm' ? elbow.parentAnchorM : [side === 'right' ? 0.12 : -0.12, -0.07];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const q = skin.rotation;
        const angle = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
        for (const [sign, end] of [[1, a], [-1, b]]) {
          const y = sign * length * 16;
          const xM = (skin.position.x - Math.sin(angle) * y) / 32;
          const yM = (skin.position.y + Math.cos(angle) * y) / 32;
          errors.push(Math.hypot(xM - end[0], yM - end[1]));
        }
      }
    }
    return { maxLocalEndpointErrorM: Math.max(...errors) };
  });
  assert.ok(report.skins.maxLocalEndpointErrorM < 1e-5);
  report.death = await page.evaluate(() => {
    const { lab } = window.armImpact;
    lab.resetRagdolls(); lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
    const actor = lab.ragdolls[1], body = actor.bodies.get('chest');
    lab.combatStates.get(actor.id).hp = 1;
    lab.hitResolver.resolve({ shotId: 999999, stepId: lab.physics.steps, attackerId: 'PlayerRagdoll', targetId: actor.id,
      partId: 'chest', pointM: { x: body.node.worldPosition.x / 32, y: body.node.worldPosition.y / 32 },
      normal: { x: -1, y: 0 }, incomingVelocityMps: { x: 18, y: 0 }, arrow: lab.config.arrows[0], source: 'sweep', fraction: 0.5 }, body);
    for (let i = 0; i < 120; i++) lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
    return { alive: lab.enemyAim.poseSnapshot.alive, motors: [...actor.joints.values()].map(j => j.maxMotorTorque) };
  });
  assert.equal(report.death.alive, false); assert.ok(report.death.motors.every(t => t === 0));
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, scope: report.scope, cases: report.cases.length }));
