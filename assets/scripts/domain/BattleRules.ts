import type { SeedPack } from '../../../tools/config/schema.js';

type Combat = SeedPack['combat'];
type Arrow = Combat['arrows'][number];
export type ShotRejection = 'inactive' | 'dead' | 'disarmed' | 'cooldown' | 'exhausted' | 'blocked';

/** Called by the sole fixed-step owner. A failed release is never queued. */
export class ShotBudget {
  private elapsed = 0;
  private cooldownUntil = 0;
  private energy: number;
  public constructor(private readonly player: Combat['player']) { this.energy = player.stamina; }
  public get stamina(): number { return this.energy; }
  public get cooldownSec(): number { return Math.max(0, this.cooldownUntil - this.elapsed); }
  public step(dt: number, held: boolean, active: boolean): void {
    validTime(dt);
    if (!active) return;
    this.elapsed += dt;
    const rate = held ? this.player.staminaRegenHeldPerSec : this.player.staminaRegenReleasedPerSec;
    this.energy = Math.min(this.player.stamina, this.energy + rate * dt);
  }
  public restore(amount: number): void {
    validTime(amount);
    this.energy = Math.min(this.player.stamina, this.energy + amount);
  }
  /** Invoke once for a fresh release, after all real muzzle/hand/pool checks. */
  public release(arrow: Arrow, context: { active: boolean; alive: boolean; armed: boolean; launchClear: boolean }): ShotRejection | null {
    if (!context.active) return 'inactive';
    if (!context.alive) return 'dead';
    if (!context.armed) return 'disarmed';
    if (this.cooldownSec > 1e-9) return 'cooldown';
    if (this.energy + 1e-9 < arrow.staminaCost) return 'exhausted';
    if (!context.launchClear) return 'blocked';
    this.energy = Math.max(0, this.energy - arrow.staminaCost);
    this.cooldownUntil = this.elapsed + arrow.intervalSec;
    return null;
  }
  public reset(): void { this.elapsed = this.cooldownUntil = 0; this.energy = this.player.stamina; }
}

export function validTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('时间/数量必须为非负有限数');
}

/** Global attack-start reservation for the current wave, including subsequent attacks. */
export class AttackSlots {
  private next = 0;
  public constructor(private readonly separationSec: number) { validTime(separationSec); }
  public reserve(earliest: number): number {
    validTime(earliest);
    const at = Math.max(earliest, this.next);
    this.next = at + this.separationSec;
    return at;
  }
}

export interface EnemyAttackEvent { readonly kind: 'telegraph' | 'release'; readonly aimRad: number | null }
/** No wall-clock timers: pause freezes this machine; death/disarm cancels winding up. */
export class EnemyAttack {
  private elapsed = 0;
  private due: number;
  private releaseAt: number | null = null;
  private aim: number | null = null;
  private disabled = false;
  public constructor(private readonly enemy: Combat['enemies'][number], private readonly run: Combat['run'],
    private readonly slots: AttackSlots, private readonly random: () => number, spawnDelaySec = 0) {
    validTime(spawnDelaySec);
    // Construct all wave controllers together and advance their shared wave clock,
    // including while delayed bodies have not spawned yet.
    this.due = slots.reserve(Math.max(spawnDelaySec, run.firstEnemyShotMinSec - enemy.telegraphSec));
  }
  public step(dt: number, state: { active: boolean; alive: boolean; armed: boolean; hpRatio: number },
    solveAim: () => number | null): readonly EnemyAttackEvent[] {
    validTime(dt);
    if (!state.alive || !state.armed) {
      this.disabled = true; this.releaseAt = null; this.aim = null;
      return [];
    }
    if (!state.active || this.disabled) return [];
    this.elapsed += dt;
    if (this.releaseAt !== null) {
      if (this.elapsed + 1e-9 < this.releaseAt) return [];
      const aimRad = this.aim;
      this.releaseAt = null; this.aim = null;
      this.schedule(state.hpRatio);
      return aimRad === null ? [] : [{ kind: 'release', aimRad }];
    }
    if (this.elapsed + 1e-9 < this.due) return [];
    const target = solveAim();
    if (target === null || !Number.isFinite(target)) { this.schedule(state.hpRatio); return []; }
    const noise = (randomUnit(this.random) * 2 - 1) * this.enemy.aimErrorDeg * Math.PI / 180;
    this.aim = target + noise;
    this.releaseAt = this.elapsed + this.enemy.telegraphSec;
    return [{ kind: 'telegraph', aimRad: this.aim }];
  }
  private schedule(hpRatio: number): void {
    const [lo, hi] = this.enemy.attackIntervalRangeSec;
    const phase = this.enemy.phaseTwoHpRatio !== undefined && hpRatio <= this.enemy.phaseTwoHpRatio
      ? this.enemy.phaseTwoIntervalMultiplier ?? 1 : 1;
    // Interval is release-to-release. Start no earlier than the next fixed step.
    const gap = Math.max(0, (lo + (hi - lo) * randomUnit(this.random)) * phase - this.enemy.telegraphSec);
    this.due = this.slots.reserve(this.elapsed + gap);
  }
}

export function randomUnit(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('随机源必须返回 [0,1]');
  return value;
}

/** Analytic stationary-target solutions, used only as a candidate before real physics. */
export function ballisticAngles(dx: number, dy: number, speedMps: number, gravityMagnitude: number): readonly number[] {
  if (![dx, dy, speedMps, gravityMagnitude].every(Number.isFinite) || speedMps <= 0 || gravityMagnitude <= 0 || Math.abs(dx) < 1e-6) return [];
  const x = Math.abs(dx), v2 = speedMps * speedMps;
  const discriminant = v2 * v2 - gravityMagnitude * (gravityMagnitude * x * x + 2 * dy * v2);
  if (!Number.isFinite(discriminant) || discriminant < 0) return [];
  const low = Math.atan2(v2 - Math.sqrt(discriminant), gravityMagnitude * x);
  const high = Math.atan2(v2 + Math.sqrt(discriminant), gravityMagnitude * x);
  const first = dx > 0 ? low : Math.PI - low;
  const second = dx > 0 ? high : Math.PI - high;
  // Avoid Set/spread here: Cocos Creator's QuickCompiler can expose a non-standard
  // iterator for Set in generated runtime code, turning numeric angles into objects.
  return Math.abs(first - second) < 1e-12 ? [first] : [first, second];
}

/** Constant-velocity lead candidate, frozen on telegraph; unreachable/diverging solves skip fire. */
export function predictAim(delta: { x: number; y: number }, targetVelocity: { x: number; y: number },
  speedMps: number, gravityMagnitude: number, telegraphSec: number): number | null {
  if (![delta.x, delta.y, targetVelocity.x, targetVelocity.y, telegraphSec].every(Number.isFinite) || telegraphSec < 0) return null;
  let flightSec = Math.hypot(delta.x, delta.y) / speedMps;
  for (let i = 0; i < 24; i++) {
    const lead = telegraphSec + flightSec;
    const x = delta.x + targetVelocity.x * lead, y = delta.y + targetVelocity.y * lead;
    const angle = ballisticAngles(x, y, speedMps, gravityMagnitude)[0];
    if (angle === undefined) return null;
    const next = x / (speedMps * Math.cos(angle));
    if (!Number.isFinite(next) || next <= 0) return null;
    if (Math.abs(next - flightSec) < 1e-6) return angle;
    flightSec = next;
  }
  return null;
}
