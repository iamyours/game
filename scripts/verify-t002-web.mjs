import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ||
  '/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs');
const out = resolve(process.env.T002_EVIDENCE_DIR || fileURLToPath(new URL('../evidence/T002/', import.meta.url)));
const url = process.env.T002_URL || 'http://127.0.0.1:7458/?practice=1';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const headed = process.env.HEADED === '1';
const profile = headed ? await mkdtemp(join(tmpdir(), 'storm-archers-chrome-')) : null;
let chromeProcess;
async function stopChrome() {
  if (!profile) return;
  if (chromeProcess && chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
    const exit = new Promise(resolve => chromeProcess.once('exit', resolve));
    chromeProcess.kill();
    await Promise.race([exit, delay(3000, undefined, { ref: false })]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
async function launch() {
  if (!profile) return chromium.launch({ headless: true, executablePath: chrome });
  // A separate, disposable Chrome profile; no Playwright focus emulation, so switching tabs really hides the game.
  chromeProcess = spawn(chrome, ['--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let spawnError;
  chromeProcess.on('error', error => { spawnError = error; });
  for (let i = 0; i < 150; i++) {
    if (spawnError) throw spawnError;
    const info = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    const port = Number(info.split('\n')[0]);
    if (port) return chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    await delay(100);
  }
  throw new Error('Chrome DevTools 启动超时');
}
const browser = await launch().catch(async error => { await stopChrome(); throw error; });
const report = { passed: false, browser: browser.version(), url,
  date: process.env.EVIDENCE_DATE || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
  mode: `${process.env.HEADED === '1' ? 'headed' : 'headless'} Chrome; WebGL; CDP two-point touch and desktop mouse; not a phone test`,
  checks: {}, events: [], pageErrors: [], failedRequests: [], console: [] };
await mkdir(out, { recursive: true });
const ctx = headed ? browser.contexts()[0]
  : await browser.newContext({ viewport: { width: 1440, height: 810 }, hasTouch: true, deviceScaleFactor: 1 });
const page = headed ? ctx.pages()[0] : await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
page.on('pageerror', error => report.pageErrors.push(String(error)));
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure() }));
page.on('console', message => {
  if (message.type() !== 'debug') report.console.push({ type: message.type(), text: message.text() });
});
const get = () => page.evaluate(() => window.t002Lab.snapshot());
const wait = async (predicate, label) => {
  const end = Date.now() + 12000;
  do {
    const s = await get();
    if (predicate(s)) return s;
    await page.waitForTimeout(22);
  } while (Date.now() < end);
  throw new Error(`未观察到：${label}\n${JSON.stringify(await get())}`);
};
const mark = async (name) => {
  const s = await get();
  report.events.push({ name, step: s.stepId, shots: s.shots, lastShot: s.lastShot,
    aimId: s.aimId, aimDeg: s.aimDeg, arrow: s.arrow, paused: s.paused, hidden: s.hidden });
  return s;
};
const center = r => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const active = new Set();
const touch = async (type, points) => {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  if (type === 'touchStart') points.forEach(p => active.add(p.id));
  if (type === 'touchEnd') points.length ? points.forEach(p => active.delete(p.id)) : active.clear();
  if (type === 'touchCancel') active.clear();
};
const finger = (point, id) => ({ ...point, id, radiusX: 5, radiusY: 5, force: 1 });
const tapWith = async (p, id) => {
  const button = [finger(p, id)];
  await touch('touchStart', button);
  await touch('touchEnd', button);
};
const sameShots = async (count, ms) => {
  await page.waitForTimeout(ms);
  assert.equal((await get()).shots, count, '输入结束后不应补发');
};

try {
  if (headed) {
    await page.setViewportSize({ width: 1440, height: 810 });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.System), null, { timeout: 120000 });
  const runtime = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const scene = cc.director.getScene();
      const lab = scene?.getChildByName('PhysicsLab')?.getComponent('StormArchersPhysicsLab');
      if (lab) {
        window.t002Lab = lab;
        const canvas = document.getElementById('GameCanvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const rect = canvas.getBoundingClientRect();
        return { scene: scene.name, version: cc.VERSION, box2d: cc.PhysicsSystem2D.PHYSICS_BOX2D,
          physicsWorld: cc.PhysicsSystem2D.instance.physicsWorld?.constructor.name,
          webgl: gl?.getParameter(gl.VERSION), canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Boot 未启动 PhysicsLab：${cc.director.getScene()?.getChildByName('Canvas')?.getChildByName('BootStatus')?.getComponent(cc.Label)?.string}`);
  });
  report.runtime = runtime;
  assert.equal(runtime.scene, 'Boot');
  assert.equal(runtime.version, '3.8.8');
  assert.equal(runtime.box2d, true);
  assert.equal(runtime.physicsWorld, 'b2PhysicsWorld');
  assert.match(runtime.webgl ?? '', /WebGL 2/);
  assert.deepEqual(runtime.canvas, { x: 0, y: 0, width: 1440, height: 810 });

  await page.evaluate(() => {
    const canvas = document.getElementById('GameCanvas');
    window.t002DomEvents = [];
    for (const name of ['touchstart', 'touchend', 'touchcancel']) canvas.addEventListener(name, event => {
      window.t002DomEvents.push({ name, trusted: event.isTrusted, changed: [...event.changedTouches].map(t => t.identifier),
        active: [...event.touches].map(t => t.identifier) });
    }, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => window.t002DomEvents.push({ name: 'visibilitychange', state: document.visibilityState }));
    const stream = canvas.captureStream(20);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1250000 });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    window.t002StopRecording = () => new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
      };
      recorder.stop();
    });
    recorder.start();
  });
  const base = await wait(s => s.calibration !== null, 'AC01 标定结果');
  report.seedHash = base.seedHash;
  report.checks.AC01 = base.calibration;
  assert.equal(base.autoSimulation, false);
  assert.equal(base.calibration.steps, 60);
  assert.equal(base.calibration.seconds, 1);
  assert.equal(base.calibration.passed, true, JSON.stringify(base.calibration.checks));

  const css = (p, s = base) => ({ x: p.x * 1440 / s.width, y: p.y * 810 / s.height });
  const a = css(center(base.layout.aim)), b = css(center(base.layout.arrowSwitch)), pause = css(center(base.pauseRect));
  const left = finger(a, 11);
  const dragged = finger({ x: a.x + 110, y: a.y - 145 }, 11);
  const before = await mark('idle');
  await touch('touchStart', [left]);
  await wait(s => s.aimId === 11, '左侧 touchId');
  await touch('touchMove', [dragged]);
  await wait(s => s.aimDeg > 45, '拖出热区仍在瞄准');
  const full = await wait(s => s.drawProgress === 1 && s.pose.hands.ready, '拉满仍不射');
  assert.equal(full.shots, before.shots);
  await touch('touchEnd', []);
  const first = await wait(s => s.shots === before.shots + 1, '普通箭松手发射');
  await touch('touchStart', [left]);
  await touch('touchMove', [dragged]);
  await tapWith(b, 22);
  const switched = await mark('two-finger switch while left is outside aim zone');
  assert.equal(switched.aimId, 11);
  assert.equal(switched.arrow, 'impact');
  assert.equal(switched.aimDeg, first.aimDeg);
  const fullSecond = await wait(s => s.drawProgress === 1 && s.pose.hands.ready && s.stepId >= first.lastShot.stepId + 34, '切箭后重新拉满');
  assert.equal(fullSecond.shots, first.shots);
  await touch('touchEnd', []);
  const second = await wait(s => s.shots === first.shots + 1, '切箭后松手发射');
  assert.equal(first.lastShot.arrowId, 'normal');
  assert.equal(second.lastShot.arrowId, 'impact');
  assert.ok(second.lastShot.stepId - first.lastShot.stepId >= 33, '切箭不能绕过上一发的 0.55 秒冷却');
  await mark('new arrow fires at unchanged cooldown deadline');
  await page.screenshot({ path: resolve(out, 'physicslab.png') });
  await touch('touchStart', [left]);
  await touch('touchMove', [dragged]);
  await wait(s => s.drawProgress === 1, '取消前拉满');
  await touch('touchCancel', []);
  const cancelled = await wait(s => s.aimId === null, '取消清除左手');
  await sameShots(cancelled.shots, 940);
  await mark('touchcancel: no queued shots');

  // Pause before first shot, keep the original left finger physically down through resume.
  await touch('touchStart', [left]);
  await tapWith(pause, 22);
  const paused = await wait(s => s.paused, '手动暂停');
  assert.equal(paused.aimId, null);
  await sameShots(paused.shots, 330);
  assert.equal((await get()).stepId, paused.stepId, '暂停期间不得步进');
  await tapWith(pause, 22);
  await wait(s => !s.paused, '手动继续');
  await touch('touchMove', [dragged]);
  await sameShots(paused.shots, 940);
  await mark('pause/resume: old touch does not reacquire');
  await touch('touchEnd', []);
  await touch('touchStart', [left]);
  await touch('touchMove', [dragged]);
  await wait(s => s.drawProgress === 1 && s.pose.hands.ready, '重新拉满');
  await touch('touchEnd', []);
  const restarted = await wait(s => s.shots === paused.shots + 1, '重新按住并松手后试射');
  await touch('touchStart', [left]);
  await mark('fresh hold fires');

  // Prefer a real tab visibility change. Chrome automation may leave both tabs visible.
  const other = await ctx.newPage();
  await other.bringToFront();
  await other.waitForTimeout(250);
  const realHide = await page.evaluate(() => document.hidden);
  if (headed) assert.equal(realHide, true, '有头验收必须触发真实标签页后台');
  if (realHide) {
    report.backgroundSource = 'actual browser tab visibilitychange';
  } else {
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    report.backgroundSource = 'synthetic DOM pagehide/pageshow through Cocos web lifecycle (automated tabs stay visible)';
  }
  const hidden = await wait(s => s.hidden, 'Cocos Web 后台事件');
  assert.equal(hidden.aimId, null);
  await sameShots(hidden.shots, 850);
  assert.equal((await get()).stepId, hidden.stepId, '后台不得积累物理步');
  await mark('background: clocks stopped, hold discarded');
  await page.bringToFront();
  if (!realHide) await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await wait(s => !s.hidden, 'Cocos Web 恢复事件');
  await touch('touchMove', [dragged]);
  await sameShots(hidden.shots, 940);
  await mark('foreground: no catch-up and no stale hold');
  await touch('touchEnd', []);
  await other.close();
  assert.ok(hidden.shots >= restarted.shots);
  report.domEvents = await page.evaluate(() => window.t002DomEvents);
  assert.ok(report.domEvents.some(e => e.name === 'touchstart' && e.trusted && e.active.includes(11) && e.active.includes(22)), '两个可信浏览器触点应同时存在');
  assert.ok(report.domEvents.some(e => e.name === 'touchcancel' && e.trusted && e.changed.includes(11)), '真实浏览器触摸取消管线');
  if (realHide) assert.deepEqual(report.domEvents.filter(e => e.name === 'visibilitychange').map(e => e.state).slice(-2), ['hidden', 'visible']);
  if (headed) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

  const mouse = await get();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 95, a.y - 30);
  await wait(s => s.drawProgress === 1 && s.pose.hands.ready, '鼠标拉满');
  assert.equal((await get()).shots, mouse.shots);
  await page.mouse.up();
  const mouseShot = await wait(s => s.shots === mouse.shots + 1, '鼠标拖动松手与试射');
  assert.ok(mouseShot.aimDeg > 10 && mouseShot.aimDeg < 25, '鼠标拖动更新瞄准角');
  await page.mouse.up();
  await wait(s => s.aimId === null, '鼠标释放');
  await page.mouse.click(b.x, b.y);
  assert.equal((await get()).arrow, 'piercing');
  await sameShots(mouseShot.shots, 950);
  await mark('desktop mouse drag, release, and switch');
  const video = Buffer.from(await page.evaluate(() => window.t002StopRecording()), 'base64');
  assert.ok(video.length > 10000, '录像不能为空');
  await writeFile(resolve(out, 'ac02-web.webm'), video);
  report.checks.AC02 = { passed: true, minimumSwitchGapSteps: 33, actualSwitchGapSteps: second.lastShot.stepId - first.lastShot.stepId };

  const checkAspect = async (width, height, name, portrait = false) => {
    await page.setViewportSize({ width, height });
    const s = await wait(s => Math.abs(s.width / s.height - width / height) < 0.001 && s.portrait === portrait, name);
    assert.ok(Math.abs(s.projection.roundTrip.x - 3.5) < 0.001 && Math.abs(s.projection.roundTrip.y - 3.85) < 0.001);
    if (!portrait) {
      const { topLeft, bottomRight } = s.projection;
      assert.ok(topLeft.x >= -1 && topLeft.y >= -1 && bottomRight.x <= s.width + 1 && bottomRight.y <= s.height + 1,
        `核心构图不能被裁掉：${JSON.stringify(s.projection)}`);
      for (const r of [s.layout.arrowSwitch, s.pauseRect]) {
        assert.ok(r.left >= s.safe.left && r.top >= s.safe.top && r.right <= s.safe.right && r.bottom <= s.safe.bottom);
        assert.ok((r.right - r.left) * width / s.width >= 47.99);
        assert.ok((r.bottom - r.top) * height / s.height >= 47.99);
      }
    }
    report.checks[name] = { viewport: [width, height], projection: s.projection, safe: s.safe, controls: s.layout, portrait };
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    return s;
  };
  await checkAspect(1440, 810, 'landscape-16x9');
  await checkAspect(1200, 900, 'landscape-4x3');
  await checkAspect(1400, 600, 'landscape-ultrawide');
  await checkAspect(640, 360, 'landscape-compact');
  const portrait = await checkAspect(540, 960, 'portrait', true);
  await page.waitForTimeout(250);
  assert.equal((await get()).stepId, portrait.stepId, '竖屏提示时应暂停');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.failedRequests, []);
  report.passed = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({ path: resolve(out, 'web-failed.png') }).catch(() => {});
  throw error;
} finally {
  if (active.size) await touch('touchCancel', []).catch(() => {});
  await browser.close();
  await stopChrome();
  await writeFile(resolve(out, 'web-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
