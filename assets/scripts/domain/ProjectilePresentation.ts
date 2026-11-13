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
