// Exercises production event wiring with API doubles. Not Cocos/Box2D or listening evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as reaction from '../assets/scripts/domain/reaction.ts';
import * as damage from '../assets/scripts/domain/damage.ts';
import { CareerRepository, biomeForStage } from '../assets/scripts/domain/Expedition.ts';

function load(path, require) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
  } }).outputText, { module, exports: module.exports, require, console });
  return module.exports;
}

test('真实命中结算仅分配一次冲量；头部力臂传到躯干，玩家仍受2.4N·s保护', () => {
  const config = JSON.parse(readFileSync('configs/combat.seed.json'));
  const calls = [], physics = { pointM: p => ({ x: p.x / 32, y: p.y / 32 }), applyImpulse: (...args) => calls.push(args) };
  const { HitResolver } = load('assets/scripts/combat/HitResolver.ts', name => name.endsWith('damage') ? damage : name.endsWith('reaction') ? reaction : { PhysicsAdapter: physics });
  for (const id of ['Enemy', 'PlayerRagdoll']) for (const arrow of config.arrows) {
    calls.length = 0;
    const state = { id, hp: 100, armor: 0, hits: 0, lastHit: null }, torso = { getWorldCenter: () => ({ x: 320, y: 160 }) };
    let callbacks = 0;
    const resolver = new HitResolver(new Map([[id, state]]), config, () => callbacks++, false, () => torso);
    resolver.resolve({ targetId: id, partId: 'head', arrow, incomingVelocityMps: { x: 20, y: 0 }, pointM: { x: 10, y: 5.65 }, shotId: 1 }, { getMass: () => 1.92 });
    assert.equal(calls.length, 2); assert.equal(callbacks, 1); assert.equal(state.hits, 1);
    const budget = id === 'PlayerRagdoll' ? 2.4 : arrow.impulseNs;
    assert.ok(Math.abs(calls[0][1] + calls[1][1] - budget) < 1e-9);
    assert.equal(calls[1][3], 10); assert.equal(calls[1][4], 5.3, '力臂不是胸部中心');
    assert.ok(calls[0][1] / 1.92 <= 3); assert.equal(state.lastHit.impulseNs, budget);
  }
});

test('音乐等待首次交互；场景/BOSS渐变；暂停/后台/关闭音乐立刻停播，恢复不影响音效', () => {
  const cc = { Component: class {}, _decorator: { ccclass: () => value => value } };
  const { PhysicsLab } = load('assets/scripts/presentation/PhysicsLab.ts', name => name === 'cc' ? cc : name.endsWith('Expedition') ? { biomeForStage } : {});
  const source = () => ({ clip: null, playing: false, volume: 0, plays: 0, play() { this.playing = true; this.plays++; }, pause() { this.playing = false; }, stop() { this.playing = false; } });
  const lab = Object.create(PhysicsLab.prototype);
  Object.assign(lab, { arcadeMode: true, viewport: { portrait: false }, career: new CareerRepository({ getItem: () => null, setItem() {} }),
    musicSources: [source(), source()], musicCurrent: -1, musicTrack: '', audioActivated: false,
    hidden: false, manualPause: false, arcade: { progression: { stage: 1 }, bossStatus: null, rewardReady: false },
    combatStates: new Map([['PlayerRagdoll', { hp: 100 }]]), audioClips: new Map(['storm', 'frost', 'ember', 'boss'].map(id => [`music-${id}`, { id }])) });
  lab.syncMusic(.1); assert.ok(lab.musicSources.every(s => !s.playing));
  lab.audioActivated = true;
  for (let i = 0; i < 6; i++) lab.syncMusic(.1);
  assert.equal(lab.musicTrack, 'music-storm'); assert.ok(Math.abs(lab.musicSources[0].volume - .24) < 1e-9);
  lab.arcade.progression.stage = 4; lab.syncMusic(.1); assert.equal(lab.musicTrack, 'music-frost');
  assert.ok(lab.musicSources.every(s => s.playing));
  for (let i = 0; i < 6; i++) lab.syncMusic(.1);
  assert.ok(lab.musicSources[0].volume < 1e-9);
  lab.arcade.bossStatus = { hp: 100 }; lab.syncMusic(.1); assert.equal(lab.musicTrack, 'music-boss');
  for (const key of ['manualPause', 'hidden']) {
    lab[key] = true; lab.syncMusic(.1); assert.ok(lab.musicSources.every(s => !s.playing));
    lab[key] = false; lab.syncMusic(.1); assert.ok(lab.musicSources.some(s => s.playing));
  }
  lab.career.setMusic(false); lab.syncMusic(.1); assert.ok(lab.musicSources.every(s => !s.playing));
  lab.career.setMusic(true); lab.syncMusic(.1); assert.ok(lab.musicSources.some(s => s.playing));
  lab.combatStates.get('PlayerRagdoll').hp = 0; lab.syncMusic(.1); assert.ok(lab.musicSources.every(s => !s.playing));
});

test('头颈连接读取实际骨架，侧仰与倒地后仍覆盖领口到下颌，不写刚体变换', () => {
  class Color { fromHEX(hex) { this.hex = hex; return this; } }
  const physics = { units: n => n * 32, radians: degrees => degrees * Math.PI / 180 };
  const { drawNeckBridge } = load('assets/scripts/presentation/BattleArt.ts', name => name === 'cc' ? { Color } : { PhysicsAdapter: physics });
  const { CharacterSkin } = load('assets/scripts/presentation/CharacterSkin.ts', name => name === 'cc' ? { isValid: () => true } :
    name.endsWith('BattleArt') ? { drawNeckBridge } : { PhysicsAdapter: physics });
  const rotate = (p, a) => ({ x: p[0] * Math.cos(a) - p[1] * Math.sin(a), y: p[0] * Math.sin(a) + p[1] * Math.cos(a) });
  for (const tilt of [-85, 0, 75]) for (const neckAngle of [-25, 0, 25]) {
    const headRad = physics.radians(tilt + neckAngle), chestRad = physics.radians(tilt);
    const anchor = rotate([0, .33], chestRad), fromJoint = rotate([0, .18], headRad);
    const actor = { worldAngleDeg: () => tilt, worldPointM(part, local) {
      if (part === 'chest') return { x: 10, y: 5 };
      const p = rotate(local, headRad);
      return { x: 10 + anchor.x + fromJoint.x + p.x, y: 5 + anchor.y + fromJoint.y + p.y };
    } };
    const lines = [], graphics = { clear() {}, moveTo(x, y) { this.from = { x, y }; }, lineTo(x, y) { lines.push({ from: this.from, to: { x, y } }); }, stroke() {}, circle() {}, fill() {} };
    const skin = Object.create(CharacterSkin.prototype);
    Object.assign(skin, { disposed: false, neck: graphics, actor,
      rig: { jointDefinitions: [{ id: 'neck', parentAnchorM: [0, .33], childAnchorM: [0, -.18] }] } });
    skin.draw();
    const expected = rotate([0, .1], physics.radians(neckAngle));
    assert.equal(lines.length, 2);
    assert.ok(Math.abs(lines[0].from.y / 32 - .2) < 1e-9);
    assert.ok(Math.abs(lines[0].to.x / 32 - expected.x) < 1e-9);
    assert.ok(Math.abs(lines[0].to.y / 32 - (.33 + expected.y)) < 1e-9);
    skin.disposed = true; skin.draw(); assert.equal(lines.length, 2);
  }
});
