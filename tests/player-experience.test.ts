import assert from 'node:assert/strict';
import test from 'node:test';
import { battleAimRect, battleResultLayout, cooldownProgress } from '../assets/scripts/domain/BattleLayout.js';
import { InputRouter, contains } from '../assets/scripts/input/InputRouter.js';
import { ShotBudget } from '../assets/scripts/domain/BattleRules.js';
import { loadSeedPack } from '../tools/config/files.js';

test('角色附近可开始瞄准；右侧切箭不抢手；松手单发与取消仍由原输入规则控制', async () => {
  const { combat: cfg } = await loadSeedPack(), safe = { left: 70, top: 24, right: 2280, bottom: 1040 };
  const layout = { aim: battleAimRect(safe), arrowSwitch: { left: 2060, top: 860, right: 2260, bottom: 1020 } };
  const router = new InputRouter({ ...cfg.input, initialRad: Math.PI / 10, minRad: -Math.PI / 12, maxRad: Math.PI * 5 / 12 }, cfg.arrows, true);
  const point = { x: safe.left + (safe.right - safe.left) * 0.17, y: safe.top + (safe.bottom - safe.top) * 0.55 };
  assert.ok(contains(layout.aim, point)); assert.ok(!contains(layout.aim, { x: point.x, y: safe.top + 50 }));
  router.press(1, point, layout); router.move(1, { x: point.x - 100, y: point.y + 30 });
  assert.equal(router.step(0.2), null); assert.equal(router.aimId, 1);
  const switchPoint = { x: 2160, y: 940 };
  router.press(2, switchPoint, layout); router.release(2, switchPoint, layout);
  assert.equal(router.aimId, 1); assert.equal(router.step(0.01), null);
  router.release(1, { x: point.x - 100, y: point.y + 30 }, layout);
  assert.equal(router.step(0.01)?.arrowId, 'impact'); assert.equal(router.step(0.1), null);
  router.press(3, point, layout); router.step(0.2); router.cancel(); router.release(3, point, layout);
  assert.equal(router.step(0.1), null);
});

test('冷却进度读取上一次真实发射的间隔，选中其他箭不重置共享冷却', async () => {
  const { combat: cfg } = await loadSeedPack(), budget = new ShotBudget(cfg.player);
  const arrow = cfg.arrows.find(a => a.id === 'impact')!;
  assert.equal(budget.release(arrow, { active: true, alive: true, armed: true, launchClear: true }), null);
  assert.equal(cooldownProgress(budget.cooldownSec, arrow.intervalSec), 0);
  budget.step(arrow.intervalSec / 2, false, true);
  assert.ok(Math.abs(cooldownProgress(budget.cooldownSec, arrow.intervalSec) - 0.5) < 1e-9);
  assert.equal(budget.release(cfg.arrows[0]!, { active: true, alive: true, armed: true, launchClear: true }), 'cooldown');
  budget.step(arrow.intervalSec, false, true); assert.equal(cooldownProgress(budget.cooldownSec, arrow.intervalSec), 1);
  assert.equal(cooldownProgress(Infinity, arrow.intervalSec), 0);
});

test('结算主按钮在安全区内且达到最小触摸尺寸，不贴近顶部操作按钮', () => {
  for (const [width, height, scale] of [[1920, 1080, 0.75], [2337, 1080, 390 / 1080], [1920, 1440, 1024 / 1920]] as const) {
    const safe = { left: 80, right: width - 60, top: 30, bottom: height - 30 };
    const { panel, retry, summary } = battleResultLayout(safe, 48 / scale);
    assert.ok(panel.left >= safe.left && panel.right <= safe.right && panel.top >= safe.top && panel.bottom <= safe.bottom);
    assert.ok(retry.left >= panel.left && retry.right <= panel.right && retry.top >= panel.top && retry.bottom <= panel.bottom);
    assert.ok((retry.right - retry.left) * scale >= 48 && (retry.bottom - retry.top) * scale >= 48);
    assert.ok(summary.y < retry.top && retry.top > safe.top + 150);
  }
});
