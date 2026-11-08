import type { SeedPack } from '../../../tools/config/schema.js';
import { randomUnit, validTime } from './BattleRules.js';

export interface Pickup { readonly id: number; readonly kind: 'red' | 'green'; readonly x: number; readonly y: number; readonly expiresAt: number }
/** Reachability and line-of-sight are supplied by the world, never guessed here. */
export class PickupRules {
  private elapsed = 0;
  private nextAt: number;
  private nextId = 1;
  private readonly alive = new Map<number, Pickup>();
  public constructor(private readonly rules: SeedPack['combat']['pickups'], private readonly random: () => number) {
    this.nextAt = this.interval();
  }
  public get snapshot(): readonly Pickup[] { return [...this.alive.values()].map(p => ({ ...p })); }
  public step(dt: number, active: boolean, chooseReachable: () => { x: number; y: number } | null): Pickup | null {
    validTime(dt);
    if (!active) return null;
    this.elapsed += dt;
    for (const p of this.alive.values()) if (p.expiresAt <= this.elapsed) this.alive.delete(p.id);
    if (this.elapsed + 1e-9 < this.nextAt) return null;
    this.nextAt = this.elapsed + this.interval(); // Do not catch up an old spawn backlog.
    if (this.alive.size >= this.rules.maxAlive) return null;
    const point = chooseReachable();
    if (!point || ![point.x, point.y].every(Number.isFinite)) return null;
    const p: Pickup = { ...point, id: this.nextId++, kind: randomUnit(this.random) < 0.5 ? 'red' : 'green', expiresAt: this.elapsed + this.rules.ttlSec };
    this.alive.set(p.id, p);
    return { ...p };
  }
  public collect(id: number, shooter: 'player' | 'enemy'): { hp: number; stamina: number } | null {
    const p = this.alive.get(id);
    if (!p || shooter !== 'player') return null;
    this.alive.delete(id);
    return { hp: p.kind === 'red' ? this.rules.redHp : 0, stamina: p.kind === 'green' ? this.rules.greenStamina : 0 };
  }
  public clear(): void { this.alive.clear(); }
  private interval(): number {
    const [lo, hi] = this.rules.spawnIntervalRangeSec;
    return lo + (hi - lo) * randomUnit(this.random);
  }
}
