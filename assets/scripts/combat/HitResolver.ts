import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import { resolveDamage, type DamageResult } from '../domain/damage';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import type { HitCandidate } from './ProjectileSystem';
import type { RigidBody2D } from 'cc';

type Zone = 'head' | 'torso' | 'limb';
export interface ActorCombatState {
  readonly id: string;
  hp: number;
  armor: number;
  hits: number;
  lastHit: (HitCandidate & { result: DamageResult; zone: Zone; impulseNs: number }) | null;
}

/** Runtime damage and one local impulse, applied only after a physics step. */
export class HitResolver {
  public constructor(private readonly states: ReadonlyMap<string, ActorCombatState>, private readonly config: PhysicsLabConfig,
    private readonly onReaction: (state: ActorCombatState, partId: string) => void) {}

  public resolve(candidate: HitCandidate, targetBody: RigidBody2D): void {
    const state = this.states.get(candidate.targetId);
    if (!state || state.hp <= 0) return;
    const zone: Zone = candidate.partId === 'head' ? 'head' : ['chest', 'pelvis'].includes(candidate.partId) ? 'torso' : 'limb';
    const result = resolveDamage({ baseDamage: candidate.arrow.baseDamage, zoneMultiplier: this.config.damage.zoneMultipliers[zone],
      armor: zone === 'head' ? state.armor : 0, armorDamageFactor: candidate.arrow.armorDamageFactor, armorOverflow: candidate.arrow.armorOverflow });
    if (zone === 'head') state.armor = result.remainingArmor;
    state.hp = Math.max(0, state.hp - result.hpDamage);
    state.hits += 1;
    const { x, y } = candidate.incomingVelocityMps;
    const length = Math.hypot(x, y);
    const impulseNs = length > 0 ? Math.min(candidate.arrow.impulseNs, this.config.reaction.maxSingleImpulseNs,
      state.id === 'PlayerRagdoll' ? this.config.reaction.playerMaxIncomingImpulseNs : Infinity) : 0;
    if (length > 0) Physics.applyImpulse(targetBody, x / length * impulseNs, y / length * impulseNs, candidate.pointM.x, candidate.pointM.y);
    state.lastHit = { ...candidate, result, zone, impulseNs };
    this.onReaction(state, candidate.partId);
  }
}
