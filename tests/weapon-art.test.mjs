// Production sprite/shot ownership with API doubles; not a Cocos/Box2D runtime test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as geometry from '../assets/scripts/domain/weaponGeometry.ts';
import * as loadout from '../assets/scripts/domain/BattleLoadout.ts';
import * as presentation from '../assets/scripts/domain/ProjectilePresentation.ts';
import { applyDrawStrength } from '../assets/scripts/domain/archery.ts';

const config = JSON.parse(readFileSync('configs/combat.seed.json'));
const specs = Object.fromEntries(['thunder', 'gale', 'moon'].map(id => [id, JSON.parse(readFileSync(`assets/resources/weapons/${id}-art.json`))]));

function fixture({ fail = '', deferred = false } = {}) {
  class Node {
    constructor(name = '') { this.name = name; this.children = []; this.components = new Map(); this.active = true; this.valid = true; this.position = { x: 0, y: 0 }; }
    set parent(value) { this._parent = value; value?.children.push(this); }
    get parent() { return this._parent; }
    addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); if (Type === Sprite) this.addComponent(UITransform); return c; }
    getComponent(Type) { return this.components.get(Type); }
    setPosition(x, y) { this.position = { x, y }; }
    setRotationFromEuler(...rotation) { this.rotation = rotation; }
    setScale(...scale) { this.scale = scale; }
    setSiblingIndex() {}
    setParent(parent) { this.parent = parent; }
    destroy() { this.valid = false; }
  }
  class UITransform { setAnchorPoint(...point) { this.anchor = point; } setContentSize(...size) { this.size = size; } }
  class Sprite { static SizeMode = { CUSTOM: 1 }; }
  class Graphics { clear() {} moveTo() {} lineTo() {} stroke() {} }
  class Color { static WHITE = new Color(); fromHEX(hex) { this.hex = hex; return this; } }
  class Texture2D { constructor(path, width, height) { Object.assign(this, { path, width, height, refs: 0 }); } addRef() { this.refs++; } decRef() { this.refs--; } }
  class SpriteFrame { destroy() { this.destroyed = true; } }
  class JsonAsset { constructor(json) { this.json = json; } }
  class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
  class Size { constructor(width, height) { Object.assign(this, { width, height }); } }
  class UIOpacity { opacity = 255; }
  const textures = new Map(), pending = [], warnings = [];
  const resources = { load(path, Type, cb) {
    const run = () => {
      if (path.includes(fail) && fail) { cb(new Error('fixture missing variant')); return; }
      const id = path.includes('gale') ? 'gale' : path.includes('moon') ? 'moon' : 'thunder';
      if (Type === JsonAsset) { cb(null, new JsonAsset(specs[id])); return; }
      if (!textures.has(path)) { const size = path.includes('thunder-arrow') ? specs.thunder.arrow.imageSize : specs[id].bow.imageSize;
        textures.set(path, new Texture2D(path, ...size)); }
      cb(null, textures.get(path));
    };
    if (deferred) pending.push(run); else queueMicrotask(run);
  } };
  const cc = { Node, Graphics, Color, Sprite, SpriteFrame, Texture2D, JsonAsset, Rect, Size, UITransform, UIOpacity, resources,
    isValid: node => node?.valid !== false, Contact2DType: {}, ERigidBody2DType: {} };
  const physics = { units: n => n * 32, degrees: n => n * 180 / Math.PI,
    place: (node, x, y) => node.setPosition(x * 32, y * 32), setVelocity: (body, x, y) => { body.velocity = { x, y }; } };
  function load(path, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
      { module, exports: module.exports, console: { warn: (...args) => warnings.push(args) }, require: name => name === 'cc' ? cc : dependencies(name) });
    return module.exports;
  }
  const weapon = load('assets/scripts/presentation/ThunderWeaponSkin.ts', name => name.endsWith('PhysicsAdapter') ? { PhysicsAdapter: physics } :
    name.endsWith('weaponGeometry') ? geometry : name.endsWith('BattleLoadout') ? loadout :
      { WEAPON_STYLES: { normal: { arrowLength: 1.28 }, impact: { arrowLength: 1.38 }, piercing: { arrowLength: 1.46 } }, drawWeaponArrow() {} });
  const projectile = load('assets/scripts/combat/ProjectileSystem.ts', name => name.endsWith('PhysicsAdapter') ? { PhysicsAdapter: physics } :
    name.endsWith('ThunderWeaponSkin') ? weapon : name.endsWith('ProjectilePresentation') ? presentation : { drawWeaponArrow() {} });
  return { ...cc, ...weapon, ...projectile, textures, warnings, flush: () => pending.splice(0).forEach(run => run()) };
}

test('新增GPT图集原始PNG哈希、透明格式、分片与固定握点有效，弓和箭区域分离', () => {
  for (const id of ['gale', 'moon']) {
    const spec = specs[id], bytes = readFileSync(`assets/resources/weapons/${id}-weapon.png`);
    assert.equal(bytes[25], 6); // RGBA
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], spec.bow.imageSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256[`${id}-weapon`]);
    geometry.validateThunderArt(spec);
    assert.ok(spec.bow.rect[0] + spec.bow.rect[2] < spec.arrow.rect[0]);
    for (const flex of [-0.4, 0, 0.5, 1]) {
      const grip = geometry.bowArtPoint(spec.bow.grip, spec.bow, 0.74, 0.55, flex);
      assert.ok(Math.hypot(grip.x, grip.y) < 1e-12);
      for (let i = 0; i < 40; i++) {
        const s = geometry.bowArtStrip(i, spec.bow, 0.74, 0.55, flex);
        assert.ok(s.widthM > 0 && s.heightM > 0);
        assert.ok(Number.isFinite(geometry.spriteShear(s.shearX, s.verticalScale).rotationRad));
      }
    }
  }
});

