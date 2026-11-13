export interface ResidueLimits {
  maxEmbeddedVisuals: number;
  maxEmbeddedPerActor: number;
  maxEmbeddedPerSurface: number;
  embeddedTtlSec: number;
  terrainEmbeddedTtlSec: number;
  embeddedFadeSec: number;
}
export interface ArrowResidue<T> { readonly target: string; readonly visual: T; readonly expiresAt: number }

/** Visual leases use simulation time: pause freezes them; eviction releases each visual once. */
export class ArrowResidues<T> {
  private entries: ArrowResidue<T>[] = [];
  public constructor(private readonly limits: ResidueLimits, private readonly release: (visual: T) => void) {}
  public get items(): readonly ArrowResidue<T>[] { return this.entries; }
  public get count(): number { return this.entries.length; }
  public add(target: string, terrain: boolean, visual: T, now: number): void {
    const perTarget = terrain ? this.limits.maxEmbeddedPerSurface : this.limits.maxEmbeddedPerActor;
    while (this.entries.filter(e => e.target === target).length >= perTarget) {
      this.remove(this.entries.findIndex(e => e.target === target));
    }
    while (this.entries.length >= this.limits.maxEmbeddedVisuals) this.remove(0);
    this.entries.push({ target, visual, expiresAt: now + (terrain ? this.limits.terrainEmbeddedTtlSec : this.limits.embeddedTtlSec) });
  }
  public prune(now: number, valid: (visual: T) => boolean): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (now >= e.expiresAt || !valid(e.visual)) this.remove(i);
    }
  }
  public removeTarget(target: string): void {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]!.target === target) this.remove(i);
  }
  public clear(): void {
    const entries = this.entries; this.entries = [];
    for (const e of entries) this.release(e.visual);
  }
  public opacity(entry: ArrowResidue<T>, now: number): number {
    const t = Math.max(0, Math.min(1, (entry.expiresAt - now) / this.limits.embeddedFadeSec));
    return t * t * (3 - 2 * t);
  }
  private remove(index: number): void {
    const [entry] = this.entries.splice(index, 1);
    if (entry) this.release(entry.visual);
  }
}

export interface TrailPoint { x: number; y: number }

/** Pure visual tip travel and shaft vibration; never adds a second physics impulse. */
export function embeddedArrowPose(ageSec: number, impulseNs: number, terrain: boolean) {
  const age = Math.max(0, ageSec), strength = Math.max(0, Math.min(1, impulseNs / 22));
  const depth = terrain ? 0.025 + 0.02 * strength : 0.07 + 0.09 * strength;
  const sink = Math.min(1, age / 0.045), life = terrain ? 0.22 : 0.32;
  const envelope = Math.max(0, 1 - age / life) ** 2;
  return { penetrationM: depth * (1 - (1 - sink) ** 3),
    angleRad: age >= life ? 0 : Math.sin(age * Math.PI * 2 * (terrain ? 23 : 17)) * envelope * (0.045 + 0.075 * strength) };
}

/** Render-only retirement envelope, evaluated in simulation time. Native cleanup still owns the lifetime. */
export function retirementOpacity(ageSec: number, lifetimeSec: number): number {
  const remaining = Math.max(0, Math.min(1, (lifetimeSec - ageSec) / Math.min(0.6, lifetimeSec)));
  return remaining * remaining * (3 - 2 * remaining);
}

export function highlightOpacity(expiresAt: number, now: number): number {
  const remaining = Math.max(0, Math.min(1, (expiresAt - now) / 0.18));
  return remaining * remaining;
}

export interface ImpactMark { readonly shotId: number; readonly point: TrailPoint; readonly directionRad: number; readonly tier: 1 | 2 | 3; age: number; readonly duration: number }
/** One event hook, bounded visual marks, no forces, wall timers, time scaling or camera motion. */
export class ImpactFeedback {
  private marks: ImpactMark[] = [];
  private readonly recent: number[] = [];
  public get items(): readonly ImpactMark[] { return this.marks; }
  public hit(shotId: number, point: TrailPoint, directionRad: number, tier: 1 | 2 | 3): void {
    if (this.recent.includes(shotId) || ![point.x, point.y, directionRad].every(Number.isFinite)) return;
    this.recent.push(shotId); if (this.recent.length > 64) this.recent.shift();
    if (this.marks.length >= 12) this.marks.shift();
    this.marks.push({ shotId, point: { ...point }, directionRad, tier, age: 0, duration: tier === 3 ? 0.26 : tier === 2 ? 0.22 : 0.16 });
  }
  public step(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid impact timestep');
    for (const mark of this.marks) mark.age += dt;
    this.marks = this.marks.filter(mark => mark.age + 1e-9 < mark.duration);
  }
  public clear(): void { this.marks = []; this.recent.length = 0; }
  public sample(mark: ImpactMark) {
    const t = Math.max(0, Math.min(1, mark.age / mark.duration)), ease = 1 - (1 - t) ** 3;
    return { radius: (mark.tier === 3 ? 0.55 : mark.tier === 2 ? 0.43 : 0.28) * (0.4 + 0.6 * ease), opacity: (1 - t) ** 2 };
  }
}
/** Newest-first ribbon, clipped by real travelled distance; never draws a full aim prediction. */
export function shortFlightTrail(points: readonly TrailPoint[], maxLengthM = 0.85): TrailPoint[] {
  if (!points.length || maxLengthM <= 0) return [];
  const result = [{ ...points[points.length - 1]! }];
  let remaining = maxLengthM;
  for (let i = points.length - 2; i >= 0 && remaining > 0; i--) {
    const a = result[result.length - 1]!, b = points[i]!, distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 1e-7) continue;
    const fraction = Math.min(1, remaining / distance);
    result.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
    remaining -= distance;
  }
  return result;
}
