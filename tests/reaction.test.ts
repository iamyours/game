import assert from 'node:assert/strict';
import test from 'node:test';
import { planReaction, ReactionWeights, splitHitImpulse } from '../assets/scripts/domain/reaction.js';
import { applyDrawStrength } from '../assets/scripts/domain/archery.js';
import { loadSeedPack } from '../tools/config/files.js';
import { validateSeedPack } from '../tools/config/validate.js';
const pack = await loadSeedPack(), config = pack.combat;

test('同力度命中同部位：冲击箭保留更大真实冲量、更弱局部回正和更长恢复', () => {
  for (const strength of [0, 0.5, 1]) {
    const reactions = config.arrows.map(seed => {
      const arrow = applyDrawStrength(seed, strength, config.bowControl.minPowerRatio);
      const impulse = Math.min(arrow.impulseNs, config.reaction.maxSingleImpulseNs);
      return { id: arrow.id, impulse, plan: planReaction('chest', config.reaction.profiles[arrow.id], impulse / seed.impulseNs) };
    });
    const normal = reactions.find(a => a.id === 'normal')!, impact = reactions.find(a => a.id === 'impact')!, piercing = reactions.find(a => a.id === 'piercing')!;
    assert.ok(impact.impulse > normal.impulse && normal.impulse > piercing.impulse);
    for (const other of [normal, piercing]) {
      assert.ok(impact.plan[0]!.weight < other.plan[0]!.weight);
      assert.ok(impact.plan[0]!.recoverySec > other.plan[0]!.recoverySec);
    }
  }
});

test('头/腰/臂/膝作用不同关节，手臂命中不软化整个人的双膝', () => {
  const p = config.reaction.profiles.normal;
  const ids = (part: string) => planReaction(part, p, 1).map(r => r.joint);
  assert.deepEqual(ids('head'), ['neck', 'waist']);
  assert.ok(ids('chest').includes('leftHip'));
  assert.deepEqual(ids('rightForearm'), ['rightShoulder', 'rightElbow', 'waist']);
  assert.deepEqual(ids('leftShin'), ['leftHip', 'leftKnee', 'waist']);
  assert.deepEqual(ids('not-a-body'), []);
  assert.deepEqual(planReaction('head', p, 0), []);
});

test('玩家手臂有恢复时长和最低控制保护；轻拉不会产生满弓相同的降权', () => {
  const p = config.reaction.profiles.impact;
  const full = planReaction('rightForearm', p, 1, config.player.armRecoveryRangeSec);
  for (const r of full.filter(r => r.joint !== 'waist')) {
    assert.ok(r.weight >= 0.35);
    assert.ok(r.recoverySec >= 0.25 && r.recoverySec <= 0.45);
  }
  const light = planReaction('chest', p, 0.35)[0]!, heavy = planReaction('chest', p, 1)[0]!;
  assert.ok(light.weight > heavy.weight); assert.ok(light.recoverySec < heavy.recoverySec);
});

test('马达权重逐步恢复；弱后续命中不能立刻抹去强冲击；重置清除旧受创', () => {
  const state = new ReactionWeights();
  state.register(planReaction('chest', config.reaction.profiles.impact, 1));
  assert.ok(Math.abs(state.weight('waist') - 0.03) < 1e-9);
  state.step(0.25); const partial = state.weight('waist');
  assert.ok(partial > 0.03 && partial < 1);
  state.register(planReaction('chest', config.reaction.profiles.piercing, 1));
  assert.equal(state.weight('waist'), partial);
  state.step(1); assert.equal(state.weight('waist'), 1);
  state.register(planReaction('leftShin', config.reaction.profiles.impact, 1));
  state.clear(); assert.equal(state.weight('leftKnee'), 1);
  assert.throws(() => state.step(NaN));
  assert.throws(() => state.register([{ joint: 'waist', weight: -1, recoverySec: 0.1 }]));
});

test('配置拒绝缺箭型受击配置、负权重与无穷恢复时长', () => {
  for (const mutation of [(p: typeof pack) => { p.combat.reaction.profiles.impact.localWeight = -1; },
    (p: typeof pack) => { p.combat.reaction.profiles.normal.recoverySec = Infinity; },
    (p: typeof pack) => { delete (p.combat.reaction.profiles as Partial<typeof config.reaction.profiles>).piercing; }]) {
    const copy = structuredClone(pack); mutation(copy); assert.throws(() => validateSeedPack(copy));
  }
});


test('击退只分配一次总冲量，轻量肢体的局部速度受限', () => {
  for (const seed of config.arrows) for (const strength of [0, 0.5, 1]) {
    const arrow = applyDrawStrength(seed, strength, config.bowControl.minPowerRatio);
    for (const mass of [0.96, 1.92, 7.68]) {
      const split = splitHitImpulse(arrow.impulseNs, mass, config.reaction.localImpulseShare, config.reaction.maxLocalDeltaMps);
      assert.ok(Math.abs(split.localNs + split.torsoNs - arrow.impulseNs) < 1e-9);
      assert.ok(split.localNs / mass <= config.reaction.maxLocalDeltaMps);
      assert.ok(split.localNs > 0 && split.torsoNs > 0);
    }
  }
  assert.equal(config.reaction.playerMaxIncomingImpulseNs, 2.4, '敌箭增大的武器外观不放大玩家承受的冲量上限');
});
