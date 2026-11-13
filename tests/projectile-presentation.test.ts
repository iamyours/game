import assert from 'node:assert/strict';
import test from 'node:test';
import { ArrowResidues, shortFlightTrail } from '../assets/scripts/domain/ProjectilePresentation.js';
import { battleFrame } from '../assets/scripts/domain/BattleLayout.js';
import { loadSeedPack } from '../tools/config/files.js';

test('连续500次命中不累计插箭：身体/平台/全场预算与到期释放共用生产策略', async () => {
  const { combat } = await loadSeedPack();
  const removed = new Set<number>();
  const residues = new ArrowResidues<number>(combat.limits, id => { assert.ok(!removed.has(id), 'visual released once'); removed.add(id); });
  for (let id = 0; id < 500; id++) {
    const terrain = id % 2 === 0, target = terrain ? `platform${id % 8}` : `actor${id % 7}`;
    residues.add(target, terrain, id, id / 60);
    residues.prune(id / 60, () => true);
    assert.ok(residues.count <= combat.limits.maxEmbeddedVisuals);
    const counts = new Map<string, number>();
    for (const e of residues.items) counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
    for (const [key, count] of counts) assert.ok(count <= (key.startsWith('platform') ? 2 : 3));
  }
  residues.prune(20, () => true);
  assert.equal(residues.count, 0); assert.equal(removed.size, 500);
  residues.clear(); residues.clear(); assert.equal(removed.size, 500);
});

test('插箭先淡出再释放；暂停时间不前进；目标回收和失效视觉立即移除', async () => {
  const { combat } = await loadSeedPack(), released: string[] = [];
  const residues = new ArrowResidues<string>(combat.limits, id => released.push(id));
  residues.add('floor', true, 'terrain', 0); residues.add('enemy', false, 'body', 0);
  const terrain = residues.items[0]!;
  assert.equal(residues.opacity(terrain, 1), 1);
  assert.ok(Math.abs(residues.opacity(terrain, 1.9) - 0.5) < 1e-12);
  residues.prune(2.1, () => true); residues.prune(2.1, () => true); assert.equal(residues.count, 2);
  residues.prune(2.2, () => true); assert.deepEqual(released, ['terrain']);
  residues.removeTarget('enemy'); residues.removeTarget('enemy'); assert.deepEqual(released, ['terrain', 'body']);
  residues.add('enemy2', false, 'destroyed-parent', 3);
  residues.prune(3, () => false); assert.equal(residues.count, 0);
  assert.equal(released.at(-1), 'destroyed-parent');
});

test('短箭迹沿已经飞过的路径裁切，长度不超过0.85米且没有反向预测', () => {
  const points = [{ x: 0, y: 1 }, { x: 0.6, y: 0.8 }, { x: 1.2, y: 0.5 }];
  const trail = shortFlightTrail(points);
  assert.deepEqual(trail[0], points.at(-1));
  const length = trail.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - trail[i]!.x, p.y - trail[i]!.y), 0);
  assert.ok(Math.abs(length - 0.85) < 1e-12);
  assert.ok(trail.every(p => p.x >= 0 && p.x <= 1.2 && p.y >= 0.5 && p.y <= 1));
  assert.deepEqual(shortFlightTrail([]), []);
  assert.deepEqual(shortFlightTrail([{ x: 1, y: 2 }, { x: 1, y: 2 }]), [{ x: 1, y: 2 }]);
});

test('横屏16:9到超宽及4:3保留玩家平台、最高敌人和坠落区域，超宽不继续缩小人物', () => {
  for (const aspect of [4 / 3, 16 / 9, 19.5 / 9, 20 / 9, 21 / 9, 32 / 9]) {
    const frame = battleFrame(aspect);
    assert.ok(frame.centerX - frame.width / 2 <= 1);
    assert.ok(frame.centerX + frame.width / 2 >= 22);
    assert.ok(frame.centerY + frame.height / 2 >= 9.3);
    assert.ok(frame.centerY - frame.height / 2 <= -1.3 + 1e-10, '平台下至少保留4.3米可见坠落');
  }
  assert.equal(battleFrame(21 / 9).height, battleFrame(32 / 9).height);
  assert.ok(battleFrame(16 / 9).height < 13.5);
  assert.throws(() => battleFrame(0)); assert.throws(() => battleFrame(NaN));
});
