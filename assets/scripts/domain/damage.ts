/** Engine-independent reference rule; this does not constitute T006/T011 runtime implementation. */
export interface DamageInput {
  baseDamage: number;
  zoneMultiplier: number;
  armor: number;
  armorDamageFactor: number;
  armorOverflow: boolean;
}
export interface DamageResult {
  zoneDamage: number;
  armorDamage: number;
  hpDamage: number;
  remainingArmor: number;
}

export function resolveDamage(input: DamageInput): DamageResult {
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${key} 必须是非负有限数`);
    }
  }
  if (input.armorDamageFactor <= 0 || input.zoneMultiplier <= 0) throw new Error('伤害倍率必须大于 0');
  const zoneDamage = Math.ceil(input.baseDamage * input.zoneMultiplier);
  const armorCapacity = zoneDamage * input.armorDamageFactor;
  if (!Number.isFinite(zoneDamage) || !Number.isFinite(armorCapacity)) throw new Error('伤害运算溢出');
  const armorDamage = Math.min(input.armor, armorCapacity);
  const remainingArmor = Math.max(0, input.armor - armorDamage);
  // Spend equivalent raw damage on armor, not amplified armor damage on HP. Round only at the end.
  const hpDamage = input.armor === 0 ? zoneDamage : input.armorOverflow
    ? Math.ceil(Math.max(0, zoneDamage - armorDamage / input.armorDamageFactor)) : 0;
  return { zoneDamage, armorDamage, hpDamage, remainingArmor };
}
