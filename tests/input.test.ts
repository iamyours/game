import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedStepClock } from '../assets/scripts/domain/FixedStepClock.js';
import { InputRouter, type ShotIntent } from '../assets/scripts/input/InputRouter.js';
const dt = 1 / 60;
const layout = { aim: { left: 0, top: 100, right: 200, bottom: 300 },
  arrowSwitch: { left: 300, top: 100, right: 400, bottom: 300 } };
const left = { x: 100, y: 200 }, right = { x: 350, y: 200 };
const arrows = [{ id: 'normal', intervalSec: 0.55 }, { id: 'impact', intervalSec: 0.8 }];
const rules = { deadzoneDesign: 10, initialRad: Math.PI / 10, minRad: -Math.PI / 12, maxRad: 5 * Math.PI / 12, firstShotDelaySec: 0.12, pullBackToAim: true, fullDrawDistanceDesign: 120 };
const simulate = (r: InputRouter, ticks: number): ShotIntent[] => {
  const shots: ShotIntent[] = [];
  for (let i = 0; i < ticks; i++) { const shot = r.step(dt); if (shot) shots.push(shot); }
  return shots;
};

test('一直按住十秒不射箭，拉满保持，松手下一固定步只射一次', () => {
  const r = new InputRouter(rules, arrows);
  r.press(4, left, layout);
  assert.deepEqual(simulate(r, 600), []);
  assert.equal(r.drawProgress, 0, '只按住不拖动不会自动变满弓');
  r.release(4, left, layout);
  assert.equal(r.drawProgress, 0);
  assert.equal(r.step(dt)?.arrowId, 'normal');
  assert.deepEqual(simulate(r, 120), []);
  r.release(4, left, layout);
  assert.deepEqual(simulate(r, 60), [], '重复 up 不重复发射');
});

test('右手切箭不抢左手，只有左手松开才发射，冷却不被切箭重置', () => {
  const r = new InputRouter(rules, arrows);
  r.press(4, left, layout); simulate(r, 8);
  r.press(9, right, layout); r.release(9, right, layout);
  assert.equal(r.aimId, 4); assert.equal(r.selectedArrow.id, 'impact');
  assert.deepEqual(simulate(r, 30), []);
  r.release(4, left, layout);
  assert.equal(r.step(dt)?.arrowId, 'impact');
  r.press(5, left, layout); simulate(r, 10);
  r.press(9, right, layout); r.release(9, right, layout);
  r.release(5, left, layout);
  assert.deepEqual(simulate(r, 60), [], '冷却中松手丢弃，不能等到冷却结束自动补射');
  r.press(6, left, layout); simulate(r, 8); r.release(6, left, layout);
  assert.equal(r.step(dt)?.arrowId, 'normal');
});

test('短点未完成最小拉弓时长不发射；刚满门槛后松手才发射', () => {
  const r = new InputRouter(rules, arrows);
  r.press(1, left, layout); simulate(r, 7); r.release(1, left, layout);
  assert.deepEqual(simulate(r, 120), []);
  r.press(2, left, layout); simulate(r, 8); r.release(2, left, layout);
  assert.equal(r.step(dt)?.arrowId, 'normal');
});

test('拒射原因区分短点和冷却，取消清除反馈且不会延迟补射', () => {
  const r = new InputRouter(rules, arrows);
  r.press(1, left, layout); r.release(1, left, layout);
  assert.equal(r.lastReleaseResult, 'too-short');
  assert.deepEqual(simulate(r, 120), []);
  r.press(2, left, layout); simulate(r, 8); r.release(2, left, layout);
  assert.equal(r.lastReleaseResult, 'queued');
  assert.ok(r.step(dt));
  r.press(3, left, layout); simulate(r, 8); r.release(3, left, layout);
  assert.equal(r.lastReleaseResult, 'cooldown');
  assert.deepEqual(simulate(r, 120), []);
  r.cancel();
  assert.equal(r.lastReleaseResult, 'none');
  r.press(4, left, layout); simulate(r, 8); r.release(4, left, layout);
  r.cancel();
  assert.equal(r.step(dt), null);
});

test('死区保留方向，设计坐标 y 翻转，移出热区仍由原触点控制且角度限幅', () => {
  const r = new InputRouter(rules, arrows);
  r.press(7, left, layout); r.move(7, { x: 106, y: 194 });
  assert.equal(r.aimRad, rules.initialRad);
  r.press(3, left, layout); r.move(3, { x: 200, y: 10 });
  assert.equal(r.aimId, 7); assert.equal(r.aimRad, rules.initialRad);
  r.move(7, { x: 200, y: 100 }); assert.equal(r.aimRad, Math.PI / 4);
  r.move(7, { x: 101, y: 0 }); assert.equal(r.aimRad, rules.maxRad);
  r.move(7, { x: 101, y: 400 }); assert.equal(r.aimRad, rules.minRad);
  assert.deepEqual(simulate(r, 30), []);
  r.release(7, { x: 101, y: 400 }, layout);
  assert.equal(r.step(dt)?.aimRad, rules.minRad);
});

