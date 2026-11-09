import type { RigDefinition, RigBodyDefinition, RigJointId } from '../physics/RigDefinition.js';

export interface PointM { readonly x: number; readonly y: number }
export type ArmSide = 'left' | 'right';
export type PhysicalPose = 'standing' | 'staggered' | 'downed';

/** A release-only damped spring; cancellation never calls this animation. */
export function bowReleaseFlex(strength: number, elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0 || elapsedSec >= 0.35) return 0;
  return Math.max(0, Math.min(1, strength)) * Math.exp(-15 * elapsedSec) * Math.cos(52 * elapsedSec);
}

/** A limited hinge must take the legal interval route, not a wrapped shortcut through its stops. */
export function limitedJointMotorSpeed(currentDeg: number, targetDeg: number,
  limitsDeg: readonly [number, number], maxSpeedDegPerSec: number): number {
  if (![currentDeg, targetDeg, ...limitsDeg, maxSpeedDegPerSec].every(Number.isFinite) ||
    limitsDeg[0] > limitsDeg[1] || maxSpeedDegPerSec < 0) throw new Error('无效关节驱动参数');
  const target = Math.max(limitsDeg[0], Math.min(limitsDeg[1], targetDeg));
  const error = target - currentDeg;
  if (maxSpeedDegPerSec === 0 || error === 0) return 0;
  return Math.max(-maxSpeedDegPerSec, Math.min(maxSpeedDegPerSec, error * 7));
}

export function postureMotorAuthority(joint: RigJointId, pose: PhysicalPose, alive: boolean): number {
  if (!alive) return 0;
  if (pose !== 'downed') return 1;
  return joint.endsWith('Shoulder') || joint.endsWith('Elbow') ? 0.8 : 0;
}
export interface ArmGeometry {
  readonly bendSign: 1 | -1;
  readonly shoulderAnchorM: readonly [number, number];
  readonly gripLocalM: readonly [number, number];
  readonly upperLengthM: number;
  readonly foreLengthM: number;
  readonly upperRestRad: number;
  readonly foreRestRad: number;
  readonly shoulderLimitsRad: readonly [number, number];
  readonly elbowLimitsRad: readonly [number, number];
}
const rad = (v: number) => v * Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const wrapRad = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));

/** A short direction hint, never a full landing solution. Matches fixed-step gravity. */
export const AIM_HINT_SECONDS = 0.15;
export function aimHintPoints(socket: PointM, angleRad: number, speedMps: number,
  gravityMps2: readonly [number, number], fixedStepSec: number, tipOffsetM: number): readonly PointM[] {
  return Array.from({ length: 5 }, (_, i) => {
    const t = AIM_HINT_SECONDS * (i + 1) / 5;
    const reach = tipOffsetM + speedMps * t;
    const gravityTime = t * (t + fixedStepSec) / 2;
    return { x: socket.x + Math.cos(angleRad) * reach + gravityMps2[0] * gravityTime,
      y: socket.y + Math.sin(angleRad) * reach + gravityMps2[1] * gravityTime };
  });
}

/** Link vectors come from the same anchors as native hinges, not sprite bounds. */
export function armGeometry(rig: RigDefinition, side: ArmSide): ArmGeometry {
  const shoulder = rig.jointDefinitions.find(j => j.id === `${side}Shoulder`)!;
  const elbow = rig.jointDefinitions.find(j => j.id === `${side}Elbow`)!;
  const gripLocalM = [(side === 'right' ? 0.12 : -0.12) * (rig.facing ?? 1), -0.07] as const;
  const upper = { x: elbow.parentAnchorM[0] - shoulder.childAnchorM[0],
    y: elbow.parentAnchorM[1] - shoulder.childAnchorM[1] };
  const fore = { x: gripLocalM[0] - elbow.childAnchorM[0], y: gripLocalM[1] - elbow.childAnchorM[1] };
  return { bendSign: rig.facing ?? 1, shoulderAnchorM: shoulder.parentAnchorM, gripLocalM,
    upperLengthM: Math.hypot(upper.x, upper.y), foreLengthM: Math.hypot(fore.x, fore.y),
    upperRestRad: Math.atan2(upper.y, upper.x), foreRestRad: Math.atan2(fore.y, fore.x),
    shoulderLimitsRad: [rad(shoulder.limitsDeg[0]), rad(shoulder.limitsDeg[1])],
    elbowLimitsRad: [rad(elbow.limitsDeg[0]), rad(elbow.limitsDeg[1])] };
}

