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
  const range = (r: readonly [number, number]) => r[0] + randomUnit(random) * (r[1] - r[0]);
  for (let i = 0; i < 16; i++) {
    const x = range(cfg.arcade.spawnX_M), y = range(cfg.arcade.surfaceY_M), width = range(cfg.arcade.platformWidthM);
    // Static candidate only; actual colliders/standing/aim still require engine checks.
    const reachable = ballisticAngles(x - 4.2, y + 1.4 - 4.8, cfg.arrows[0]!.speedMps, Math.abs(cfg.physics.gravityMps2[1]))
      .some(a => a >= cfg.input.minAimDeg * Math.PI / 180 && a <= cfg.input.maxAimDeg * Math.PI / 180);
    if (reachable) return { x, y, width };
  }
  throw new Error('未找到可达的随机平台配置');
}
