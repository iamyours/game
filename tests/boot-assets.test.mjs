// Calls production Boot with API doubles. This verifies lifecycle/order, not GPU rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { BootRuntime } from '../assets/scripts/core/BootRuntime.ts';
import { startupAssets, loadStartupAssets } from '../assets/scripts/domain/StartupLoading.ts';
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function fixture(deferred = '') {
  let finishVisual;
  const visual = new Promise(resolve => { finishVisual = resolve; });
  const assets = [], pending = [], drawCallbacks = new Set();
  let setups = 0, starts = 0;
  class Asset { refs = 0; json = {}; addRef() { this.refs++; } decRef() { this.refs--; } }
  class Texture2D extends Asset {}
  class JsonAsset extends Asset {}
  class Node { valid = true; constructor(name) { this.name = name; } addComponent() { return { ready: visual, setup: (canvas, config, seed, defer) => { setups++; assert.equal(defer, true); }, beginBattle: () => starts++ }; } destroy() { this.valid = false; } }
  const canvas = { node: {} }, scene = { getComponentInChildren: () => canvas };
  const cc = { Component: class {}, Node, Asset, Texture2D, JsonAsset, Canvas: class {}, Label: class {},
    _decorator: { ccclass: () => c => c, property: () => () => {} },
    isValid: n => n.valid !== false,
    Director: { EVENT_AFTER_DRAW: 'draw' },
    director: { once: (event, cb) => drawCallbacks.add(cb), off: (event, cb) => drawCallbacks.delete(cb) },
    view: { off() {} },
    resources: { load(path, Type, callback) {
      const asset = new Type(); assets.push(asset);
      const complete = () => callback(null, asset);
      if (path === deferred) pending.push(complete); else queueMicrotask(complete);
    } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync('assets/scripts/core/Boot.ts', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console: { error() {} }, setTimeout, clearTimeout,
    require: name => name === 'cc' ? cc : name.endsWith('BootRuntime') ? { BootRuntime } : name.endsWith('StartupLoading') ? { startupAssets, loadStartupAssets } :
      name.endsWith('BootManifest') ? { readBootManifest: () => ({ seedHash: 'test' }) } : name.endsWith('PhysicsLabConfig') ? { readPhysicsLabConfig: () => ({}) } :
        name.endsWith('RigDefinition') ? { readRigDefinition: () => ({}) } : { PhysicsLab: class {} } });
  const boot = new module.exports.Boot(); boot.node = { scene };
  boot.createLoadingScreen = () => { boot.loadingRoot = new Node('loading'); };
  boot.drawLoading = () => {};
  return { boot, pending, assets, finishVisual, drawCallbacks, counts: () => ({ setups, starts }) };
}

test('背景未完成不构建战斗；视觉组装和两个真实draw信号完成前不开战；离场归还全部引用', async () => {
  const f = fixture('scenery/storm-ruins-v2/texture'); f.boot.start(); await flush();
  assert.equal(f.counts().setups, 0); assert.equal(f.counts().starts, 0);
  f.pending[0](); await flush(); assert.equal(f.counts().setups, 1); assert.equal(f.counts().starts, 0);
  assert.equal(f.drawCallbacks.size, 0);
  f.finishVisual(); await flush(); assert.equal(f.drawCallbacks.size, 1);
  [...f.drawCallbacks][0](); await flush(); assert.equal(f.counts().starts, 0);
  [...f.drawCallbacks][0](); await flush(); assert.equal(f.counts().starts, 1);
  assert.equal(f.boot.runtime.state, 'ready'); assert.ok(f.assets.every(a => a.refs === 1));
  f.boot.onDestroy(); assert.ok(f.assets.every(a => a.refs === 0));
});

test('加载中销毁再收到迟到纹理，不构建战斗、不持有资源、不残留draw回调', async () => {
  const f = fixture('scenery/storm-ruins-v2/texture'); f.boot.start(); await flush();
  f.boot.onDestroy(); f.pending[0](); f.finishVisual(); await flush();
  assert.equal(f.boot.runtime.state, 'disposed'); assert.equal(f.counts().setups, 0);
  assert.ok(f.assets.every(a => a.refs === 0)); assert.equal(f.drawCallbacks.size, 0);
});
