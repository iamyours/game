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
