import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.PROJECTILE_PRESENTATION_EVIDENCE_DIR || 'evidence/visual-polish-20261113/runtime';
await mkdir(out, { recursive: true });
const report = { status: 'BLOCKED', passed: false,
  scope: 'Real Creator/Box2D projectile flight, physical terrain impacts, residue expiry and landscape layout. Direct fire bypasses gestures; not G1.', errors: [], cases: {} };
const save = () => writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2) + '\n');
if (!process.env.PRESENTATION_URL && !existsSync('build/web-desktop/index.html')) {
  report.reason = 'Current Creator Web build missing'; await save(); console.error(report.reason); process.exit(2);
}
let browser;
try {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.on('pageerror', e => report.errors.push(e.stack || String(e)));
  await page.goto(process.env.PRESENTATION_URL || 'http://127.0.0.1:7458/?practice=1');
  await page.waitForFunction(() => Boolean(window.System));
  await page.evaluate(async () => {
    const cc = await System.import('cc'), end = performance.now() + 30000;
    while (performance.now() < end) {
      const lab = cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
      if (lab?.snapshot().stepId > 180) { window.presentationLab = { cc, lab }; return; }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error('PhysicsLab not ready');
  });
  report.cases.projectiles = await page.evaluate(() => {
    const { cc, lab } = window.presentationLab;
    cc.director.pause(); lab.projectiles.clear();
    const step = () => lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
    const node = new cc.Node('ResidueTestPlatform'); node.layer = lab.aim.node.layer; node.parent = lab.aim.node.parent;
    node.setWorldPosition(8 * 32, 3 * 32, 0);
    const body = node.addComponent(cc.RigidBody2D); body.type = cc.ERigidBody2DType.Static; body.group = lab.config.rig.collisionGroups.platform;
    const collider = node.addComponent(cc.BoxCollider2D); collider.group = body.group; collider.size.set(3 * 32, 0.4 * 32); collider.apply();
    const arrow = lab.config.arrows[0];
    const shotId = lab.projectiles.fire('PlayerRagdoll', { x: 8, y: 7, angleRad: 0 }, arrow);
    const shot = lab.projectiles.flying.get(shotId), start = { ...shot.slot.body.linearVelocity };
    for (let i = 0; i < 6; i++) step();
    const velocity = { ...shot.slot.body.linearVelocity }, angle = shot.angle;
    lab.projectiles.clear();
    const counts = [];
    for (let i = 0; i < 15; i++) {
      const id = lab.projectiles.fire('PlayerRagdoll', { x: 8, y: 5, angleRad: -Math.PI / 2 }, arrow);
      if (id === null) throw Error('Real terrain shot rejected');
      for (let j = 0; j < 30; j++) step();
      counts.push({ flying: lab.projectiles.count, embedded: lab.projectiles.embeddedCount, pool: lab.projectiles.poolSize });
    }
    const beforePause = lab.projectiles.embeddedCount;
    lab.physics.setPaused(true); for (let i = 0; i < 180; i++) step();
    const afterPause = lab.projectiles.embeddedCount;
    lab.physics.setPaused(false); step();
    for (let i = 0; i < 180; i++) step();
    const expired = lab.projectiles.embeddedCount;
    lab.projectiles.clear(); node.active = false; node.destroy(); cc.director.resume();
    return { start, velocity, angle, counts, beforePause, afterPause, expired, clear: lab.projectiles.embeddedCount };
  });
  const p = report.cases.projectiles;
  assert.ok(Math.abs(p.velocity.x - p.start.x) < 0.01);
  assert.ok(Math.abs(p.velocity.y - (p.start.y - 0.98)) < 0.03, 'Actual pooled projectile retains -9.8m/s² gravity');
  assert.ok(p.angle < 0, 'Arrow nose turns down with native velocity');
  assert.ok(p.counts.every(c => c.embedded >= 1 && c.embedded <= 2 && c.flying === 0), 'Real platform hits retain at most two arrows');
  assert.ok(p.counts.every(c => c.pool <= 2), 'Repeated physical shots reuse pool slots');
  assert.equal(p.afterPause, p.beforePause); assert.equal(p.expired, 0); assert.equal(p.clear, 0);

  await page.goto((process.env.PRESENTATION_URL || 'http://127.0.0.1:7458/?practice=1').replace('?practice=1', ''));
  report.cases.layouts = [];
  for (const [width, height] of [[1440, 810], [844, 390], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    const end = Date.now() + 20000; let s;
    while (Date.now() < end) {
      s = await page.evaluate(async () => {
        if (!window.System) return null;
        const cc = await System.import('cc'), lab = cc.director.getScene()?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
        return lab?.snapshot() ?? null;
      });
      if (s?.arcade?.enemyId && Math.abs(s.width / s.height - width / height) < 0.01) break;
      await page.waitForTimeout(30);
    }
    assert.ok(s?.arcade?.enemyId);
    for (const r of [s.pauseRect, s.resetRect, s.soundRect, s.layout.arrowSwitch, ...(s.fullscreenAvailable ? [s.fullscreenRect] : [])]) {
      assert.ok(r.left >= s.safe.left && r.right <= s.safe.right && r.top >= s.safe.top && r.bottom <= s.safe.bottom);
      assert.ok((r.right - r.left) * width / s.width >= 47.9 && (r.bottom - r.top) * height / s.height >= 47.9);
    }
    const canvas = await page.locator('#GameCanvas').boundingBox();
    assert.ok(canvas && Math.abs(canvas.width - width) < 2 && Math.abs(canvas.height - height) < 2);
    assert.ok(s.battleBounds.left <= 1 && s.battleBounds.right >= 22 && s.battleBounds.top >= 9.3);
    await page.screenshot({ path: `${out}/landscape-${width}.png` });
    report.cases.layouts.push({ width, height, bounds: s.battleBounds, safe: s.safe });
  }
  assert.deepEqual(report.errors, []); report.status = 'PASSED_SCOPED_RUNTIME'; report.passed = true;
} catch (error) { report.status = 'FAILED'; report.failure = error.stack || String(error); process.exitCode = 1; }
finally { await save(); await browser?.close(); }
