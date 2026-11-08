import type { SeedPack } from '../../../tools/config/schema.js';
import { RunSession } from './RunSession';
import { SaveRepository } from './SaveRepository';

/** Engine-independent navigation; UI and world mounting remain adapter responsibilities. */
export class PageFlow {
  private page: 'home' | 'battle' | 'result' | 'settings' = 'home';
  private returnPage: 'home' | 'result' = 'home';
  private current: RunSession | null = null;
  private readonly usedIds = new Set<string>();
  public constructor(private readonly save: SaveRepository, private readonly levels: SeedPack['levels']['levels'],
    private readonly transitionSec: number, private readonly createRunId: () => string) {}
  public get snapshot() { return { page: this.page, run: this.current?.snapshot ?? null, saveDirty: this.save.dirty }; }
  public get session(): RunSession | null { return this.current; }
  public begin(levelId: string): RunSession {
    if (this.page === 'battle' || this.page === 'settings') throw new Error('当前页面不能开始新对局');
    const level = this.levels.find(l => l.id === levelId);
    if (!level || !this.save.snapshot.unlockedLevels.includes(levelId)) throw new Error('关卡未解锁');
    const id = this.createRunId();
    if (!id || this.usedIds.has(id) || this.save.snapshot.settlements.some(s => s.runId === id)) throw new Error('runId 必须全局唯一');
    const run = new RunSession(id, level, this.transitionSec);
    this.usedIds.add(id); this.current = run; this.page = 'battle';
    // Adapter consumes run.start() events after mounting the scene.
    return run;
  }
  public showResult() {
    if (!this.current) throw new Error('没有对局');
    const { phase, runId, levelId } = this.current.snapshot;
    if (phase !== 'won' && phase !== 'lost') throw new Error('对局尚未结算');
    const result = this.save.settle(runId, levelId, phase);
    this.page = 'result';
    return result;
  }
  public retry(): RunSession {
    if (this.page !== 'result' || !this.current) throw new Error('只能在结果页重试');
    return this.begin(this.current.snapshot.levelId);
  }
  public next(): RunSession {
    if (this.page !== 'result' || !this.current || this.current.snapshot.phase !== 'won') throw new Error('必须胜利后进入下一关');
    const level = this.levels.find(l => l.id === this.current!.snapshot.levelId)!;
    if (!level.unlockLevel) throw new Error('已经是最后一关');
    return this.begin(level.unlockLevel);
  }
  public home(): void { this.current?.setPaused(true); this.current = null; this.page = 'home'; }
  public settings(): void {
    if (this.page !== 'home' && this.page !== 'result') throw new Error('请先结束或退出战斗');
    this.returnPage = this.page; this.page = 'settings';
  }
  public closeSettings(): void { if (this.page === 'settings') this.page = this.returnPage; }
}
