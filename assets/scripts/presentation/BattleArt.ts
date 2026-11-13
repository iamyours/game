import { Color, type Graphics } from 'cc';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';

/** Code-native stone/bronze family. All solid-looking art stays inside the existing collider. */
export function drawRuinsPlatform(g: Graphics, widthM: number, hero = false): void {
  const half = widthM / 2;
  const rect = (x: number, y: number, w: number, h: number, hex: string) => {
    g.fillColor = new Color().fromHEX(hex); g.rect(P.units(x), P.units(y), P.units(w), P.units(h)); g.fill();
  };
  rect(-half, -0.3, widthM, 0.6, '#304A59');
  rect(-half, 0.21, widthM, 0.09, '#A5B7B5');
  rect(-half, 0.12, widthM, 0.09, '#607D86');
  rect(-half, -0.3, widthM, 0.10, '#142C3B');
  rect(-half + 0.07, -0.2, widthM - 0.14, 0.025, '#78919A');
  g.strokeColor = new Color().fromHEX('#152F3E'); g.lineWidth = P.units(0.025);
  for (let x = -half + 0.52; x < half - 0.15; x += 0.73) {
    g.moveTo(P.units(x), P.units(0.12)); g.lineTo(P.units(x - 0.06), P.units(-0.04)); g.lineTo(P.units(x + 0.04), P.units(-0.19));
  }
  g.stroke();
  for (const x of [-half + 0.16, half - 0.16]) {
    rect(x - 0.045, -0.2, 0.09, 0.4, '#AD8858');
    rect(x - 0.016, -0.12, 0.032, 0.23, '#EBC689');
  }
  // A restrained inlaid rune links the arena to the hero's cyan/amber weapon.
  const r = Math.min(0.13, widthM * 0.08), cy = -0.02;
  g.strokeColor = new Color().fromHEX(hero ? '#83D8DF' : '#B4C6C6'); g.lineWidth = P.units(0.024);
  g.moveTo(0, P.units(cy + r)); g.lineTo(P.units(r), P.units(cy));
  g.lineTo(0, P.units(cy - r)); g.lineTo(P.units(-r), P.units(cy)); g.close(); g.stroke();
}

export function drawImpactMark(g: Graphics, point: { x: number; y: number }, directionRad: number,
  radius: number, opacity: number, tier: number): void {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 210);
  g.strokeColor = tier >= 2 ? new Color(255, 211, 128, alpha) : new Color(245, 189, 105, alpha);
  g.lineWidth = P.units(tier >= 2 ? 0.035 : 0.024);
  const count = tier === 3 ? 8 : tier === 2 ? 6 : 4;
  for (let i = 0; i < count; i++) {
    const angle = directionRad + Math.PI * 2 * i / count, inner = radius * 0.45;
    g.moveTo(P.units(point.x + Math.cos(angle) * inner), P.units(point.y + Math.sin(angle) * inner));
    g.lineTo(P.units(point.x + Math.cos(angle) * radius), P.units(point.y + Math.sin(angle) * radius));
  }
  g.stroke();
  if (tier >= 2) { g.circle(P.units(point.x), P.units(point.y), P.units(radius * 0.55)); g.stroke(); }
}

export function drawChargeCue(g: Graphics, head: { x: number; y: number }): void {
  g.strokeColor = new Color(247, 198, 111, 255); g.lineWidth = P.units(0.045);
  g.moveTo(P.units(head.x - 0.12), P.units(head.y + 0.72));
  g.lineTo(P.units(head.x), P.units(head.y + 0.59));
  g.lineTo(P.units(head.x + 0.12), P.units(head.y + 0.72)); g.stroke();
}
