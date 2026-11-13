import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import { resolveDamage, lethalHeadshot, type DamageResult } from '../domain/damage';
import { planReaction, splitHitImpulse, transferredImpulsePoint, type JointReaction } from '../domain/reaction';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import type { HitCandidate } from './ProjectileSystem';
import type { RigidBody2D } from 'cc';

type Zone = 'head' | 'torso' | 'limb';
export interface ActorCombatState {
  readonly id: string;
  hp: number;
  armor: number;
  hits: number;
  lastHit: (HitCandidate & { result: DamageResult; zone: Zone; impulseNs: number; localImpulseNs: number; torsoImpulseNs: number; jointReaction: readonly JointReaction[] }) | null;
}

/** Runtime damage and one shared local/torso impulse budget, applied only after a physics step. */
export class HitResolver {
  public constructor(private readonly states: ReadonlyMap<string, ActorCombatState>, private readonly config: PhysicsLabConfig,
    private readonly onReaction: (state: ActorCombatState, partId: string) => void,
    private readonly lethalEnemyHeadshots = false,
    private readonly torsoForActor: (id: string) => RigidBody2D | undefined = () => undefined,
    private readonly allowsInstantHeadshot: (id: string) => boolean = () => true) {}

  public resolve(candidate: HitCandidate, targetBody: RigidBody2D): void {
    const state = this.states.get(candidate.targetId);
    if (!state || state.hp <= 0) return;
    const zone: Zone = candidate.partId === 'head' ? 'head' : ['chest', 'pelvis'].includes(candidate.partId) ? 'torso' : 'limb';
    let result = resolveDamage({ baseDamage: candidate.arrow.baseDamage, zoneMultiplier: this.config.damage.zoneMultipliers[zone],
      armor: zone === 'head' ? state.armor : 0, armorDamageFactor: candidate.arrow.armorDamageFactor, armorOverflow: candidate.arrow.armorOverflow });
    if (zone === 'head') state.armor = result.remainingArmor;
    result = lethalHeadshot(result, state.hp, this.lethalEnemyHeadshots && state.id !== 'PlayerRagdoll' && zone === 'head' && this.allowsInstantHeadshot(state.id));
    state.hp = Math.max(0, state.hp - result.hpDamage);
    state.hits += 1;
    const { x, y } = candidate.incomingVelocityMps;
    const length = Math.hypot(x, y);
    const impulseNs = length > 0 ? Math.min(candidate.arrow.impulseNs, this.config.reaction.maxSingleImpulseNs,
      state.id === 'PlayerRagdoll' ? this.config.reaction.playerMaxIncomingImpulseNs : Infinity) : 0;
    const torso = this.torsoForActor(state.id);
    const split = torso && torso !== targetBody
      ? splitHitImpulse(impulseNs, targetBody.getMass(), this.config.reaction.localImpulseShare, this.config.reaction.maxLocalDeltaMps)
      : { localNs: impulseNs, torsoNs: 0 };
    if (length > 0) {
      Physics.applyImpulse(targetBody, x / length * split.localNs, y / length * split.localNs, candidate.pointM.x, candidate.pointM.y);
      if (torso && split.torsoNs > 0) {
        const center = Physics.pointM(torso.getWorldCenter({ x: 0, y: 0 }));
        const point = transferredImpulsePoint(candidate.pointM, center);
        Physics.applyImpulse(torso, x / length * split.torsoNs, y / length * split.torsoNs, point.x, point.y);
      }
    }
    const seed = this.config.arrows.find(a => a.id === candidate.arrow.id)!;
    const jointReaction = planReaction(candidate.partId, this.config.reaction.profiles[candidate.arrow.id],
      impulseNs / seed.impulseNs, state.id === 'PlayerRagdoll' ? this.config.player.armRecoveryRangeSec : undefined);
    state.lastHit = { ...candidate, result, zone, impulseNs, localImpulseNs: split.localNs, torsoImpulseNs: split.torsoNs, jointReaction };
    this.onReaction(state, candidate.partId);
  }
}
