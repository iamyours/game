// Resource-owner contract only. These doubles do not emulate Cocos rendering or physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const spec = JSON.parse(readFileSync('assets/resources/scenery/ruins-art-v2.json'));
  class Texture2D {
    constructor(size) { [this.width, this.height] = size; this.refs = 0; }
    addRef() { this.refs++; } decRef() { this.refs--; }
  }
  class SpriteFrame { destroy() { this.destroyed = true; } }
  class UITransform { setAnchorPoint() {} setContentSize(width, height) { this.width = width; this.height = height; } }
  class Graphics { enabled = true; }
  class Sprite { static SizeMode = { CUSTOM: 0 }; }
  class Node {
    children = []; components = new Map(); activeInHierarchy = true; valid = true;
    constructor(name) { this.name = name; }
    set parent(parent) { this.owner = parent; parent.children.push(this); }
    addComponent(Type) { const result = new Type(); this.components.set(Type, result); if (Type === Sprite) this.addComponent(UITransform); return result; }
    getComponent(Type) { return this.components.get(Type); }
    setPosition(x, y) { this.x = x; this.y = y; }
    destroy() { this.valid = false; }
  }
  const pending = [], textures = [new Texture2D(spec.assets.background.imageSize), new Texture2D(spec.assets.platform.imageSize), new Texture2D([1536, 1024]), new Texture2D([1536, 1024])];
  const cc = { Color: class { fromHEX(hex) { this.hex = hex; return this; } }, Texture2D, SpriteFrame, UITransform, Graphics, Sprite, Node, Rect: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }, Size: class {}, JsonAsset: class {},
    isValid: node => node.valid, resources: { load(path, Type, callback) { pending.push({ path, callback }); } } };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync('assets/scripts/presentation/RuinsArtAssets.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, console: { warn() {} }, require: name => name === 'cc' ? cc : { PhysicsAdapter: { units: value => value * 32 } } });
  const owner = new module.exports.RuinsArtAssets();
  const settle = async (failed = false) => {
    for (const request of pending.splice(0)) {
      const asset = request.path.endsWith('ruins-art-v2') ? { json: spec } : textures[request.path.includes('storm-ruins') ? 0 : request.path.includes('frost-') ? 2 : request.path.includes('ember-') ? 3 : 1];
      request.callback(failed ? new Error('resource unavailable') : null, asset);
    }
    // Flush the resource promises, the shared pack promise, and its queued consumers.
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return { owner, pending, textures, settle, Node, Graphics, UITransform, Sprite };
}

test('场景资源只加载一次；平台端块保宽，所有视觉在原碰撞框内；背景cover不变形', async () => {
  const f = fixture(), backdrop = new f.Node('background'), platform = new f.Node('platform');
  const fallback = platform.addComponent(f.Graphics);
  f.owner.attachBackdrop(backdrop); f.owner.attachPlatform(platform, 2.4);
  f.owner.resize({ left: 0, right: 30, bottom: 0, top: 12 });
  assert.equal(f.pending.length, 3); await f.settle();
  assert.equal(platform.children.length, 3); assert.equal(fallback.enabled, false);
  assert.ok(Math.abs(platform.children[0].getComponent(f.UITransform).width / 32 - 0.38) < 1e-10);
  for (const node of platform.children) {
    const t = node.getComponent(f.UITransform);
    assert.ok(node.x - t.width / 2 >= -2.4 * 16 - 1e-10 && node.x + t.width / 2 <= 2.4 * 16 + 1e-10);
    assert.equal(t.height / 32, 0.6);
  }
  const image = backdrop.children[0].getComponent(f.UITransform);
  assert.ok(image.width >= 30 * 32 && image.height >= 12 * 32);
  assert.ok(Math.abs(image.width / image.height - 1672 / 941) < 1e-10);
  f.owner.dispose(); assert.ok(f.textures.every(t => t.refs === 0));
});

test('资源未返回便离开场景或站台被回收，不创建迟到精灵也不持有纹理', async () => {
  const f = fixture(), platform = new f.Node('platform');
  f.owner.attachPlatform(platform, 5); f.owner.dispose(); await f.settle();
  assert.equal(platform.children.length, 0); assert.ok(f.textures.every(t => t.refs === 0));
  const second = fixture(), retired = new second.Node('retired');
  second.owner.attachPlatform(retired, 5); retired.activeInHierarchy = false; await second.settle();
  assert.equal(retired.children.length, 0); second.owner.dispose();
  assert.ok(second.textures.every(t => t.refs === 0));
});

test('素材失败保留原平台绘制，重复附着不重发加载请求', async () => {
  const f = fixture(), platform = new f.Node('platform');
  const fallback = platform.addComponent(f.Graphics);
  f.owner.attachPlatform(platform, 5); await f.settle(true);
  f.owner.attachPlatform(platform, 5); await Promise.resolve();
  assert.equal(f.pending.length, 0); assert.equal(platform.children.length, 0); assert.equal(fallback.enabled, true);
  assert.ok(f.textures.every(t => t.refs === 0)); f.owner.dispose();
});

test('场景切换不会被迟到资源反写；资源仅持有一份，离场时全部归还', async () => {
  const f = fixture(), backdrop = new f.Node('backdrop'), platform = new f.Node('platform');
  f.owner.attachBackdrop(backdrop); f.owner.attachPlatform(platform, 3); await f.settle();
  const sprite = backdrop.children[0].getComponent(f.Sprite);
  f.owner.setBiome('frost'); f.owner.setBiome('ember');
  assert.equal(f.pending.length, 2);
  const frost = f.pending.find(p => p.path.includes('frost'));
  frost.callback(null, f.textures[2]); await Promise.resolve(); await Promise.resolve();
  assert.notEqual(sprite.spriteFrame.texture, f.textures[2], '旧请求不能覆盖新场景');
  f.pending.splice(f.pending.indexOf(frost), 1); await f.settle();
  assert.equal(sprite.spriteFrame.texture, f.textures[3]);
  f.owner.setBiome('frost'); await Promise.resolve(); await Promise.resolve();
  assert.equal(sprite.spriteFrame.texture, f.textures[2]); assert.equal(f.pending.length, 0);
  for (let i = 0; i < 50; i++) f.owner.setBiome(i % 2 ? 'ember' : 'frost');
  await Promise.resolve(); assert.equal(f.pending.length, 0);
  assert.ok(f.textures.every(t => t.refs <= 1));
  f.owner.dispose(); assert.ok(f.textures.every(t => t.refs === 0));
});