test('取消、暂停、后台和恢复不当作松手，旧 move/up 不放箭', () => {
  const r = new InputRouter(rules, arrows);
  for (const block of [false, true]) {
    r.press(1, left, layout); r.press(2, right, layout); simulate(r, 30);
    if (block) { r.setBlocked(true); r.press(1, left, layout); r.setBlocked(false); }
    else r.cancel();
    r.move(1, { x: 200, y: 80 }); r.release(1, left, layout); r.release(2, right, layout);
    assert.equal(r.selectedArrow.id, 'normal');
    assert.deepEqual(simulate(r, 120), []);
  }
});

test('松手队列在物理步消费前被取消或阻塞时丢弃', () => {
  for (const cancel of [(r: InputRouter) => r.cancel(), (r: InputRouter) => r.setBlocked(true)]) {
    const r = new InputRouter(rules, arrows);
    r.press(1, left, layout); simulate(r, 30); r.release(1, left, layout);
    cancel(r); r.setBlocked(false);
    assert.deepEqual(simulate(r, 120), []);
  }
});

test('只有一种箭时不接管切箭触点，切箭在区域外松手不生效', () => {
  const r = new InputRouter(rules, arrows.slice(0, 1));
  assert.equal(r.canSwitch, false); r.press(4, right, layout); r.press(4, left, layout);
  assert.equal(r.aimId, 4);
  const two = new InputRouter(rules, arrows); two.press(2, right, layout); two.release(2, left, layout);
  assert.equal(two.selectedArrow.id, 'normal');
});

test('向后拖拽反向瞄准，首个有效拖动锁定方式直到松手', () => {
  const r = new InputRouter(rules, arrows);
  r.press(1, left, layout); r.move(1, { x: 50, y: 250 }); assert.equal(r.aimRad, Math.PI / 4);
  r.move(1, { x: 56, y: 225 }); assert.equal(r.aimRad, Math.atan2(25, 44));
  r.move(1, { x: 150, y: 150 }); assert.equal(r.aimRad, Math.atan2(25, 44));
  r.release(1, left, layout); r.press(2, left, layout); r.move(2, { x: 150, y: 150 });
  assert.equal(r.aimRad, Math.PI / 4);
});

test('释放队列冻结当时箭种与角度，不受随后切箭和新的瞄准污染', () => {
  const r = new InputRouter(rules, arrows);
  r.press(1, left, layout); simulate(r, 20); r.release(1, left, layout);
  r.press(9, right, layout); r.release(9, right, layout);
  r.press(2, left, layout); r.move(2, { x: 190, y: 110 });
  assert.deepEqual(r.step(dt), { arrowId: 'normal', aimRad: rules.initialRad, strength: 0 });
  assert.deepEqual(simulate(r, 60), []);
});

test('固定步只消费整步，长帧丢弃超额时间，重置清空余量', () => {
  const c = new FixedStepClock(dt); let steps = 0;
  const step = (seconds: number) => { assert.equal(seconds, dt); steps++; };
  assert.equal(c.advance(dt / 2, step), 0); assert.equal(c.advance(dt / 2, step), 1);
  assert.equal(c.advance(10, step), 5); assert.equal(c.advance(dt / 2, step), 0);
  c.reset(); assert.equal(c.advance(dt / 2, step), 0); assert.equal(c.advance(dt / 2, step), 1);
  assert.equal(c.advance(NaN, step), 0); assert.equal(steps, 7);
});

 test('拉弓力度由拖动距离决定，可回拉减力，长按不自动加力，松手冻结力度', () => {
  const r = new InputRouter(rules, arrows);
  r.press(1, left, layout);
  r.move(1, { x: 35, y: 200 });
  assert.equal(r.drawProgress, 0.5);
  simulate(r, 600);
  assert.equal(r.drawProgress, 0.5);
  r.move(1, { x: -20, y: 200 });
  assert.equal(r.drawProgress, 1);
  r.move(1, { x: 62.5, y: 200 });
  assert.equal(r.drawProgress, 0.25);
  r.release(1, { x: 62.5, y: 200 }, layout);
  r.press(2, left, layout); r.move(2, { x: 300, y: 200 });
  assert.equal(r.step(dt)?.strength, 0.25);
  assert.deepEqual(simulate(r, 120), []);
 });
