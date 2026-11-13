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

/** Split ONE impulse budget. Small limbs keep a bounded local velocity kick; the remainder moves the torso. */
export function splitHitImpulse(totalNs: number, massKg: number, localShare: number, maxLocalDeltaMps: number) {
  const localNs = Math.min(totalNs * localShare, Math.max(0, massKg) * maxLocalDeltaMps);
  return { localNs, torsoNs: totalNs - localNs };
}

/** Preserve the hit's lever arm on the torso without a remote limb producing unbounded torque. */
export function transferredImpulsePoint(hit: { x: number; y: number }, center: { x: number; y: number }) {
  return { x: center.x + Math.max(-0.22, Math.min(0.22, hit.x - center.x)),
    y: center.y + Math.max(-0.3, Math.min(0.3, hit.y - center.y)) };
}

/** Let the impulse propagate through temporarily softer joints. */
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
    if (!r) return 1;
    // Give the real impulse 2–7 fixed steps before the motors start pulling back.
    const hold = Math.min(0.12, r.duration * 0.3);
    const t = Math.max(0, Math.min(1, (r.elapsed - hold) / (r.duration - hold)));
    return r.weight + (1 - r.weight) * t * t * (3 - 2 * t);
  }
  public clear(): void { this.active.clear(); }
}
