import type { StoragePort, WriteResult } from './SaveRepository';

export const BIOMES = [
  { id: 'storm', name: '风暴遗迹', track: 'music-storm', tint: '#B5E4DD', boss: '遗迹守望者', subtitle: '石阶与长风' },
  { id: 'frost', name: '霜月神殿', track: 'music-frost', tint: '#BFCDF9', boss: '霜羽神射', subtitle: '寒夜与极光' },
  { id: 'ember', name: '余烬城塞', track: 'music-ember', tint: '#F2BD90', boss: '余烬督军', subtitle: '落日与熔谷' },
] as const;
export type BiomeId = typeof BIOMES[number]['id'];
export function biomeForStage(stage: number) { return BIOMES[Math.floor((Math.max(1, stage) - 1) / 3) % BIOMES.length]!; }

export interface RunTally { kills: number; heads: number; bosses: number }
type ChallengeReward = 'rune' | 'potion' | 'forge';
const GOALS = [
  { name: '精准猎手', target: 3, reward: 'rune', rewardText: '符石 +1' },
  { name: '稳住阵脚', target: 3, reward: 'potion', rewardText: '药瓶 +1' },
  { name: '乘胜追击', target: 5, reward: 'forge', rewardText: '当前弓升一级' },
] as const;

/** Goals advance only on unique, settled defeats. Taking damage breaks the no-damage chain. */
export class RunChallenges {
  private tally: RunTally = { kills: 0, heads: 0, bosses: 0 };
  private index = 0;
  private progress = 0;
  private chain = 0;
  private bestChain = 0;
  private banner = '';
  private bannerAge = 0;
  public get tallies(): RunTally { return { ...this.tally }; }
  public get snapshot() {
    const goal = GOALS[this.index % GOALS.length]!;
    return { ...goal, progress: this.progress, chain: this.chain, bestChain: this.bestChain,
      detail: this.index % 3 === 0 ? '累计爆头击败' : this.index % 3 === 1 ? '不受伤连续击败' : '累计击败',
      completed: this.index, banner: this.bannerAge > 0 ? this.banner : '' };
  }
  public damaged(): void { this.chain = 0; if (this.index % 3 === 1) this.progress = 0; }
  public step(dt: number): void { this.bannerAge = Math.max(0, this.bannerAge - dt); }
  public describeReward(text: string): void { this.banner = `${GOALS[(this.index + GOALS.length - 1) % GOALS.length]!.name}达成 · ${text}`; }
  public defeated(headshot: boolean, boss: boolean, alive: boolean): ChallengeReward | null {
    this.tally.kills++; if (headshot) this.tally.heads++; if (boss) this.tally.bosses++;
    if (!alive) { this.damaged(); return null; }
    this.chain++; this.bestChain = Math.max(this.bestChain, this.chain);
    const goal = GOALS[this.index % GOALS.length]!;
    if (this.index % 3 === 0) this.progress += Number(headshot);
    else if (this.index % 3 === 1) this.progress++;
    else this.progress++;
    if (this.progress < goal.target) return null;
    this.index++; this.progress = 0; this.banner = `${goal.name}达成 · ${goal.rewardText}`; this.bannerAge = 3;
    return goal.reward;
  }
  public reset(): void { this.tally = { kills: 0, heads: 0, bosses: 0 }; this.index = this.progress = this.chain = this.bestChain = this.bannerAge = 0; this.banner = ''; }
}

interface CareerData extends RunTally { schemaVersion: 1; xp: number; runId: string; cursor: RunTally; music: boolean }
const RANKS = [0, 8, 25, 55, 100] as const;
const TITLES = ['初学弓手', '遗迹猎手', '长风射手', '霜月神射', '风暴行者'] as const;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const tallyValid = (v: RunTally) => v && integer(v.kills) && integer(v.heads) && integer(v.bosses) && v.heads <= v.kills && v.bosses <= v.kills;
const KEY = 'storm-archers.career';
/** Separate versioned career key, bounded checkpoint, safe retries and protected unread/future saves. */
export class CareerRepository {
  private data: CareerData = { schemaVersion: 1, xp: 0, kills: 0, heads: 0, bosses: 0, runId: '', cursor: { kills: 0, heads: 0, bosses: 0 }, music: true };
  private dirty = false;
  private recovery: string | null = null;
  private blocked: WriteResult | null = null;
  public lastWrite: WriteResult = { ok: true };
  public constructor(private readonly storage: StoragePort) {
    let raw: string | null;
    try { raw = storage.getItem(KEY); } catch { this.lastWrite = this.blocked = { ok: false, reason: 'read-failed' }; return; }
    if (raw === null) return;
    try {
      const v = JSON.parse(raw);
      if (typeof v?.schemaVersion === 'number' && v.schemaVersion > 1) { this.lastWrite = this.blocked = { ok: false, reason: 'future-version' }; return; }
      if (v?.schemaVersion !== 1 || !tallyValid(v) || !tallyValid(v.cursor) || !integer(v.xp) || typeof v.music !== 'boolean' || typeof v.runId !== 'string' || v.runId.length > 128) throw Error('invalid career');
      this.data = { schemaVersion: 1, xp: v.xp, kills: v.kills, heads: v.heads, bosses: v.bosses, runId: v.runId, cursor: { ...v.cursor }, music: v.music };
    } catch { this.recovery = raw; this.dirty = true; }
  }
  public get snapshot() {
    const rank = RANKS.filter(xp => this.data.xp >= xp).length;
    return { xp: this.data.xp, kills: this.data.kills, heads: this.data.heads, bosses: this.data.bosses, music: this.data.music,
      rank, title: TITLES[rank - 1]!, nextXp: RANKS[rank] ?? null, damageBonus: (rank - 1) * 0.025 };
  }
  public checkpoint(runId: string, tally: RunTally): WriteResult {
    if (!runId || runId.length > 128 || !tallyValid(tally)) throw Error('invalid career checkpoint');
    const cursor = this.data.runId === runId ? this.data.cursor : { kills: 0, heads: 0, bosses: 0 };
    const delta = { kills: tally.kills - cursor.kills, heads: tally.heads - cursor.heads, bosses: tally.bosses - cursor.bosses };
    if (!tallyValid(delta)) throw Error('non-monotonic career checkpoint');
    if (delta.kills === 0) return this.flush();
    this.data.kills += delta.kills; this.data.heads += delta.heads; this.data.bosses += delta.bosses;
    this.data.xp += delta.kills + delta.heads + delta.bosses * 4;
    this.data.cursor = { ...tally }; this.data.runId = runId; this.dirty = true;
    return this.flush();
  }
  public setMusic(enabled: boolean): WriteResult { this.data.music = enabled; this.dirty = true; return this.flush(); }
  public flush(): WriteResult {
    if (this.blocked) return this.lastWrite = this.blocked;
    if (!this.dirty) return this.lastWrite;
    try {
      if (this.recovery !== null) {
        const previous = this.storage.getItem(`${KEY}.backup`);
        if (previous !== null && previous !== this.recovery) return this.lastWrite = { ok: false, reason: 'backup-failed' };
        this.storage.setItem(`${KEY}.backup`, this.recovery); this.recovery = null;
      }
    } catch { return this.lastWrite = { ok: false, reason: 'backup-failed' }; }
    try { this.storage.setItem(KEY, JSON.stringify(this.data)); this.dirty = false; return this.lastWrite = { ok: true }; }
    catch { return this.lastWrite = { ok: false, reason: 'write-failed' }; }
  }
}
