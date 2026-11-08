import type { RigJointId } from '../physics/RigDefinition.js';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig.js';

export interface JointReaction { joint: RigJointId; weight: number; recoverySec: number }
type Profile = PhysicsLabConfig['reaction']['profiles']['normal'];
const groups: Readonly<Record<string, readonly [readonly RigJointId[], readonly RigJointId[]]>> = {
  head: [['neck'], ['waist']], chest: [['waist'], ['neck', 'leftHip', 'rightHip']],
  pelvis: [['waist', 'leftHip', 'rightHip'], ['leftKnee', 'rightKnee']],
  leftUpperArm: [['leftShoulder', 'leftElbow'], ['waist']],
  leftForearm: [['leftShoulder', 'leftElbow'], ['waist']],
  rightUpperArm: [['rightShoulder', 'rightElbow'], ['waist']],
  rightForearm: [['rightShoulder', 'rightElbow'], ['waist']],
  leftThigh: [['leftHip', 'leftKnee'], ['waist']], leftShin: [['leftHip', 'leftKnee'], ['waist']],
  rightThigh: [['rightHip', 'rightKnee'], ['waist']], rightShin: [['rightHip', 'rightKnee'], ['waist']],
};

/** Preserve per-arrow impulse. This only lets it propagate through temporarily softer joints. */
export function planReaction(partId: string, profile: Profile, effectiveStrength: number,
  playerArmRecovery?: readonly [number, number]): readonly JointReaction[] {
  const group = groups[partId];
  if (!group) return [];
  const strength = Number.isFinite(effectiveStrength) ? Math.max(0, Math.min(1, effectiveStrength)) : 0;
  if (strength === 0) return [];
  return group.flatMap((joints, index) => joints.map(joint => {
    const weight = index === 0 ? profile.localWeight : profile.neighborWeight;
    let recoverySec = (index === 0 ? profile.recoverySec : profile.neighborRecoverySec) * (0.5 + strength * 0.5);
    let controlWeight = 1 - (1 - weight) * strength;
    if (playerArmRecovery && (joint.endsWith('Shoulder') || joint.endsWith('Elbow'))) {
      recoverySec = Math.max(playerArmRecovery[0], Math.min(playerArmRecovery[1], recoverySec));
      controlWeight = Math.max(0.35, controlWeight);
    }
    return { joint, weight: controlWeight, recoverySec };
  }));
}

/** One bounded envelope per joint. A weak follow-up cannot erase an ongoing stronger hit. */
export class ReactionWeights {
  private readonly active = new Map<RigJointId, { weight: number; duration: number; elapsed: number }>();
  public register(reactions: readonly JointReaction[]): void {
    for (const r of reactions) {
      if (!Number.isFinite(r.weight) || r.weight < 0 || r.weight > 1 || !Number.isFinite(r.recoverySec) || r.recoverySec <= 0) throw new Error('无效受击参数');
    }
    for (const r of reactions) {
      const previous = this.active.get(r.joint);
      this.active.set(r.joint, { weight: Math.min(this.weight(r.joint), r.weight),
        duration: Math.max(previous ? previous.duration - previous.elapsed : 0, r.recoverySec), elapsed: 0 });
    }
  }
  public step(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('无效物理步时长');
    for (const [joint, r] of this.active) {
      r.elapsed += dt;
      if (r.elapsed + 1e-9 >= r.duration) this.active.delete(joint);
    }
  }
  public weight(joint: RigJointId): number {
    const r = this.active.get(joint);
    return r ? r.weight + (1 - r.weight) * Math.min(1, r.elapsed / r.duration) : 1;
  }
  public clear(): void { this.active.clear(); }
}
