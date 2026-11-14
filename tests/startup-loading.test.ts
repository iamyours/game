import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startupAssets, loadStartupAssets, type StartupAsset } from '../assets/scripts/domain/StartupLoading.js';
import { PlatformPressure } from '../assets/scripts/domain/ArcadeRules.js';

const task = (path: string, weight = 1): StartupAsset => ({ path, kind: 'json', label: path, weight });

test('首场清单覆盖双方人物/背景/平台/三把弓箭，实物存在；不阻塞后续场景或音乐', () => {
  for (const arcade of [true, false]) {
    const assets = startupAssets(arcade);
    assert.equal(new Set(assets.map(a => a.path)).size, assets.length);
    for (const asset of assets) {
      const file = asset.kind === 'texture' ? asset.path.replace(/\/texture$/, '.png') : `${asset.path}.json`;
      assert.ok(existsSync(`assets/resources/${file}`), file);
      assert.ok(asset.weight > 0);
      assert.ok(!/frost|ember|audio/.test(asset.path));
    }
    assert.ok(assets.some(a => a.path === 'weapons/moon-weapon/texture'));
    assert.ok(assets.some(a => a.path === 'weapons/gale-weapon/texture'));
    assert.ok(assets.some(a => a.path === 'weapons/thunder-arrow/texture'));
    assert.ok(assets.some(a => a.path === `characters/${arcade ? 'enemy-ruins-v2' : 'enemy-atlas'}/texture`));
    assert.equal(assets.some(a => a.path.includes('scenery/')), arcade);
  }
});

test('真实完成才推进进度；限制并发，慢纹理未完成不能报100%', async () => {
  const releases: (() => void)[] = [], updates: number[] = [];
  let active = 0, peak = 0, done = false;
  const loading = loadStartupAssets([task('A', 5), task('B'), task('C')], async () => {
    active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => releases.push(() => { active--; resolve(); }));
  }, fraction => updates.push(fraction), 2).then(() => { done = true; });
  assert.equal(releases.length, 2); assert.deepEqual(updates, [0]);
  releases[1]!(); await Promise.resolve(); await Promise.resolve();
  assert.equal(releases.length, 3); assert.ok(updates.at(-1)! < 1); assert.equal(done, false);
  releases[2]!(); await Promise.resolve(); await Promise.resolve();
  assert.equal(done, false); releases[0]!(); await loading;
  assert.equal(peak, 2); assert.equal(updates.at(-1), 1);
  assert.ok(updates.every((p, i) => i === 0 || p >= updates[i - 1]!));
});

test('失败停止派发并等待已在途的任务结束，再暴露重试，避免重试与迟到写入竞争', async () => {
  const starts: string[] = [];
  let release!: () => void, ended = false;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const load = loadStartupAssets([task('bad'), task('slow'), task('not-started')], async a => {
    starts.push(a.path); if (a.path === 'bad') throw new Error('offline'); await waiting;
  }, () => {}, 2).catch(error => { ended = true; throw error; });
  const rejection = assert.rejects(load, /offline/);
  await Promise.resolve(); await Promise.resolve(); assert.equal(ended, false);
  release(); await rejection;
  assert.deepEqual(starts, ['bad', 'slow']);
});

test('平台压力只用固定步推进，普通倒地3秒仅触发一次坍塌，暂停和玩家死亡不推进', () => {
  const pressure = new PlatformPressure();
  const state = { active: true, alive: true, armed: true, downed: true, boss: false };
  assert.equal(pressure.step(1, state), false); assert.equal(pressure.remainingSec, 2);
  pressure.step(10, { ...state, active: false }); assert.equal(pressure.remainingSec, 2);
  pressure.step(10, { ...state, alive: false }); assert.equal(pressure.remainingSec, 2);
  assert.equal(pressure.step(2, state), true); assert.equal(pressure.remainingSec, null);
  assert.equal(pressure.step(10, state), false); assert.equal(pressure.collapsed, true);
});

test('BOSS不能因单次倒地跳过血量；真实失弓5秒后允许坍塌，不写HP或击败数', () => {
  const pressure = new PlatformPressure();
  const state = { active: true, alive: true, armed: true, downed: true, boss: true };
  assert.equal(pressure.step(60, state), false); assert.equal(pressure.remainingSec, null);
  assert.equal(pressure.step(4, { ...state, armed: false }), false); assert.equal(pressure.remainingSec, 1);
  assert.equal(pressure.step(1, { ...state, armed: false }), true);
});
