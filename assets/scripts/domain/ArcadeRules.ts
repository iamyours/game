import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { ballisticAngles, randomUnit, validTime } from './BattleRules';

/** Bounded endless-run timer; one active enemy generation, no wall-clock callbacks. */
export class ArcadeCycle {
  public elapsed = 0;
  public score = 0;
  private lastDefeated = 0;
  private spawnAt = Infinity;
  public constructor(private readonly respawnSec: number) { validTime(respawnSec); }
  public step(dt: number): void { validTime(dt); this.elapsed += dt; }
  public defeated(generation: number): boolean {
    if (!Number.isSafeInteger(generation) || generation <= this.lastDefeated) return false;
    this.lastDefeated = generation; this.score++; this.spawnAt = this.elapsed + this.respawnSec; return true;
  }
  public canSpawn(playerAlive: boolean): boolean { return playerAlive && this.elapsed + 1e-9 >= this.spawnAt; }
  public spawned(): void { this.spawnAt = Infinity; }
  public reset(): void { this.elapsed = this.score = this.lastDefeated = 0; this.spawnAt = Infinity; }
}

/** Drop is an event, not a frame condition. A dead, previously disarmed actor cannot drop twice. */
export class BowState {
  public armed = true;
  public trauma = 0;
  private readonly hits = new Set<number>();
  public constructor(private readonly threshold: number) { validTime(threshold); }
  public hit(shotId: number, part: string, damage: number): boolean {
    validTime(damage);
    if (!this.armed || !['rightUpperArm', 'rightForearm'].includes(part) || this.hits.has(shotId)) return false;
    this.hits.add(shotId); this.trauma += damage;
    return this.trauma >= this.threshold ? this.drop() : false;
  }
  public drop(): boolean {
    if (!this.armed) return false;
    this.armed = false; return true;
  }
}

/** One-shot input/AI release. Failed attempts are consumed, never held for later firing. */
export function canRelease(state: { alive: boolean; armed: boolean; handsReady: boolean; muzzleClear: boolean }): boolean {
  return state.alive && state.armed && state.handsReady && state.muzzleClear;
}

/** Telegraph a real platform fall; never turn a knockdown directly into HP loss/score. */
export class PlatformPressure {
  private age = 0;
  private limit = 0;
  public collapsed = false;
  public get remainingSec(): number | null { return this.limit > 0 && !this.collapsed ? Math.max(0, this.limit - this.age) : null; }
  public step(dt: number, state: { active: boolean; alive: boolean; armed: boolean; downed: boolean; boss: boolean }): boolean {
    validTime(dt);
    if (this.collapsed || !state.active || !state.alive) return false;
    const threatened = !state.armed || (!state.boss && state.downed);
    if (!threatened) { this.age = this.limit = 0; return false; }
    if (this.limit === 0) this.limit = state.boss ? 5 : 3;
    this.age += dt;
    if (this.age + 1e-9 < this.limit) return false;
    this.collapsed = true; return true;
  }
}

/** Latch a real fall, filtering short hit recoil. Reset is the only automatic stand-up path. */
export class FallDetector {
  private badSeconds = 0;
  public downed = false;
  public step(dt: number, tiltRad: number, chestAbovePelvisM: number, ready: boolean,
    thresholdDeg: number, confirmSec: number): boolean {
    validTime(dt);
    if (!ready || this.downed) return this.downed;
    const tilt = Math.abs(Math.atan2(Math.sin(tiltRad), Math.cos(tiltRad)));
    this.badSeconds = tilt >= thresholdDeg * Math.PI / 180 || chestAbovePelvisM <= 0.04 ? this.badSeconds + dt : 0;
    if (this.badSeconds + 1e-9 >= confirmSec) this.downed = true;
    return this.downed;
  }
  public reset(): void { this.badSeconds = 0; this.downed = false; }
}

/** Smooth kinematic rocking via angular velocity, never teleporting a physical node. */
export function platformAngularVelocity(elapsed: number, amplitudeRad: number, periodSec: number, phase: number): number {
  return amplitudeRad * (2 * Math.PI / periodSec) * Math.cos(elapsed * 2 * Math.PI / periodSec + phase);
}
export function chooseArcadeSpawn(cfg: PhysicsLabConfig, random: () => number) {
  const range = (r: readonly [number, number], value: number) => r[0] + value * (r[1] - r[0]);
  const minAim = cfg.input.minAimDeg * Math.PI / 180;
  const maxAim = cfg.input.maxAimDeg * Math.PI / 180;
  const speed = cfg.arrows[0]!.speedMps;
  const gravity = Math.abs(cfg.physics.gravityMps2[1]);
  const reachable = (x: number, y: number): boolean => ballisticAngles(x - 4.2, y + 1.4 - 4.8, speed, gravity)
    .some(a => a >= minAim && a <= maxAim);
  const candidate = (x: number, y: number, width: number) => ({ x, y, width });

  // Prefer random placement, but do not let one unlucky/random sequence prevent the lab from booting.
  for (let i = 0; i < 16; i++) {
    const x = range(cfg.arcade.spawnX_M, randomUnit(random));
    const y = range(cfg.arcade.surfaceY_M, randomUnit(random));
    const width = range(cfg.arcade.platformWidthM, randomUnit(random));
    if (reachable(x, y)) return candidate(x, y, width);
  }

  // The engine still performs native occupancy and line-of-fire checks. This deterministic grid only
  // guarantees that a valid configured reachability pocket is found before those checks run.
  const width = (cfg.arcade.platformWidthM[0] + cfg.arcade.platformWidthM[1]) / 2;
  for (let yi = 0; yi <= 8; yi++) for (let xi = 0; xi <= 8; xi++) {
    const x = range(cfg.arcade.spawnX_M, xi / 8), y = range(cfg.arcade.surfaceY_M, yi / 8);
    if (reachable(x, y)) return candidate(x, y, width);
  }
  throw new Error('未找到可达的随机平台配置；请检查连续模式出生范围、箭速与瞄准角配置');
}
