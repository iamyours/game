/** Bounded render-time accumulator. Excess wall time is discarded, never replayed after a stall. */
export class FixedStepClock {
  private remainder = 0;

  public constructor(public readonly stepSec: number, public readonly maxStepsPerFrame = 5) {
    if (!Number.isFinite(stepSec) || stepSec <= 0 || !Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame < 1) {
      throw new Error('固定步配置无效');
    }
  }

  public reset(): void { this.remainder = 0; }

  public advance(frameSec: number, step: (dt: number) => void): number {
    if (!Number.isFinite(frameSec) || frameSec <= 0) return 0;
    const budget = this.stepSec * this.maxStepsPerFrame;
    this.remainder = Math.min(this.remainder + frameSec, budget);
    let count = 0;
    const epsilon = this.stepSec * 1e-9;
    while (count < this.maxStepsPerFrame && this.remainder + epsilon >= this.stepSec) {
      this.remainder = Math.max(0, this.remainder - this.stepSec);
      count += 1;
      step(this.stepSec);
    }
    return count;
  }
}
