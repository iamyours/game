// Production combat/presentation ownership checks with API doubles. Not a physics backend or engine acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ArcadeCycle, BowState } from '../assets/scripts/domain/ArcadeRules.ts';
import { highlightOpacity, retirementOpacity } from '../assets/scripts/domain/ProjectilePresentation.ts';

function fixture() {
  class Color { constructor(...rgba) { this.rgba = rgba; } }
  class UIOpacity { opacity = 255; }
  class RigidBody2D {}
  class Sprite {}
  const cc = { Color, UIOpacity, RigidBody2D, Sprite, ERigidBody2DType: { Dynamic: 2 } };
  const velocities = [];
  const physics = { units: n => n * 32, positionM: node => node.position,
    setVelocity: (...args) => velocities.push(args) };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync('assets/scripts/combat/ArcadeBattle.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, console, require: name => name === 'cc' ? cc :
    name.endsWith('PhysicsAdapter') ? { PhysicsAdapter: physics } : name.endsWith('ProjectilePresentation') ? { highlightOpacity, retirementOpacity } : {} });
  const controller = Object.create(module.exports.ArcadeBattle.prototype);
  const skin = { color: { preserved: 'heavy tint' } }, neck = { enabled: true };
  const node = () => ({ position: { y: 3 }, components: new Map(), getComponent(Type) { return this.components.get(Type); },
    addComponent(Type) { const component = new Type(); this.components.set(Type, component); return component; } });
  const actor = { id: 'Enemy_1', root: node(), bodies: new Map([['pelvis', { node: node() }]]),
    bodyNodes: new Map([['head', { getChildByName: () => ({ getComponent: () => skin }) }]]),
    joints: new Map([['neck', neck]]), definition: { jointDefinitions: [{ id: 'neck', childId: 'head', parentId: 'chest', parentAnchorM: [0, 0] }] },
    worldPointM: () => ({ x: 10, y: 5 }) };
  const player = { id: 'PlayerRagdoll', bodies: new Map([['pelvis', { node: node() }]]) };
  const platform = node(); const body = platform.addComponent(RigidBody2D); body.wakeUp = () => {};
  const enemy = { actor, platform, deadAt: null, telegraph: true, bow: new BowState(24), aim: { setAlive(alive) { this.alive = alive; } } };
  enemy.bow.armed = false;
  const state = { id: actor.id, hp: 60, lastHit: null };
  Object.assign(controller, { actors: [player, actor], enemies: [enemy], states: new Map([[player.id, { hp: 100 }], [actor.id, state]]),
    injuries: new Map(), drops: [], cycle: new ArcadeCycle(1.2), spawnRetryAt: 0, initialSpawnPending: false,
    cfg: { run: { fallKillY_M: -2 }, arcade: { cleanupSec: 3.5, respawnSec: 1.2 }, limits: { maxCorpses: 2 } } });
  return { controller, enemy, state, actor, skin, neck, platform, body, velocities, UIOpacity };
}

test('致命头部命中后颈关节保留，平台进入动态；死亡和掉弓结算保持一次', () => {
  const f = fixture(), b = f.controller;
  f.state.hp = 0; b.hit(f.state, 'head'); b.afterStep(); b.afterStep();
  assert.equal(f.actor.joints.get('neck'), f.neck); assert.equal(f.neck.enabled, true);
  assert.equal(f.body.type, 2); assert.equal(f.enemy.aim.alive, false);
  assert.equal(b.score, 1); assert.equal(b.drops.length, 0, '已掉弓不重复生成');
  assert.equal(f.velocities.length, 1, '只启动一次原平台坠落');
  assert.deepEqual(f.skin.color, { preserved: 'heavy tint' });
});

test('短提示到期不遗留伤色；死亡淡出只修改渲染透明度', () => {
  const f = fixture(), b = f.controller;
  b.hit(f.state, 'head'); assert.equal(b.injuries.get(f.state.id).size, 1);
  b.cycle.elapsed = 0.2; b.afterStep(); assert.equal(b.injuries.size, 0);
  assert.deepEqual(f.skin.color, { preserved: 'heavy tint' });
  b.fade(f.actor.root, 0.5); assert.equal(f.actor.root.getComponent(f.UIOpacity).opacity, 128);
  assert.equal(f.actor.joints.get('neck'), f.neck); assert.equal(f.velocities.length, 0);
});
