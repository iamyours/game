import { Color, type Graphics } from 'cc';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import { BOWS, type SkillMark } from '../domain/BattleLoadout';

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

/** Short local spell shapes follow actual casts and hits; no fake flight path or added physical force. */
export function drawSkillMark(g: Graphics, mark: SkillMark): void {
  const t = Math.max(0, Math.min(1, mark.age / mark.duration)), radius = (mark.hit ? 0.85 : 0.5) * (0.4 + t * 0.6);
  const tint = new Color().fromHEX(mark.kind === 'rune' ? '#FFDA78' : BOWS[mark.kind].tint);
  tint.a = Math.round(230 * (1 - t) ** 2); g.strokeColor = tint; g.lineWidth = P.units(0.035);
  const { x, y } = mark.point;
  g.circle(P.units(x), P.units(y), P.units(radius)); g.stroke();
  if (mark.kind === 'thunder') {
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + 0.3;
      const point = (r: number, off: number) => ({ x: x + Math.cos(angle + off) * r, y: y + Math.sin(angle + off) * r });
      const a = point(radius * 0.3, 0), b = point(radius * 0.6, 0.3), c = point(radius, 0);
      g.moveTo(P.units(a.x), P.units(a.y)); g.lineTo(P.units(b.x), P.units(b.y)); g.lineTo(P.units(c.x), P.units(c.y));
    }
    g.stroke();
  } else if (mark.kind === 'moon') {
    g.circle(P.units(x + radius * 0.25), P.units(y), P.units(radius * 0.7)); g.stroke();
    g.moveTo(P.units(x - radius), P.units(y - radius * 0.4)); g.lineTo(P.units(x + radius), P.units(y + radius * 0.4)); g.stroke();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + t;
      g.moveTo(P.units(x + Math.cos(a) * radius * 0.45), P.units(y + Math.sin(a) * radius * 0.45));
      g.lineTo(P.units(x + Math.cos(a + 0.35) * radius), P.units(y + Math.sin(a + 0.35) * radius));
    }
    g.stroke();
  }
}
