import type { SeedPack } from '../../../tools/config/schema.js';

type Level = SeedPack['levels']['levels'][number];
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Endless mode owns a separate key; historical level progression is never overwritten. */
export class ArcadeRecordRepository {
  private data = { schemaVersion: 1, bestScore: 0, soundEnabled: true };
  private dirty = false;
  private blocked: WriteResult | null = null;
  public lastWrite: WriteResult = { ok: true };
  private recovery: string | null = null;
  public constructor(private readonly storage: StoragePort) {
    let raw: string | null;
    try { raw = storage.getItem('storm-archers.arcade'); }
    catch { this.lastWrite = this.blocked = { ok: false, reason: 'read-failed' }; return; }
    if (raw === null) return;
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object' && 'schemaVersion' in value &&
        typeof value.schemaVersion === 'number' && value.schemaVersion > 1) {
        this.lastWrite = this.blocked = { ok: false, reason: 'future-version' }; return;
      }
      if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1 ||
        !('bestScore' in value) || !Number.isSafeInteger(value.bestScore) || Number(value.bestScore) < 0 ||
        !('soundEnabled' in value) || typeof value.soundEnabled !== 'boolean') throw new Error('坏档');
      this.data = { schemaVersion: 1, bestScore: Number(value.bestScore), soundEnabled: value.soundEnabled };
    } catch { this.recovery = raw; this.dirty = true; }
  }
  public get snapshot() { return { ...this.data }; }
  public record(score: number): WriteResult {
    if (!Number.isSafeInteger(score) || score < 0) throw new Error('击败数必须是非负整数');
    if (score > this.data.bestScore) { this.data.bestScore = score; this.dirty = true; }
    return this.flush();
  }
  public setSound(enabled: boolean): WriteResult {
    this.data.soundEnabled = enabled; this.dirty = true; return this.flush();
  }
  public flush(): WriteResult {
    if (this.blocked) return this.lastWrite = this.blocked;
    if (!this.dirty) return this.lastWrite;
    if (this.recovery !== null) {
      try {
        const key = 'storm-archers.arcade.backup', previous = this.storage.getItem(key);
        if (previous !== null && previous !== this.recovery) return this.lastWrite = { ok: false, reason: 'backup-failed' };
        this.storage.setItem(key, this.recovery); this.recovery = null;
      } catch { return this.lastWrite = { ok: false, reason: 'backup-failed' }; }
    }
    try { this.storage.setItem('storm-archers.arcade', JSON.stringify(this.data)); this.dirty = false; return this.lastWrite = { ok: true }; }
    catch { return this.lastWrite = { ok: false, reason: 'write-failed' }; }
  }
}
export interface SaveData {
  schemaVersion: 1;
  unlockedLevels: string[];
  unlockedArrows: string[];
  firstClears: string[];
  tutorialSeen: boolean;
  soundEnabled: boolean;
  settlements: { runId: string; levelId: string; outcome: 'won' | 'lost' }[];
}
export type WriteResult = { ok: true } | { ok: false; reason: 'read-failed' | 'backup-failed' | 'future-version' | 'write-failed' };
const KEY = 'storm-archers.save';
const clone = (data: SaveData): SaveData => JSON.parse(JSON.stringify(data)) as SaveData;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');

