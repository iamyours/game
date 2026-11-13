// Production combat/presentation ownership checks with API doubles. Not a physics backend or engine acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ArcadeCycle, BowState } from '../assets/scripts/domain/ArcadeRules.ts';
import { RunProgression, RUN_RULES } from '../assets/scripts/domain/RunProgression.ts';
import { BattleLoadout } from '../assets/scripts/domain/BattleLoadout.ts';
import { resolveDamage, lethalHeadshot } from '../assets/scripts/domain/damage.ts';
import { planReaction, splitHitImpulse } from '../assets/scripts/domain/reaction.ts';
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
    name.endsWith('PhysicsAdapter') ? { PhysicsAdapter: physics } : name.endsWith('RunProgression') ? { RunProgression, RUN_RULES } : name.endsWith('ProjectilePresentation') ? { highlightOpacity, retirementOpacity } : {} });
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
  const enemy = { actor, platform, deadAt: null, telegraph: true, encounter: { kind: 'archer' }, hpMax: 60, bow: new BowState(24), aim: { setAlive(alive) { this.alive = alive; } } };
  enemy.bow.armed = false;
  const state = { id: actor.id, hp: 60, lastHit: null };
  const rewards = [];
  Object.assign(controller, { actors: [player, actor], enemies: [enemy], states: new Map([[player.id, { hp: 100 }], [actor.id, state]]),
    injuries: new Map(), drops: [], cycle: new ArcadeCycle(1.2), progression: new RunProgression(), spawnRetryAt: 0, initialSpawnPending: false,
    projectiles: { count: 1 }, loadout: new BattleLoadout(), onPickup: effect => rewards.push(effect),
    cfg: { player: { stamina: 100 }, run: { fallKillY_M: -2 }, arcade: { cleanupSec: 3.5, respawnSec: 1.2 }, limits: { maxCorpses: 2 } } });
  return { controller, enemy, state, actor, skin, neck, platform, body, velocities, UIOpacity, rewards };
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

test('第五次死亡推进强化一次；在途箭未结束不能领取，领取不会重复恢复', () => {
  const { controller: b, state, rewards } = fixture();
  for (let i = 0; i < 4; i++) b.progression.defeated();
  state.hp = 0; b.afterStep(); b.afterStep();
  assert.equal(b.progression.stage, 2); assert.equal(b.progression.pending, true);
  assert.equal(b.rewardReady, false);
  const choice = b.progression.offers[0]; assert.equal(b.chooseReward(choice), false);
  b.projectiles.count = 0; assert.equal(b.rewardReady, true);
  assert.equal(b.chooseReward(choice), true); assert.equal(b.chooseReward(choice), false);
  assert.equal(rewards.length, 1); assert.equal(rewards[0].hp, choice === 'recover' ? 35 : 10); assert.equal(rewards[0].stamina, 100);
});

test('守关敌人和玩家同一步死亡，不能用强化或休整复活', () => {
  const { controller: b, state, rewards } = fixture();
  for (let i = 0; i < 4; i++) b.progression.defeated();
  state.hp = 0; b.states.get('PlayerRagdoll').hp = 0; b.projectiles.count = 0;
  b.afterStep(); assert.equal(b.chooseReward(b.progression.offers[0]), false); assert.equal(rewards.length, 0);
});

test('BOSS头部经过真实HitResolver保留双倍暴击，普通弓手仍一击致命，玩家不受即死规则影响', () => {
  const config = JSON.parse(readFileSync('configs/combat.seed.json', 'utf8'));
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync('assets/scripts/combat/HitResolver.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name.endsWith('damage') ? { resolveDamage, lethalHeadshot } :
    name.endsWith('reaction') ? { planReaction, splitHitImpulse } : { PhysicsAdapter: {} } });
  const states = new Map(['Boss', 'Enemy', 'PlayerRagdoll'].map(id => [id, { id, hp: id === 'Boss' ? 180 : 100, armor: 0, hits: 0, lastHit: null }]));
  const resolver = new module.exports.HitResolver(states, config, () => {}, true, () => undefined, id => id !== 'Boss');
  for (const id of states.keys()) resolver.resolve({ shotId: 123, targetId: id, partId: 'head', arrow: config.arrows[0], incomingVelocityMps: { x: 0, y: 0 }, pointM: { x: 0, y: 0 } }, {});
  assert.equal(states.get('Boss').hp, 144); assert.equal(states.get('Enemy').hp, 0); assert.equal(states.get('PlayerRagdoll').hp, 64);
});

test('BOSS击败战利品只发一次，弓升级有上限，且不会靠奖励复活玩家', () => {
  const { controller: b, state, enemy } = fixture();
  enemy.encounter.kind = 'boss';
  for (let i = 0; i < 14; i++) { b.progression.defeated(); if (b.progression.pending) b.progression.choose(b.progression.offers[0]); }
  state.hp = 0; b.afterStep(); b.afterStep();
  assert.equal(b.loadout.level, 2); assert.equal(b.loadout.snapshot.items.rune, 2);
  assert.equal(b.progression.afterBoss, true); assert.equal(b.progression.stage, 4);
  assert.equal(b.allowsInstantHeadshot(enemy.actor.id), false);
});