/** Sprite +Y runs from distal to proximal. Align it to the SAME anchors used by IK. */
export function armVisualLayout(rig: RigDefinition, body: RigBodyDefinition) {
  const side: ArmSide = body.id.startsWith('left') ? 'left' : 'right';
  if (!body.id.endsWith('UpperArm') && !body.id.endsWith('Forearm')) return null;
  const shoulder = rig.jointDefinitions.find(j => j.id === `${side}Shoulder`)!;
  const elbow = rig.jointDefinitions.find(j => j.id === `${side}Elbow`)!;
  const proximal = body.id.endsWith('UpperArm') ? shoulder.childAnchorM : elbow.childAnchorM;
  const distal = body.id.endsWith('UpperArm') ? elbow.parentAnchorM : armGeometry(rig, side).gripLocalM;
  const dx = distal[0] - proximal[0], dy = distal[1] - proximal[1];
  const lengthM = Math.hypot(dx, dy);
  return { proximal, distal, xM: (proximal[0] + distal[0]) / 2, yM: (proximal[1] + distal[1]) / 2,
    angleRad: Math.atan2(dy, dx) + Math.PI / 2, widthM: body.sizeM[0],
    heightM: lengthM + body.sizeM[0] * 0.4, lengthM };
}

/** Positive anatomical elbow branch, with a little bend retained at full reach. */
export function solveArm(g: ArmGeometry, shoulder: PointM, target: PointM, chestRad: number) {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  const a = g.upperLengthM, b = g.foreLengthM;
  const restBend = wrapRad(g.foreRestRad - g.upperRestRad);
  const bend = Math.acos(clamp((dx * dx + dy * dy - a * a - b * b) / (2 * a * b), -1, 1));
  const elbowRad = clamp(g.bendSign * bend - restBend,
    Math.max(rad(g.bendSign === 1 ? 8 : -145), g.elbowLimitsRad[0]),
    Math.min(rad(g.bendSign === 1 ? 145 : -8), g.elbowLimitsRad[1]));
  const actualBend = elbowRad + restBend;
  const upperRad = Math.atan2(dy, dx) - Math.atan2(b * Math.sin(actualBend), a + b * Math.cos(actualBend));
  const shoulderRad = clamp(wrapRad(upperRad - g.upperRestRad - chestRad), ...g.shoulderLimitsRad);
  const u = chestRad + shoulderRad + g.upperRestRad, f = u + actualBend;
  const reached = { x: shoulder.x + a * Math.cos(u) + b * Math.cos(f),
    y: shoulder.y + a * Math.sin(u) + b * Math.sin(f) };
  return { shoulderRad, elbowRad, reached, errorM: Math.hypot(reached.x - target.x, reached.y - target.y) };
}

/** One launch rule shared by live arrows and trajectory preview; full draw preserves seed balance. */
export function applyDrawStrength<T extends { speedMps: number; impulseNs: number; baseDamage: number }>(
  arrow: T, strength: number, minPowerRatio: number,
): T {
  const draw = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  const ratio = minPowerRatio + (1 - minPowerRatio) * draw;
  return { ...arrow, speedMps: arrow.speedMps * ratio, impulseNs: arrow.impulseNs * ratio,
    baseDamage: arrow.baseDamage * ratio };
}