/** Storage is injected: localStorage/wx adapters must implement the same synchronous contract. */
export class SaveRepository {
  private data: SaveData;
  private pending = false;
  private blocked: 'read-failed' | 'future-version' | null = null;
  private recoveryRaw: string | null = null;
  public loadStatus: 'new' | 'loaded' | 'migrated' | 'recovered' | 'read-failed' | 'future-version' = 'new';
  public constructor(private readonly storage: StoragePort, private readonly levels: readonly Level[]) {
    if (levels.length === 0 || new Set(levels.map(l => l.id)).size !== levels.length) throw new Error('无效关卡定义');
    this.data = this.defaults();
    this.load();
  }
  public get snapshot(): SaveData { return clone(this.data); }
  public get dirty(): boolean { return this.pending; }
  public settle(runId: string, levelId: string, outcome: 'won' | 'lost'): { applied: boolean; write: WriteResult } {
    if (!runId || !['won', 'lost'].includes(outcome)) throw new Error('无效结算');
    const level = this.levels.find(l => l.id === levelId);
    if (!level || !this.data.unlockedLevels.includes(levelId)) throw new Error('关卡未解锁');
    const previous = this.data.settlements.find(r => r.runId === runId);
    if (previous) {
      if (previous.levelId !== levelId || previous.outcome !== outcome) throw new Error('runId 结算冲突');
      return { applied: false, write: this.flush() };
    }
    this.data.settlements.push({ runId, levelId, outcome });
    if (outcome === 'won' && !this.data.firstClears.includes(levelId)) {
      this.data.firstClears.push(levelId);
      if (level.unlockLevel && !this.data.unlockedLevels.includes(level.unlockLevel)) this.data.unlockedLevels.push(level.unlockLevel);
      if (level.unlockArrow && !this.data.unlockedArrows.includes(level.unlockArrow)) this.data.unlockedArrows.push(level.unlockArrow);
    }
    this.pending = true;
    return { applied: true, write: this.flush() };
  }
  public setPreferences(prefs: { soundEnabled?: boolean; tutorialSeen?: boolean }): WriteResult {
    for (const key of ['soundEnabled', 'tutorialSeen'] as const) {
      if (prefs[key] !== undefined) {
        if (typeof prefs[key] !== 'boolean') throw new Error('设置必须是布尔值');
        this.data[key] = prefs[key];
      }
    }
    this.pending = true;
    return this.flush();
  }
  public flush(): WriteResult {
    if (this.blocked) return { ok: false, reason: this.blocked };
    if (this.recoveryRaw !== null) {
      try {
        // Preserve the original before ANY fallback write. Never overwrite an earlier backup.
        const backupKey = `${KEY}.backup`;
        const existing = this.storage.getItem(backupKey);
        if (existing !== null && existing !== this.recoveryRaw) {
          let i = 1;
          while (this.storage.getItem(`${backupKey}.${i}`) !== null) i += 1;
          this.storage.setItem(`${backupKey}.${i}`, this.recoveryRaw);
        } else this.storage.setItem(backupKey, this.recoveryRaw);
        this.recoveryRaw = null;
      } catch { return { ok: false, reason: 'backup-failed' }; }
    }
    if (!this.pending) return { ok: true };
    try { this.storage.setItem(KEY, JSON.stringify(this.data)); this.pending = false; return { ok: true }; }
    catch { return { ok: false, reason: 'write-failed' }; }
  }
  private defaults(): SaveData {
    return { schemaVersion: 1, unlockedLevels: [this.levels[0]!.id], unlockedArrows: ['normal'], firstClears: [],
      tutorialSeen: false, soundEnabled: true, settlements: [] };
  }
  private load(): void {
    let raw: string | null;
    try { raw = this.storage.getItem(KEY); }
    catch { this.blocked = 'read-failed'; this.loadStatus = 'read-failed'; return; }
    if (raw === null) return;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('坏档');
      const v = value as Record<string, unknown>;
      if (typeof v.schemaVersion === 'number' && v.schemaVersion > 1) {
        this.blocked = 'future-version'; this.loadStatus = 'future-version'; return;
      }
      let migrated = false;
      // Explicit legacy contract: v0 stored completedLevels + soundEnabled only.
      if (v.schemaVersion === 0 && strings(v.completedLevels) && typeof v.soundEnabled === 'boolean') {
        const next = this.defaults();
        for (const level of this.levels) if (v.completedLevels.includes(level.id) && next.unlockedLevels.includes(level.id)) {
          next.firstClears.push(level.id);
          if (level.unlockLevel) next.unlockedLevels.push(level.unlockLevel);
          if (level.unlockArrow) next.unlockedArrows.push(level.unlockArrow);
        }
        next.soundEnabled = v.soundEnabled;
        Object.assign(v, next); migrated = true;
      }
      const knownLevels = new Set(this.levels.map(l => l.id));
      const knownArrows = new Set(['normal', ...this.levels.flatMap(l => l.unlockArrow ? [l.unlockArrow] : [])]);
      if (v.schemaVersion !== 1 || !strings(v.unlockedLevels) || !strings(v.unlockedArrows) || !strings(v.firstClears) ||
        typeof v.tutorialSeen !== 'boolean' || typeof v.soundEnabled !== 'boolean' || !Array.isArray(v.settlements) ||
        !v.unlockedLevels.includes(this.levels[0]!.id) || !v.unlockedArrows.includes('normal') ||
        v.unlockedLevels.some(id => !knownLevels.has(id)) || v.unlockedArrows.some(id => !knownArrows.has(id)) ||
        v.firstClears.some(id => !(v.unlockedLevels as string[]).includes(id))) throw new Error('坏档');
      const runs = new Set<string>();
      for (const item of v.settlements) {
        if (!item || typeof item !== 'object') throw new Error('坏结算');
        const r = item as Record<string, unknown>;
        if (typeof r.runId !== 'string' || !r.runId || runs.has(r.runId) || typeof r.levelId !== 'string' ||
          !knownLevels.has(r.levelId) || (r.outcome !== 'won' && r.outcome !== 'lost')) throw new Error('坏结算');
        runs.add(r.runId);
      }
      this.data = clone({ schemaVersion: 1, unlockedLevels: [...new Set(v.unlockedLevels)],
        unlockedArrows: [...new Set(v.unlockedArrows)], firstClears: [...new Set(v.firstClears)],
        soundEnabled: v.soundEnabled, tutorialSeen: v.tutorialSeen, settlements: v.settlements as SaveData['settlements'] });
      this.loadStatus = migrated ? 'migrated' : 'loaded'; this.pending = migrated;
      if (migrated) this.recoveryRaw = raw;
    } catch {
      this.data = this.defaults(); this.loadStatus = 'recovered'; this.recoveryRaw = raw; this.pending = true;
    }
  }
}
