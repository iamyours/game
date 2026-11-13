import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { validTime } from './BattleRules';

export type BowId = 'thunder' | 'gale' | 'moon';
export type SkillKind = BowId | 'rune';
export type ItemId = 'potion' | 'rune';
type Arrow = PhysicsLabConfig['arrows'][number];
export type EquippedArrow = Arrow & { skill?: SkillKind };
export const BOWS: Record<BowId, { name: string; skill: string; tint: string; detail: string }> = {
  thunder: { name: '雷霆弓', skill: '雷霆一击', tint: '#93E5FF', detail: '均衡 · 技能下一箭伤害翻倍' },
  gale: { name: '疾风弓', skill: '疾风三连', tint: '#A5E6B5', detail: '冷却更短 · 技能强化下三箭' },
  moon: { name: '月蚀弓', skill: '月蚀重矢', tint: '#CBB6FF', detail: '伤害更高 · 技能下一箭三倍伤害' },
};
export interface SkillMark { kind: SkillKind; point: { x: number; y: number }; age: number; duration: number; hit: boolean }

/** One shared skill meter across equipment. No skill or item can create an automatic shot. */
export class BattleLoadout {
  public bow: BowId = 'thunder';
  private levels: Record<BowId, number> = { thunder: 1, gale: 1, moon: 1 };
  private items: Record<ItemId, number> = { potion: 2, rune: 1 };
  private energy = 100;
  private primed: { kind: BowId; shots: number } | null = null;
  private rune = false;
  private marks: SkillMark[] = [];
  public get level(): number { return this.levels[this.bow]; }
  public get canUpgrade(): boolean { return this.level < 4; }
  public get effects(): readonly SkillMark[] { return this.marks; }
  public get snapshot() { return { bow: this.bow, level: this.level, levels: { ...this.levels }, items: { ...this.items },
    energy: this.energy, primed: this.primed ? { ...this.primed } : null, rune: this.rune }; }
  public switchBow(): void {
    const order: BowId[] = ['thunder', 'gale', 'moon']; this.bow = order[(order.indexOf(this.bow) + 1) % order.length]!;
  }
  public upgrade(): boolean { if (!this.canUpgrade) return false; this.levels[this.bow]++; return true; }
  public step(dt: number, alive = true): void {
    validTime(dt); if (alive) this.energy = Math.min(100, this.energy + dt * 5);
    for (const effect of this.marks) effect.age += dt;
    this.marks = this.marks.filter(mark => mark.age < mark.duration);
  }
  public charge(amount: number): void { validTime(amount); this.energy = Math.min(100, this.energy + amount); }
  public activate(point: { x: number; y: number }): boolean {
    if (this.energy < 100 || this.primed) return false;
    this.energy = 0; this.primed = { kind: this.bow, shots: this.bow === 'gale' ? 3 : 1 };
    this.effect(this.bow, point, false); return true;
  }
  public addItem(id: ItemId): boolean { if (this.items[id] >= 3) return false; this.items[id]++; return true; }
  public useItem(id: ItemId, hp: number, hpMax: number): { hp: number } | null {
    if (hp <= 0 || this.items[id] <= 0 || (id === 'potion' ? hp >= hpMax : this.rune)) return null;
    this.items[id]--;
    if (id === 'rune') this.rune = true;
    return { hp: id === 'potion' ? Math.min(35, hpMax - hp) : 0 };
  }
  public arrow(base: Arrow): EquippedArrow {
    const levelDamage = 1 + (this.level - 1) * 0.15;
    const bowDamage = this.bow === 'gale' ? 0.85 : this.bow === 'moon' ? 1.3 : 1;
    const bowCadence = this.bow === 'gale' ? 0.8 : this.bow === 'moon' ? 1.2 : 1;
    const skill = this.primed?.kind;
    const skillDamage = skill === 'moon' ? 3 : skill === 'thunder' ? 2 : skill === 'gale' ? 1.2 : 1;
    return { ...base, baseDamage: base.baseDamage * levelDamage * bowDamage * skillDamage * (this.rune ? 1.5 : 1),
      intervalSec: Math.max(0.2, base.intervalSec * bowCadence * (skill === 'gale' ? 0.5 : 1)),
      staminaCost: base.staminaCost * (skill === 'gale' ? 0.5 : 1),
      ...(skill || this.rune ? { skill: skill ?? 'rune' } : {}) };
  }
  /** Consume only after ProjectileSystem accepts a real shot. Preview/rejected release consumes nothing. */
  public fired(arrow: EquippedArrow, point: { x: number; y: number }): void {
    if (arrow.skill) this.effect(arrow.skill, point, false);
    if (this.primed && --this.primed.shots <= 0) this.primed = null;
    this.rune = false;
  }
  public effect(kind: SkillKind, point: { x: number; y: number }, hit: boolean): void {
    if (![point.x, point.y].every(Number.isFinite)) return;
    if (this.marks.length >= 16) this.marks.shift();
    this.marks.push({ kind, point: { ...point }, age: 0, duration: hit ? 0.42 : 0.32, hit });
  }
  public reset(): void {
    this.bow = 'thunder'; this.levels = { thunder: 1, gale: 1, moon: 1 }; this.items = { potion: 2, rune: 1 };
    this.energy = 100; this.primed = null; this.rune = false; this.marks = [];
  }
}
