import { validTime } from './BattleRules';

/** Read-only, feature-detected 3.8.8 Eventify inventory. This excludes browser/OS listeners. */
export function eventCallbackCount(source: unknown, filter: { owner?: unknown; callback?: unknown } = {}): number | null {
  if (!source || typeof source !== 'object') return null;
  const wrapper = source as { _eventTarget?: unknown; _callbackTable?: unknown };
  const target = wrapper._eventTarget ?? source;
  if (!target || typeof target !== 'object') return null;
  const table = (target as { _callbackTable?: unknown })._callbackTable;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return null;
  let count = 0;
  for (const list of Object.values(table)) {
    if (!list || typeof list !== 'object' || !('callbackInfos' in list) || !Array.isArray(list.callbackInfos)) return null;
    for (const info of list.callbackInfos) {
      if (info === null) continue;
      if (!info || typeof info !== 'object' || typeof info.callback !== 'function') return null;
      if ('owner' in filter && info.target !== filter.owner) continue;
      if ('callback' in filter && info.callback !== filter.callback) continue;
      count++;
    }
  }
  return count;
}

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

export interface RuntimeSample { frameMs: number; bodies: number; joints: number; listeners: number | null; memoryBytes: number | null }
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
    const growth = (key: 'bodies' | 'joints' | 'listeners') => {
      const values = this.restarts.map(r => r[key]);
      if (values.length < 2 || values.some(v => v === null)) return null;
      const known = values as number[];
      return known.slice(1).every((v, i) => v >= known[i]!) && known.at(-1)! > known[0]!;
    };
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
    for (const n of [sample.bodies, sample.joints]) if (!Number.isInteger(n) || n < 0) throw new Error('资源计数无效');
    if (sample.listeners !== null && (!Number.isInteger(sample.listeners) || sample.listeners < 0)) throw new Error('监听计数无效');
    if (sample.memoryBytes !== null) validTime(sample.memoryBytes);
  }
}
