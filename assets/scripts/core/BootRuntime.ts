export type BootState = 'idle' | 'loading' | 'ready' | 'failed' | 'disposed';
export interface BootDependencies<T> {
  loadConfig(): Promise<T>;
  onReady(config: T): void;
}

/** A single shared load; failed loads may be retried, destroyed scenes cannot receive ready events. */
export class BootRuntime<T> {
  private pending: Promise<void> | null = null;
  private currentState: BootState = 'idle';
  public constructor(private readonly dependencies: BootDependencies<T>) {}
  public get state(): BootState { return this.currentState; }

  public start(): Promise<void> {
    if (this.currentState === 'disposed') return Promise.reject(new Error('Boot 已销毁'));
    if (this.pending !== null) return this.pending;
    this.currentState = 'loading';
    this.pending = Promise.resolve().then(() => this.dependencies.loadConfig()).then((config) => {
      if (this.currentState === 'disposed') return;
      this.dependencies.onReady(config);
      this.currentState = 'ready';
    }).catch((error: unknown) => {
      if (this.currentState !== 'disposed') {
        this.currentState = 'failed';
        this.pending = null;
      }
      throw error;
    });
    return this.pending;
  }

  public dispose(): void { this.currentState = 'disposed'; }
}
