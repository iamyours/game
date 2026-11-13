import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { randomUnit } from './BattleRules';
import { biomeForStage } from './Expedition';

type Arrow = PhysicsLabConfig['arrows'][number];
export const RUN_RULES = { stageSize: 5, maxPerkRank: 3, upgradeHp: 10, recoverHp: 35,
  pressurePerStage: 0.06, pressureStageCap: 4, bossEveryStages: 3, bossHp: 180 } as const;
export type PerkId = 'quick' | 'normal' | 'impact' | 'piercing' | 'thrift' | 'recover' | 'forge';
export const PERKS: Record<PerkId, { title: string; detail: string }> = {
  quick: { title: '快弦', detail: '所有箭冷却缩短 10%\n更快补上下一箭' },
  normal: { title: '强弓', detail: '普通箭伤害 +25%\n稳定压制躯干' },
  impact: { title: '重击', detail: '冲击箭伤害 +40%\n更容易击伤持弓臂' },
  piercing: { title: '重矢', detail: '穿甲箭伤害 +35%\n用单发伤害解决重敌' },
  thrift: { title: '省力', detail: '所有箭体力消耗 -20%\n减少连射后的等待' },
  recover: { title: '休整', detail: '立即回复 35 生命\n并补满体力' },
  forge: { title: '锻造', detail: '当前装备的弓升一级\n每级伤害 +15%，最高四级' },
};
export type Encounter = { kind: 'archer' | 'hunter' | 'sniper' | 'heavy' | 'elite' | 'boss'; name: string; hint: string;
  spec: PhysicsLabConfig['enemies'][number]; massMultiplier: number; rocking: boolean; tint: string };

