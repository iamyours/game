import test from 'node:test';
import assert from 'node:assert/strict';
import { ImpactFeedback } from '../assets/scripts/domain/ProjectilePresentation.js';
import { battlePauseLayout } from '../assets/scripts/domain/BattleLayout.js';

test('重叠命中分级反馈各自到期，同箭30ms重复不重触发或延长，暂停不推进', () => {
  const feedback = new ImpactFeedback();
  feedback.hit(1, { x: 2, y: 3 }, 0, 2); feedback.step(0.03);
  feedback.hit(1, { x: 2, y: 3 }, 0, 2); feedback.hit(2, { x: 4, y: 5 }, 0.4, 3);
  assert.equal(feedback.items.length, 2); assert.equal(feedback.items[0]!.age, 0.03);
  const samples = feedback.items.map(m => feedback.sample(m)); feedback.step(0);
  assert.deepEqual(feedback.items.map(m => feedback.sample(m)), samples);
  feedback.step(0.19); assert.equal(feedback.items.length, 1); assert.equal(feedback.items[0]!.shotId, 2);
  feedback.step(0.1); assert.equal(feedback.items.length, 0);
});

test('1000次连续反馈活动数量和历史有界，清场清除旧状态', () => {
  const feedback = new ImpactFeedback();
  for (let i = 0; i < 1000; i++) { feedback.hit(i, { x: i, y: 2 }, 0, 1); assert.ok(feedback.items.length <= 12); }
  feedback.clear(); assert.equal(feedback.items.length, 0);
  feedback.hit(999, { x: 1, y: 2 }, 0, 1); assert.equal(feedback.items.length, 1);
  feedback.step(1); assert.equal(feedback.items.length, 0);
});

test('只快照接触位置，三档范围递增且不修改来箭/身体数据', () => {
  const feedback = new ImpactFeedback(), point = { x: 2, y: 4 };
  for (const tier of [1, 2, 3] as const) feedback.hit(tier, point, 0, tier);
  point.x = 99;
  assert.ok(feedback.items.every(m => m.point.x === 2));
  const sizes = feedback.items.map(m => feedback.sample(m).radius);
  assert.ok(sizes[0]! < sizes[1]! && sizes[1]! < sizes[2]!);
  feedback.hit(7, { x: Infinity, y: 2 }, 0, 1); assert.equal(feedback.items.length, 3);
  assert.throws(() => feedback.step(NaN));
});

test('暂停菜单选项和继续按钮在安全区内，手机/小窗口均满足48逻辑像素', () => {
  for (const scale of [0.75, 390 / 1080, 180 / 1080]) {
    const safe = { left: 30, right: 1890, top: 20, bottom: 1060 }, layout = battlePauseLayout(safe, 48 / scale);
    assert.ok(layout.panel.top >= safe.top && layout.panel.bottom <= safe.bottom);
    for (const r of [...layout.options, layout.retry]) {
      assert.ok(r.left >= layout.panel.left && r.right <= layout.panel.right);
      assert.ok((r.right - r.left) * scale >= 48 - 1e-9 && (r.bottom - r.top) * scale >= 48);
    }
    assert.ok(layout.options.every(r => r.bottom < layout.retry.top));
  }
});
