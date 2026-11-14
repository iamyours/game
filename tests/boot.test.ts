import assert from 'node:assert/strict';
import test from 'node:test';
import { BootRuntime } from '../assets/scripts/core/BootRuntime.js';

test('并发启动共享同一 Promise，加载和就绪事件只执行一次', async () => {
  const events: string[] = [];
  const runtime = new BootRuntime({ loadConfig: async () => { events.push('load'); return 2; }, onReady: (value) => { events.push(`ready:${value}`); } });
  assert.equal(runtime.state, 'idle');
  const first = runtime.start(); const second = runtime.start();
  assert.equal(first, second);
  assert.equal(runtime.state, 'loading');
  await first; await runtime.start();
  assert.equal(runtime.state, 'ready');
  assert.deepEqual(events, ['load', 'ready:2']);
});
test('加载失败不启动后续流程，并允许显式重试', async () => {
  let attempts = 0; let ready = 0;
  const runtime = new BootRuntime({ loadConfig: async () => { if (++attempts === 1) throw new Error('failed'); return 2; }, onReady: () => { ready += 1; } });
  await assert.rejects(runtime.start(), /failed/);
  assert.equal(runtime.state, 'failed'); assert.equal(ready, 0);
  await runtime.start(); assert.equal(runtime.state, 'ready'); assert.equal(ready, 1);
});
test('加载期间场景销毁不向已销毁节点发出就绪事件', async () => {
  let release!: (value: number) => void; let ready = false;
  const promise = new Promise<number>((resolve) => { release = resolve; });
  const runtime = new BootRuntime({ loadConfig: () => promise, onReady: () => { ready = true; } });
  const started = runtime.start(); runtime.dispose(); release(2); await started;
  assert.equal(ready, false); assert.equal(runtime.state, 'disposed');
  await assert.rejects(runtime.start(), /销毁/);
});
test('就绪回调错误会使启动失败而不是伪报 ready', async () => {
  const runtime = new BootRuntime({ loadConfig: async () => 2, onReady: () => { throw new Error('render failed'); } });
  await assert.rejects(runtime.start(), /render failed/); assert.equal(runtime.state, 'failed');
});

test('异步视觉组装结束前不能ready；组装期间销毁不恢复ready', async () => {
  let finish!: () => void;
  const visual = new Promise<void>(resolve => { finish = resolve; });
  const runtime = new BootRuntime({ loadConfig: async () => 1, onReady: () => visual });
  const start = runtime.start(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(runtime.state, 'loading'); runtime.dispose(); finish(); await start;
  assert.equal(runtime.state, 'disposed');
});

test('异步纹理组装失败可以重试，后续只在成功组装后就绪', async () => {
  let attempts = 0;
  const runtime = new BootRuntime({ loadConfig: async () => 1, onReady: async () => {
    if (++attempts === 1) throw new Error('skin failed');
  } });
  await assert.rejects(runtime.start(), /skin failed/); assert.equal(runtime.state, 'failed');
  await runtime.start(); assert.equal(runtime.state, 'ready'); assert.equal(attempts, 2);
});
