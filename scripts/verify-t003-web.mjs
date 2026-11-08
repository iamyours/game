import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ||
  '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');

const out = resolve(process.env.T003_EVIDENCE_DIR || fileURLToPath(new URL('../evidence/T003/', import.meta.url)));
const url = process.env.T003_URL || 'http://127.0.0.1:7458/';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', executablePath: chrome });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const report = { passed: false, date: process.env.EVIDENCE_DATE || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }),
  mode: `${process.env.HEADED === '1' ? 'headed' : 'headless'} Chrome; WebGL; Cocos 3.8.8; Box2D; no phone claim`, url,
  browser: browser.version(), runtime: null, stability: {}, reset: {}, pageErrors: [], consoleErrors: [] };
page.on('pageerror', error => report.pageErrors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
const get = () => page.evaluate(() => {
  const { lab, world } = window.t003Runtime;
  return { ...lab.snapshot(), box2dBodies: world.GetBodyCount(), box2dJoints: world.GetJointCount() };
});
const waitFor = async (predicate, label, timeout = 120000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await get();
    if (predicate(value)) return value;
    await page.waitForTimeout(50);
  }
  throw new Error(`未观察到：${label}`);
};
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.System), null, { timeout: 120000 });
  report.runtime = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const end = performance.now() + 120000;
    while (performance.now() < end) {
      const scene = cc.director.getScene();
      const lab = scene?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
      if (lab) {
        // Read the pinned 3.8.8 Box2D JS backend in the harness only. It adds one internal ground body.
        window.t003Runtime = { lab, world: cc.PhysicsSystem2D.instance.physicsWorld._world };
        return { scene: scene.name, version: cc.VERSION, box2d: cc.PhysicsSystem2D.PHYSICS_BOX2D,
          physicsWorld: cc.PhysicsSystem2D.instance.physicsWorld?.constructor.name };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Boot 未启动 PhysicsLab');
  });
  assert.equal(report.runtime.version, '3.8.8');
  assert.equal(report.runtime.box2d, true);
  assert.equal(report.runtime.physicsWorld, 'b2PhysicsWorld');

  // Reload through Boot and observe platform filters immediately after fixture creation.
  // The first scene sync may rebuild fixtures and hide a bad initialization order.
  report.platformFixtures = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const prototype = cc.BoxCollider2D.prototype;
    const originalApply = prototype.apply;
    const ownApply = Object.getOwnPropertyDescriptor(prototype, 'apply');
    const fixtures = new Map();
    prototype.apply = function () {
      originalApply.call(this);
      if (this.node.name.startsWith('Platform_') && !fixtures.has(this.node.name)) {
        fixtures.set(this.node.name, { name: this.node.name, masks: this.impl._fixtures.map(f => f.GetFilterData().maskBits) });
      }
    };
    try {
      const oldScene = cc.director.getScene();
      if (!cc.director.loadScene('Boot')) throw new Error('未能重新载入 Boot');
      const until = performance.now() + 20000;
      while (performance.now() < until) {
        const scene = cc.director.getScene();
        const lab = scene !== oldScene && scene?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
        if (lab) {
          window.t003Runtime.lab = lab;
          const { ragdoll, projectile } = lab.config.rig.collisionGroups;
          return { fixtures: [...fixtures.values()], requiredMask: ragdoll | projectile };
        }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('重新进入 Boot 后未启动 PhysicsLab');
    } finally {
      if (ownApply) Object.defineProperty(prototype, 'apply', ownApply);
      else delete prototype.apply;
    }
  });
  assert.equal(report.platformFixtures.fixtures.length, 3);
  assert.ok(report.platformFixtures.fixtures.every(({ masks }) => masks.length === 1 &&
    (masks[0] & report.platformFixtures.requiredMask) === report.platformFixtures.requiredMask),
  `平台初始原生碰撞体缺少角色/箭矢掩码: ${JSON.stringify(report.platformFixtures)}`);

  const initial = await waitFor(snapshot => snapshot.calibration?.passed === true, 'T002 calibration and PhysicsLab');
  const samples = [];
  const stabilityEnd = Date.now() + 30000;
  while (Date.now() < stabilityEnd) {
    samples.push(await get());
    await page.waitForTimeout(100);
  }
  const ragdolls = samples.flatMap(snapshot => snapshot.rig.ragdolls);
  assert.ok(samples.at(-1).stepId - samples[0].stepId >= 900, '物理运行不足 15 秒');
  assert.ok(samples.length >= 100, `30 秒采样不足：${samples.length}`);
  assert.ok(samples.every(snapshot => snapshot.physicsBodies === 27 && snapshot.physicsJoints === 20 && snapshot.box2dBodies === 28 && snapshot.box2dJoints === 20));
  assert.ok(ragdolls.every(ragdoll => ragdoll.bodyCount === 11 && ragdoll.jointCount === 10 && ragdoll.finite));
  assert.ok(ragdolls.every(ragdoll => ragdoll.maxJointErrorM < 0.02));
  const coordinates = ragdolls.flatMap(ragdoll => Object.values(ragdoll.positionsM).flatMap(point => [point.x, point.y]));
  assert.ok(coordinates.every(value => Number.isFinite(value) && value > -10 && value < 35), '骨架出现越界/非有限坐标');
  // Finite joints are insufficient: an intact rig can still fall off the platform.
  const standing = ragdolls.map(rig => ({ chest: rig.positionsM.chest, spawnX: rig.id === 'PlayerRagdoll' ? 3.5 : 18 }));
  report.standing = { minChestYM: Math.min(...standing.map(rig => rig.chest.y)),
    maxDriftXM: Math.max(...standing.map(rig => Math.abs(rig.chest.x - rig.spawnX))) };
  assert.ok(report.standing.minChestYM > 4.35 && report.standing.maxDriftXM < 0.5,
    `未受击应持续站在各自平台上: ${JSON.stringify(report.standing)}`);
  report.standingSoak = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const lab = window.t003Runtime.lab;
    // Keep the production adapter and Box2D, but skip rendering and the director's update.
    cc.director.pause();
    const start = lab.snapshot().stepId;
    let minChestYM = Infinity, maxDriftXM = 0;
    try {
      for (let i = 1; i <= 3600; i++) {
        lab.physics.advance(1 / 60, lab.beforeStep, lab.afterStep);
        if (i % 60 !== 0) continue;
        for (const rig of lab.snapshot().rig.ragdolls) {
          const { x, y } = rig.positionsM.chest;
          minChestYM = Math.min(minChestYM, y);
          maxDriftXM = Math.max(maxDriftXM, Math.abs(x - (rig.id === 'PlayerRagdoll' ? 3.5 : 18)));
        }
      }
      return { fixedSteps: lab.snapshot().stepId - start, minChestYM, maxDriftXM };
    } finally { cc.director.resume(); }
  });
  assert.equal(report.standingSoak.fixedSteps, 3600);
  assert.ok(report.standingSoak.minChestYM > 4.35 && report.standingSoak.maxDriftXM < 0.5,
    `额外 60 秒固定步期间应持续站台: ${JSON.stringify(report.standingSoak)}`);
  const maxJointErrorM = Math.max(...ragdolls.map(ragdoll => ragdoll.maxJointErrorM));
  report.stability = { durationSec: 30, observedFixedSteps: samples.at(-1).stepId - samples[0].stepId, sampleCount: samples.length, initialResetCount: initial.rig.resetCount,
    bodyCountPerRagdoll: [...new Set(ragdolls.map(ragdoll => ragdoll.bodyCount))],
    jointCountPerRagdoll: [...new Set(ragdolls.map(ragdoll => ragdoll.jointCount))], maxJointErrorM,
    physicsBodies: [...new Set(samples.map(snapshot => snapshot.physicsBodies))],
    physicsJoints: [...new Set(samples.map(snapshot => snapshot.physicsJoints))],
    box2dBodies: [...new Set(samples.map(snapshot => snapshot.box2dBodies))],
    box2dJoints: [...new Set(samples.map(snapshot => snapshot.box2dJoints))],
    calibrationPassed: initial.calibration.passed };

  let lastResetStep = 0;
  for (let i = 1; i <= 20; i += 1) {
    await page.evaluate(() => window.t003Runtime.lab.resetRagdolls());
    const snapshot = await waitFor(value => value.rig.resetCount >= i, `重置 ${i}/20`, 5000);
    lastResetStep = snapshot.stepId;
    assert.equal(snapshot.physicsBodies, 27);
    assert.equal(snapshot.physicsJoints, 20);
    assert.equal(snapshot.box2dBodies, 28);
    assert.equal(snapshot.box2dJoints, 20);
    assert.ok(snapshot.rig.ragdolls.every(ragdoll => ragdoll.bodyCount === 11 && ragdoll.jointCount === 10 && ragdoll.finite));
  }
  const final = await waitFor(value => value.stepId >= lastResetStep + 95, '最后一次重置后稳定');
  assert.ok(final.rig.ragdolls.every((rig, index) => rig.positionsM.chest.y > 4.35 &&
    Math.abs(rig.positionsM.chest.x - (index === 0 ? 3.5 : 18)) < 0.5), '重置后应回到各自平台上');
  report.reset = { requested: 20, completed: final.rig.resetCount, physicsBodies: final.physicsBodies,
    physicsJoints: final.physicsJoints, box2dBodies: final.box2dBodies, box2dJoints: final.box2dJoints, ragdollBodyCounts: final.rig.ragdolls.map(ragdoll => ragdoll.bodyCount),
    ragdollJointCounts: final.rig.ragdolls.map(ragdoll => ragdoll.jointCount) };
  assert.equal(final.rig.resetCount, 20);
  assert.deepEqual(report.reset.ragdollBodyCounts, [11, 11]);
  assert.deepEqual(report.reset.ragdollJointCounts, [10, 10]);
  assert.deepEqual(report.reset.physicsBodies, 27);
  assert.deepEqual(report.reset.physicsJoints, 20);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'web-verification.json'), JSON.stringify(report, null, 2) + '\n');
  const status = report.passed ? 'PASS' : 'FAIL';
  await writeFile(resolve(out, 'verification.md'), `# T003 Web 运行证据\n\n- 日期：${report.date}\n- 场景：Boot → PhysicsLab，${report.mode}\n- 运行：${status}\n- 结论：${report.passed ? '真实 Cocos Creator 3.8.8 Box2D 中生成左右两个 11 刚体、10 铰链骨架；静置 30 秒采样期间双方站在各自平台，刚体/关节数量保持 27/20、关节误差小于 0.02 m；随后安全队列重置 20 次，数量仍保持不变。' : report.failure}\n- 运行时：${JSON.stringify(report.runtime)}\n- 平台初始夹具：${JSON.stringify(report.platformFixtures)}\n- 站台：${JSON.stringify(report.standing)}\n- 额外站台固定步：${JSON.stringify(report.standingSoak)}\n- 稳定性：${JSON.stringify(report.stability)}\n- 重置：${JSON.stringify(report.reset)}\n- 页面错误：${JSON.stringify(report.pageErrors)}\n- 控制台错误：${JSON.stringify(report.consoleErrors)}\n\n边界：这是桌面 Chrome WebGL 运行证据，不是手机真机或渠道验收；配置和 manifest 仍保留 runtimeVerified: false，T008 手感门未通过。\n`);
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
