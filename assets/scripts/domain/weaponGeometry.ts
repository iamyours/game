import type { PointM } from './archery';

export interface BowArtSpec {
  imageSize: readonly [number, number]; rect: readonly [number, number, number, number];
  grip: readonly [number, number]; upperTip: readonly [number, number]; lowerTip: readonly [number, number]; strips: number;
}
export interface ArrowArtSpec { imageSize: readonly [number, number]; rect: readonly [number, number, number, number] }
export interface ThunderArtSpec { bow: BowArtSpec; arrow: ArrowArtSpec }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function validateThunderArt(spec: ThunderArtSpec): void {
  for (const part of [spec.bow, spec.arrow]) {
    const [x, y, w, h] = part.rect;
    if (![...part.imageSize, ...part.rect].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 ||
      x + w > part.imageSize[0] || y + h > part.imageSize[1]) throw new Error('雷霆武器切片越界');
  }
  const b = spec.bow;
  const [bx, by, bw, bh] = b.rect;
  const anchorsInside = [b.grip, b.upperTip, b.lowerTip].every(([x, y]) => x >= bx && x <= bx + bw && y >= by && y <= by + bh);
  if (!anchorsInside || ![...b.grip, ...b.upperTip, ...b.lowerTip].every(Number.isFinite) || !Number.isInteger(b.strips) || b.strips < 16 || b.strips > 64 ||
    b.upperTip[1] >= b.grip[1] || b.lowerTip[1] <= b.grip[1] || Math.abs((b.upperTip[0] + b.lowerTip[0]) / 2 - b.grip[0]) < 1) {
    throw new Error('雷霆弓握点或弦端点无效');
  }
}

/** Authored sprite pixels -> bow-local metres. Positive x is the actual firing direction. */
export function bowArtPoint(pixel: readonly [number, number], spec: BowArtSpec, halfHeightM: number, braceDepthM: number, flex: number): PointM {
  const sy = halfHeightM * 2 / (spec.lowerTip[1] - spec.upperTip[1]);
  const sx = braceDepthM * 0.8 / ((spec.upperTip[0] + spec.lowerTip[0]) / 2 - spec.grip[0]);
  const y = (spec.grip[1] - pixel[1]) * sy;
  const t = clamp((Math.abs(y) - 0.12) / Math.max(0.01, halfHeightM - 0.12), 0, 1);
  const ease = t * t * (3 - 2 * t), bend = clamp(flex, -0.4, 1);
  return { x: -(pixel[0] - spec.grip[0]) * sx - halfHeightM * 0.3 * bend * ease,
    y: y - Math.sign(y) * halfHeightM * 0.08 * bend * ease };
}

/** Adjacent strips share the same deformed vertical boundary; one source pixel overlap hides filtering seams. */
export function bowArtStrip(index: number, spec: BowArtSpec, halfHeightM: number, braceDepthM: number, flex: number) {
  const [x, y, w, h] = spec.rect;
  const top = Math.max(y, Math.floor(y + h * index / spec.strips) - 1);
  const bottom = Math.min(y + h, Math.floor(y + h * (index + 1) / spec.strips) + 1);
  const a = bowArtPoint([x + w / 2, top], spec, halfHeightM, braceDepthM, flex);
  const b = bowArtPoint([x + w / 2, bottom], spec, halfHeightM, braceDepthM, flex);
  const sx = braceDepthM * 0.8 / ((spec.upperTip[0] + spec.lowerTip[0]) / 2 - spec.grip[0]);
  const baseHeightM = (bottom - top) * halfHeightM * 2 / (spec.lowerTip[1] - spec.upperTip[1]);
  return { rect: [x, top, w, bottom - top] as const, xM: (a.x + b.x) / 2, yM: (a.y + b.y) / 2,
    widthM: w * sx, heightM: a.y - b.y, baseHeightM,
    shearX: (a.x - b.x) / baseHeightM, verticalScale: (a.y - b.y) / baseHeightM };
}

/** SVD: R(parent) * Scale * R(child) exactly expresses a continuous shear using public visual-node APIs. */
export function spriteShear(shearX: number, verticalScale: number) {
  if (!Number.isFinite(shearX) || !Number.isFinite(verticalScale) || verticalScale <= 0) throw new Error('无效弓臂变形');
  const aa = 1, dd = shearX * shearX + verticalScale * verticalScale;
  const theta = Math.atan2(2 * shearX, aa - dd) / 2;
  const eigen = (aa + dd + Math.hypot(aa - dd, 2 * shearX)) / 2;
  const scaleX = Math.sqrt(eigen), scaleY = verticalScale / scaleX;
  const rotationRad = Math.atan2(verticalScale * Math.sin(theta), Math.cos(theta) + shearX * Math.sin(theta));
  return { rotationRad, childRotationRad: -theta, scaleX, scaleY };
}

/** Rendering follows the real pulling hand, never bending ahead of the motor-driven arm. */
export function handDrawFlex(socket: PointM & { angleRad: number }, hand: PointM, braceDepthM: number, travelM: number, requested: number): number {
  const pull = (socket.x - hand.x) * Math.cos(socket.angleRad) + (socket.y - hand.y) * Math.sin(socket.angleRad);
  return Math.min(clamp(requested, 0, 1), clamp((pull - braceDepthM) / travelM, 0, 1));
}

/** A rigid shaft keeps its length; the same point is used for the ready sprite and the physical launch. */
export function nockedArrowTip(hand: PointM, angleRad: number, lengthM: number): PointM {
  return { x: hand.x + Math.cos(angleRad) * lengthM, y: hand.y + Math.sin(angleRad) * lengthM };
}
