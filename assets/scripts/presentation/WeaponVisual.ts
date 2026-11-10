import { Color, type Graphics } from 'cc';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import type { PointM } from '../domain/archery';
import { nockedArrowTip } from '../domain/weaponGeometry';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';

// All coordinates are metres. Only visual paths change; the grip and physical arrow tip stay fixed.
export const WEAPON_STYLES = {
  normal: { color: '#F7C66F', edge: '#FFF1BE', limbWidth: 0.085, arrowLength: 0.96, headLength: 0.19, headWidth: 0.09 },
  impact: { color: '#F29983', edge: '#FFE1CC', limbWidth: 0.12, arrowLength: 1.02, headLength: 0.23, headWidth: 0.14 },
  piercing: { color: '#BCAEF6', edge: '#EDE8FF', limbWidth: 0.07, arrowLength: 1.1, headLength: 0.29, headWidth: 0.065 },
} as const;
export type WeaponKind = keyof typeof WEAPON_STYLES;
const styleFor = (id: string) => WEAPON_STYLES[id as WeaponKind] ?? WEAPON_STYLES.normal;
const tint = (hex: string) => new Color().fromHEX(hex);

/** Shared by ready, flying and embedded arrows. The tip is the exact same collision point. */
export function drawWeaponArrow(g: Graphics, id: string, tip: PointM, angleRad: number, lengthM: number = styleFor(id).arrowLength): void {
  const s = styleFor(id), dx = Math.cos(angleRad), dy = Math.sin(angleRad);
  const p = (x: number, y: number) => ({ x: P.units(tip.x + dx * x - dy * y), y: P.units(tip.y + dy * x + dx * y) });
  const line = (a: PointM, b: PointM) => { g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); };
  const tail = p(-lengthM, 0), head = p(-s.headLength * 0.7, 0);
  g.strokeColor = tint('#263746'); g.lineWidth = P.units(0.075); line(tail, head); g.stroke();
  g.strokeColor = tint(s.edge); g.lineWidth = P.units(0.035); line(tail, head); g.stroke();
  // Two broad feathers keep the shaft legible at the full battlefield camera scale.
  for (const side of [-1, 1]) {
    const a = p(-lengthM + 0.025, 0), b = p(-lengthM + 0.08, side * 0.1),
      c = p(-lengthM + 0.27, side * 0.07), d = p(-lengthM + 0.21, 0);
    g.fillColor = tint(s.color); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.close(); g.fill();
  }
  const nose = p(0, 0), upper = p(-s.headLength, s.headWidth), lower = p(-s.headLength, -s.headWidth);
  g.fillColor = tint(s.color); g.moveTo(nose.x, nose.y);
  if (id === 'impact') { const shoulder = p(-0.045, s.headWidth); g.lineTo(shoulder.x, shoulder.y); }
  g.lineTo(upper.x, upper.y);
  const inset = p(-s.headLength * 0.76, 0); g.lineTo(inset.x, inset.y);
  g.lineTo(lower.x, lower.y);
  if (id === 'impact') { const shoulder = p(-0.045, -s.headWidth); g.lineTo(shoulder.x, shoulder.y); }
  g.close(); g.fill();
  g.strokeColor = tint(s.edge); g.lineWidth = P.units(0.018); line(nose, inset); g.stroke();
}

/** Bends both limbs about the real grip. Recoil may briefly bend them forward after release. */
export function drawWeaponBow(g: Graphics, socket: PointM & { angleRad: number }, bow: PhysicsLabConfig['bowControl'],
  id: string, flex: number, stringGrip?: PointM, nockedTipOffsetM?: number): void {
  const s = styleFor(id), bend = Math.max(-0.4, Math.min(1, flex)), dx = Math.cos(socket.angleRad), dy = Math.sin(socket.angleRad);
  const p = (f: number, a: number) => ({ x: P.units(socket.x + dx * f - dy * a), y: P.units(socket.y + dy * f + dx * a) });
  const half = bow.bowHalfHeightM * (id === 'impact' ? 0.94 : id === 'piercing' ? 1.07 : 1);
  const tipX = -bow.braceDepthM * 0.38 - 0.22 * bend, tipY = half * (1 - 0.14 * bend);
  const top = p(tipX, tipY), bottom = p(tipX, -tipY);
  const nock = stringGrip ? { x: P.units(stringGrip.x), y: P.units(stringGrip.y) } : p(tipX, 0);
  g.strokeColor = tint('#263746'); g.lineWidth = P.units(s.limbWidth + 0.04);
  const limbs = () => {
    for (const side of [-1, 1]) {
      const root = p(0, side * 0.07), knee = p(-0.08 - 0.1 * bend, side * tipY * 0.63), tip = side === 1 ? top : bottom;
      g.moveTo(root.x, root.y);
      if (id === 'impact') { g.lineTo(knee.x, knee.y); g.lineTo(tip.x, tip.y); }
      else { const outer = p(-0.42 - 0.22 * bend, side * tipY * 0.83); g.bezierCurveTo(knee.x, knee.y, outer.x, outer.y, tip.x, tip.y); }
    }
    g.stroke();
  };
  limbs(); g.strokeColor = tint(s.color); g.lineWidth = P.units(s.limbWidth); limbs();
  g.strokeColor = tint(s.edge); g.lineWidth = P.units(0.022); limbs();
  g.strokeColor = tint('#EAF4F7'); g.lineWidth = P.units(0.022);
  g.moveTo(top.x, top.y); g.lineTo(nock.x, nock.y); g.lineTo(bottom.x, bottom.y); g.stroke();
  // Wrapped grip at the physical bow-hand socket.
  const gripA = p(0, -0.1), gripB = p(0, 0.1);
  g.strokeColor = tint('#694D40'); g.lineWidth = P.units(0.11); g.moveTo(gripA.x, gripA.y); g.lineTo(gripB.x, gripB.y); g.stroke();
  if (nockedTipOffsetM !== undefined && stringGrip) {
    const tip = nockedArrowTip(stringGrip, socket.angleRad, styleFor(id).arrowLength);
    drawWeaponArrow(g, id, tip, socket.angleRad);
  }
}