/** In-run only. Fixed five-kill stages; finite upgrades, bounded difficulty, no unlock grind. */
export class RunProgression {
  public static readonly stageSize = RUN_RULES.stageSize;
  private kills = 0;
  private ranks: Partial<Record<PerkId, number>> = {};
  private options: PerkId[] = [];
  private awaiting = false;
  private previousKind: Encounter['kind'] | null = null;
  private bossReward = false;
  public constructor(private readonly random: () => number = Math.random, private readonly canForge: () => boolean = () => false) {}
  public get stage(): number { return Math.floor(this.kills / RunProgression.stageSize) + 1; }
  public get progress(): number { return this.kills % RunProgression.stageSize; }
  public get pending(): boolean { return this.awaiting; }
  public get bossIn(): number { return RUN_RULES.stageSize * RUN_RULES.bossEveryStages - this.kills % (RUN_RULES.stageSize * RUN_RULES.bossEveryStages); }
  public get offers(): readonly PerkId[] { return [...this.options]; }
  public get upgrades(): Readonly<Partial<Record<PerkId, number>>> { return { ...this.ranks }; }
  public defeated(): void {
    if (this.awaiting) return;
    this.kills++;
    if (this.progress !== 0) return;
    this.awaiting = true;
    this.bossReward = this.kills % (RUN_RULES.stageSize * RUN_RULES.bossEveryStages) === 0;
    const pool = (Object.keys(PERKS) as PerkId[]).filter(id => id === 'forge' ? this.canForge() : id === 'recover' || this.rank(id) < RUN_RULES.maxPerkRank);
    this.options = [];
    const count = Math.min(3, pool.length);
    while (this.options.length < count) {
      this.options.push(pool.splice(Math.min(pool.length - 1, Math.floor(randomUnit(this.random) * pool.length)), 1)[0]!);
    }
  }
  public choose(id: PerkId): boolean {
    if (!this.awaiting || !this.options.includes(id)) return false;
    if (id !== 'recover' && id !== 'forge') this.ranks[id] = this.rank(id) + 1;
    this.options = []; this.awaiting = false; return true;
  }
  public get afterBoss(): boolean { return this.bossReward; }
  public arrow(base: Arrow): Arrow {
    return { ...base, intervalSec: base.intervalSec * (1 - this.rank('quick') * 0.1),
      staminaCost: base.staminaCost * (1 - this.rank('thrift') * 0.2),
      baseDamage: base.baseDamage * (1 + (base.id === 'normal' ? this.rank('normal') * 0.25 : base.id === 'piercing' ? this.rank('piercing') * 0.35 : this.rank('impact') * 0.4)) };
  }
  public encounter(cfg: PhysicsLabConfig): Encounter {
    const boss = this.bossIn === 1;
    const elite = !boss && (this.kills + 1) % RunProgression.stageSize === 0;
    const pool: Encounter['kind'][] = this.kills < 2 ? ['archer'] : ['hunter', 'sniper', 'heavy'];
    const available = pool.filter(kind => kind !== this.previousKind);
    const choices = available.length ? available : pool;
    const kind = boss ? 'boss' : elite ? 'elite' : choices[Math.min(choices.length - 1, Math.floor(randomUnit(this.random) * choices.length))]!;
    this.previousKind = kind;
    const base = cfg.enemies[kind === 'heavy' || elite || boss ? 1 : 0]!;
    const pressure = Math.min(RUN_RULES.pressureStageCap, this.stage - 1) * RUN_RULES.pressurePerStage;
    const interval: [number, number] = kind === 'hunter' ? [1.9, 2.3] : kind === 'sniper' ? [3.1, 3.5] : boss ? [2.8, 3.2] : elite ? [2.1, 2.5] : [...base.attackIntervalRangeSec];
    const names = { archer: '弓手', hunter: '快弓猎手', sniper: '神射手', heavy: '重弓守卫', elite: '精英守关', boss: '遗迹守望者' };
    const hints = { archer: '瞄准头部，或射伤持弓臂', hunter: '出箭快 · 抢先打断持弓臂', sniper: '长蓄势、瞄得准 · 抓住拉弓空档', heavy: '身体更重 · 用重矢或瞄准头部', elite: '半血后加快出箭 · 头部仍可一击制胜', boss: '蓄力重矢 → 半血快射 · 头部双倍伤害' };
    const biome = biomeForStage(this.stage);
    if (boss) {
      names.boss = biome.boss;
      hints.boss = biome.id === 'frost' ? '远程精射 → 半血快射 · 抓住长蓄势' : biome.id === 'ember' ? '重弓高伤 → 半血快射 · 留好药瓶' : hints.boss;
    }
    return { kind, name: names[kind], hint: hints[kind], rocking: kind === 'hunter' || (elite && this.stage % 2 === 0),
      massMultiplier: kind === 'heavy' || elite || boss ? cfg.arcade.heavyMassMultiplier : 1,
      tint: boss ? '#FFE0A3' : elite ? '#F1BD69' : kind === 'sniper' ? '#91C7E0' : kind === 'hunter' ? '#9ED1AA' : kind === 'heavy' ? '#C99BDE' : '#E98575',
      spec: { ...base, helmetDurability: 0, hp: boss ? RUN_RULES.bossHp : elite ? 100 : base.hp,
        attackIntervalRangeSec: [interval[0] * (1 - pressure), interval[1] * (1 - pressure)],
        telegraphSec: kind === 'sniper' || boss ? 0.95 : kind === 'hunter' ? 0.42 : elite ? 0.7 : base.telegraphSec,
        aimErrorDeg: kind === 'sniper' || (boss && biome.id === 'frost') ? 0.8 : kind === 'hunter' ? 5 : base.aimErrorDeg,
        arrowBaseDamage: boss ? biome.id === 'ember' ? 22 : 18 : base.arrowBaseDamage,
        ...(boss && biome.id === 'frost' ? { speedMps: base.speedMps * 1.12 } : {}),
        ...(elite || boss ? { phaseTwoHpRatio: 0.5, phaseTwoIntervalMultiplier: boss ? 0.65 : 0.85 } : {}) } };
  }
  public reset(): void { this.kills = 0; this.ranks = {}; this.options = []; this.awaiting = false; this.previousKind = null; this.bossReward = false; }
  private rank(id: PerkId): number { return this.ranks[id] ?? 0; }
}
