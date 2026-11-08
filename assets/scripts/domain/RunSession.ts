import type { SeedPack } from '../../../tools/config/schema.js';
import { validTime } from './BattleRules.js';

type Level = SeedPack['levels']['levels'][number];
export type RunPhase = 'fighting' | 'draining' | 'transition' | 'won' | 'lost';
export interface RunEvent {
  readonly kind: 'spawn-wave' | 'clear-projectiles' | 'settled';
  readonly waveIndex: number;
  readonly outcome?: 'won' | 'lost';
}
export interface EnemyLife { readonly id: string; readonly alive: boolean; readonly outOfBounds: boolean }

/** Consume one complete post-physics snapshot per step; enemy death cannot win early. */
export class RunSession {
  private phase: RunPhase = 'fighting';
  private waveIndex = 0;
  private transitionElapsed = 0;
  private paused = false;
  private hidden = false;
  private started = false;
  private expectedEnemyIds: readonly string[] = [];
  public constructor(public readonly runId: string, private readonly level: Level, private readonly transitionSec: number) {
    if (!runId) throw new Error('runId 不能为空');
    validTime(transitionSec);
  }
  public get snapshot() {
    return { runId: this.runId, levelId: this.level.id, phase: this.phase, waveIndex: this.waveIndex,
      paused: this.paused, hidden: this.hidden, canFire: this.started && !this.paused && !this.hidden && this.phase === 'fighting' };
  }
  /** Adapter must clear input on every pause/visibility change, even on resume. */
  public setPaused(value: boolean): void { this.paused = value; }
  public setHidden(value: boolean): void { this.hidden = value; }
  public start(): readonly RunEvent[] {
    if (this.started) return [];
    this.started = true;
    return [{ kind: 'clear-projectiles', waveIndex: 0 }, this.spawn()];
  }
  public get enemiesToSpawn() {
    return this.level.waves[this.waveIndex]!.map((enemy, index) => ({ ...enemy, id: this.expectedEnemyIds[index]! }));
  }
  public afterStep(dt: number, state: { playerAlive: boolean; playerOutOfBounds: boolean;
    enemies: readonly EnemyLife[]; hostileProjectiles: number }): readonly RunEvent[] {
    validTime(dt);
    if (!Number.isInteger(state.hostileProjectiles) || state.hostileProjectiles < 0) throw new Error('无效在途敌箭计数');
    if (!this.started || this.paused || this.hidden || this.phase === 'won' || this.phase === 'lost') return [];
    // All contacts/deaths from the SAME physics step must already have resolved.
    if (!state.playerAlive || state.playerOutOfBounds) return this.settle('lost');
    if (this.phase === 'transition') {
      this.transitionElapsed += dt;
      if (this.transitionElapsed + 1e-9 < this.transitionSec) return [];
      this.waveIndex += 1;
      this.phase = 'fighting';
      return [{ kind: 'clear-projectiles', waveIndex: this.waveIndex }, this.spawn()];
    }
    const byId = new Map(state.enemies.map(enemy => [enemy.id, enemy]));
    // Missing/delayed spawns are not dead. Disarmed actors remain alive.
    const cleared = this.phase === 'draining' || this.expectedEnemyIds.every(id => {
      const enemy = byId.get(id);
      return enemy !== undefined && (!enemy.alive || enemy.outOfBounds);
    });
    if (!cleared) return [];
    this.phase = 'draining'; // Stop new fire while hostile arrows finish their real flight.
    if (state.hostileProjectiles > 0) return [];
    if (this.waveIndex === this.level.waves.length - 1) return this.settle('won');
    this.phase = 'transition'; this.transitionElapsed = 0;
    return [{ kind: 'clear-projectiles', waveIndex: this.waveIndex }];
  }
  private spawn(): RunEvent {
    this.expectedEnemyIds = this.level.waves[this.waveIndex]!.map((_, i) => `${this.runId}:w${this.waveIndex}:e${i}`);
    return { kind: 'spawn-wave', waveIndex: this.waveIndex };
  }
  private settle(outcome: 'won' | 'lost'): readonly RunEvent[] {
    this.phase = outcome;
    return [{ kind: 'clear-projectiles', waveIndex: this.waveIndex }, { kind: 'settled', waveIndex: this.waveIndex, outcome }];
  }
}
