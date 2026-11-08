import { validTime } from './BattleRules.js';

export interface LifecyclePort { clearInput(): void; setPaused(value: boolean): void; resetTime(): void }
/** Host callbacks forward events here; resume never resumes a held/released shot. */
export class LifecycleRules {
  private manual = false;
  private hidden = false;
  private disposed = false;
  public constructor(private readonly port: LifecyclePort) {}
  public pause(value: boolean): void { if (!this.disposed) { this.manual = value; this.sync(); } }
  public visibility(hidden: boolean): void { if (!this.disposed) { this.hidden = hidden; this.sync(); } }
  public dispose(): void { if (!this.disposed) { this.port.clearInput(); this.port.setPaused(true); this.disposed = true; } }
  private sync(): void {
    this.port.clearInput(); this.port.resetTime(); this.port.setPaused(this.manual || this.hidden);
  }
}

export interface RuntimeSample { frameMs: number; bodies: number; joints: number; listeners: number; memoryBytes: number | null }
/** Bounded collector; reports observations, never claims a device performance PASS. */
export class RuntimeDiagnostics {
  private readonly samples: RuntimeSample[] = [];
  private readonly restarts: Omit<RuntimeSample, 'frameMs'>[] = [];
  private count = 0;
  private totalFrameMs = 0;
  private worstFrameMs = 0;
  private peakBodies = 0;
  public constructor(private readonly capacity = 4096) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('采样容量无效');
  }
  public sample(sample: RuntimeSample): void {
    this.check(sample);
    this.count += 1; this.totalFrameMs += sample.frameMs;
    this.worstFrameMs = Math.max(this.worstFrameMs, sample.frameMs);
    this.peakBodies = Math.max(this.peakBodies, sample.bodies);
    if (this.samples.length === this.capacity) this.samples.shift();
    this.samples.push({ ...sample });
  }
  public restart(sample: Omit<RuntimeSample, 'frameMs'>): void {
    this.check({ ...sample, frameMs: 0 });
    if (this.restarts.length === 30) this.restarts.shift();
    this.restarts.push({ ...sample });
  }
  public report() {
    const sorted = this.samples.map(s => s.frameMs).sort((a, b) => a - b);
    const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]! : null;
    const growth = (key: 'bodies' | 'joints' | 'listeners') => this.restarts.length < 2 ? null
      : this.restarts.slice(1).every((r, i) => r[key] >= this.restarts[i]![key]) &&
        this.restarts.at(-1)![key] > this.restarts[0]![key];
    return { totalSamples: this.count, retainedSamples: this.samples.length,
      observedDurationSec: this.totalFrameMs / 1000,
      meanFrameMs: this.count ? this.totalFrameMs / this.count : null,
      worstFrameMs: this.count ? this.worstFrameMs : null, peakBodies: this.peakBodies,
      percentileScope: 'last retained samples', p50FrameMs: percentile(0.5), p95FrameMs: percentile(0.95), p99FrameMs: percentile(0.99),
      restartCountRetained: this.restarts.length, monotonicGrowth: { bodies: growth('bodies'), joints: growth('joints'), listeners: growth('listeners') },
      restartSnapshots: this.restarts.map(s => ({ ...s })), acceptance: 'NOT_EVALUATED' as const };
  }
  private check(sample: RuntimeSample): void {
    validTime(sample.frameMs);
    for (const n of [sample.bodies, sample.joints, sample.listeners]) if (!Number.isInteger(n) || n < 0) throw new Error('资源计数无效');
    if (sample.memoryBytes !== null) validTime(sample.memoryBytes);
  }
}