test('切三弓复用40片节点，弓身与搭箭同步换帧；图集只持有一次引用且可重复释放', async () => {
  const f = fixture(), assets = new f.WeaponArtAssets(); await assets.load();
  const root = new f.Node('world'), bow = new f.ThunderBowSkin(root, assets);
  for (const id of ['thunder', 'gale', 'moon', 'gale', 'thunder']) {
    assert.equal(bow.draw({ x: 4, y: 5, angleRad: 0.2 }, config.bowControl, 'normal', 0.5, { x: 3.4, y: 4.9 }, true, id), true);
    assert.equal(bow.snapshot.bow, id); assert.equal(bow.snapshot.strips, 40);
    assert.equal(bow.strips[0].spriteFrame, assets.forBow(id).bowFrames[0]);
    assert.equal(bow.arrow.sprite.spriteFrame, assets.forBow(id).arrowFrame);
    assert.equal(bow.root.children.filter(n => n.name === 'BowStripWarp').length, 40);
  }
  assert.equal(f.textures.size, 4);
  for (const texture of f.textures.values()) assert.equal(texture.refs, 1);
  bow.dispose(); assets.dispose(); assets.dispose();
  for (const texture of f.textures.values()) assert.equal(texture.refs, 0);
});

test('一款加载失败可回退且不拖累另外两款；退出后的异步加载不再持有纹理', async () => {
  const f = fixture({ fail: 'gale' }), assets = new f.WeaponArtAssets(); await assets.load();
  assert.ok(assets.forBow('thunder').ready && assets.forBow('moon').ready);
  assert.equal(assets.forBow('gale').ready, false); assert.equal(f.warnings.length, 1);
  const bow = new f.ThunderBowSkin(new f.Node(), assets);
  assert.equal(bow.draw({ x: 0, y: 0, angleRad: 0 }, config.bowControl, 'normal', 0, undefined, false, 'moon'), true);
  assert.equal(bow.draw({ x: 0, y: 0, angleRad: 0 }, config.bowControl, 'normal', 0, undefined, false, 'gale'), false);
  assert.equal(bow.snapshot.visible, false); bow.dispose(); assets.dispose();
  const late = fixture({ deferred: true }), owner = new late.WeaponArtAssets(), loading = owner.load();
  owner.dispose(); late.flush(); await loading;
  for (const texture of late.textures.values()) assert.equal(texture.refs, 0);
});

test('真实发射、池复用和插箭读取本箭外观快照，切装备不改变在途箭；敌箭隐藏旧皮肤', async () => {
  const f = fixture(), assets = new f.WeaponArtAssets(); await assets.load();
  const world = new f.Node('world'), visual = new f.Node('shaft'), node = new f.Node('tip'); visual.parent = node; node.parent = world;
  const graphics = visual.addComponent(f.Graphics), skin = new f.ThunderArrowSkin(visual, assets);
  const slot = { node, body: {}, graphics, skin };
  const shots = Object.create(f.ProjectileSystem.prototype);
  Object.assign(shots, { world, config, weaponAssets: assets, spare: [slot], flying: new Map(), nextId: 1, stepId: 10, launchBlockReason: () => null,
    embedded: new presentation.ArrowResidues(config.limits, () => {}) });
  const equipment = new loadout.BattleLoadout(); equipment.switchBow();
  const arrow = applyDrawStrength(equipment.arrow(config.arrows[0]), 0.7, config.bowControl.minPowerRatio);
  const socket = { x: 4, y: 5, angleRad: 0.2 }, id = shots.fire('PlayerRagdoll', socket, arrow);
  assert.equal(skin.sprite.spriteFrame, assets.forBow('gale').arrowFrame);
  equipment.switchBow(); arrow.appearance = 'moon';
  const flight = shots.flying.get(id); assert.equal(flight.arrow.appearance, 'gale');
  const target = new f.Node('enemy'); target.parent = world;
  shots.embed({ attackerId: 'PlayerRagdoll', targetId: 'enemy', partId: 'chest', pointM: { x: 10, y: 5 },
    incomingVelocityMps: { x: 15, y: 0 }, arrow: flight.arrow }, target);
  const embedded = shots.embedded.items[0].visual.shaft.children.find(n => n.name === 'WeaponArrowArt').getComponent(f.Sprite);
  assert.equal(embedded.spriteFrame, assets.forBow('gale').arrowFrame);
  shots.recycle(flight); shots.fire('Enemy_1', socket, config.arrows[0]);
  assert.equal(skin.sprite.node.active, false); assert.equal(graphics.enabled, true);
  shots.recycle([...shots.flying.values()][0]); shots.fire('PlayerRagdoll', socket, equipment.arrow(config.arrows[0]));
  assert.equal(skin.sprite.spriteFrame, assets.forBow('moon').arrowFrame);
  assert.equal(skin.sprite.node.active, true); assert.equal(graphics.enabled, false);
  assets.dispose();
});
