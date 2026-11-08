import type { RigDefinition } from '../physics/RigDefinition.js';

export interface PointM { readonly x: number; readonly y: number }
export type ArmSide = 'left' | 'right';
export interface ArmGeometry {
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

/** Link vectors come from the same anchors as native hinges, not sprite bounds. */
export function armGeometry(rig: RigDefinition, side: ArmSide): ArmGeometry {
  const shoulder = rig.jointDefinitions.find(j => j.id === `${side}Shoulder`)!;
  const elbow = rig.jointDefinitions.find(j => j.id === `${side}Elbow`)!;
  const gripLocalM = [side === 'right' ? 0.12 : -0.12, -0.07] as const;
  const upper = { x: elbow.parentAnchorM[0] - shoulder.childAnchorM[0],
    y: elbow.parentAnchorM[1] - shoulder.childAnchorM[1] };
  const fore = { x: gripLocalM[0] - elbow.childAnchorM[0], y: gripLocalM[1] - elbow.childAnchorM[1] };
  return { shoulderAnchorM: shoulder.parentAnchorM, gripLocalM,
    upperLengthM: Math.hypot(upper.x, upper.y), foreLengthM: Math.hypot(fore.x, fore.y),
    upperRestRad: Math.atan2(upper.y, upper.x), foreRestRad: Math.atan2(fore.y, fore.x),
    shoulderLimitsRad: [rad(shoulder.limitsDeg[0]), rad(shoulder.limitsDeg[1])],
    elbowLimitsRad: [rad(elbow.limitsDeg[0]), rad(elbow.limitsDeg[1])] };
}

/** Positive anatomical elbow branch, with a little bend retained at full reach. */
export function solveArm(g: ArmGeometry, shoulder: PointM, target: PointM, chestRad: number) {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  const a = g.upperLengthM, b = g.foreLengthM;
  const restBend = wrapRad(g.foreRestRad - g.upperRestRad);
  const bend = Math.acos(clamp((dx * dx + dy * dy - a * a - b * b) / (2 * a * b), -1, 1));
  const elbowRad = clamp(bend - restBend, Math.max(rad(8), g.elbowLimitsRad[0]), Math.min(rad(145), g.elbowLimitsRad[1]));
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
