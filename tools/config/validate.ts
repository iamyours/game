import { seedPackSchema, type SeedPack } from './schema.js';

/** Validate structure first, then invariants whose values span multiple seed files. */
export function validateSeedPack(input: unknown): SeedPack {
  const result = seedPackSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
  }
  const pack = result.data;
  const { combat, rig, levels } = pack;
  const errors: string[] = [];
  const require = (condition: boolean, message: string): void => { if (!condition) errors.push(message); };
  const unique = (ids: string[], path: string): void => {
    require(new Set(ids).size === ids.length, `${path}: ID 不得重复`);
  };
  unique(combat.arrows.map((arrow) => arrow.id), 'combat.arrows');
  unique(combat.enemies.map((enemy) => enemy.id), 'combat.enemies');
  unique(rig.partGroups.map((part) => part.id), 'rig.partGroups');
  unique(levels.platforms.map((platform) => platform.id), 'levels.platforms');
  unique(levels.levels.map((level) => level.id), 'levels.levels');
  const partCounts = { head: 1, chest: 1, pelvis: 1, arms: 4, legs: 4 };
  for (const group of rig.partGroups) {
    require(group.count === partCounts[group.id], `rig.partGroups.${group.id}: 刚体数不匹配`);
  }
  require(rig.partGroups.reduce((sum, group) => sum + group.count, 0) === rig.bodyCount, 'rig.bodyCount: 部位总数不匹配');
  require(Math.abs(rig.partGroups.reduce((sum, group) => sum + group.massFractionTotal, 0) - 1) < 1e-9,
    'rig.partGroups: 总质量比例必须为 1');
  require(combat.viewport.designWidth > combat.viewport.designHeight, 'combat.viewport: 必须横屏');
  require(Math.abs(combat.viewport.designWidth / combat.viewport.designHeight - combat.viewport.worldWidthM / combat.viewport.worldHeightM) < 1e-9,
    'combat.viewport: 设计画布与米制视野宽高比不匹配');
  require(combat.input.minAimDeg < combat.input.maxAimDeg && combat.input.initialAimDeg >= combat.input.minAimDeg &&
    combat.input.initialAimDeg <= combat.input.maxAimDeg, 'combat.input: 初始角度必须在有效瞄准范围内');
  require(combat.input.deadzoneDesign < combat.input.joystickRadiusDesign, 'combat.input: 死区必须小于摇杆半径');
  require(combat.input.fullDrawDistanceDesign > combat.input.deadzoneDesign, 'combat.input: 满弓距离必须大于死区');
  require(combat.bowControl.minPowerRatio < 1, 'combat.bowControl: 轻拉倍率必须小于满弓倍率');
  require(combat.reaction.playerMaxIncomingImpulseNs <= combat.reaction.maxSingleImpulseNs,
    'combat.reaction: 玩家冲量限制不可超过单次冲量上限');
  require(combat.limits.normalBodiesTarget <= combat.limits.peakBodiesBudget, 'combat.limits: 常态刚体预算不可大于峰值');
  require(combat.limits.maxEmbeddedPerActor <= combat.limits.maxEmbeddedVisuals, 'combat.limits: 单角色插箭上限不可超过全场上限');
  for (const arrow of combat.arrows) {
    require(arrow.staminaCost <= combat.player.stamina, `combat.arrows.${arrow.id}: 体力消耗超过玩家上限`);
    require(arrow.impulseNs <= combat.reaction.maxSingleImpulseNs, `combat.arrows.${arrow.id}: 冲量超过单次上限`);
    require(arrow.armorOverflow === (arrow.id === 'piercing'), `combat.arrows.${arrow.id}: 只有穿甲箭允许装甲余伤`);
  }
  for (const enemy of combat.enemies) {
    require(enemy.telegraphSec < enemy.attackIntervalRangeSec[0], `combat.enemies.${enemy.id}: 蓄势必须短于最小攻击间隔`);
  }
  const boss = combat.enemies.find((enemy) => enemy.id === 'boss');
  require(boss?.exclusiveWave === true && boss.rigRequiresSeparateCalibration === true &&
    boss.sizeMultiplier !== undefined && boss.massMultiplier !== undefined && boss.phaseTwoHpRatio !== undefined &&
    boss.phaseTwoHpRatio > 0 && boss.phaseTwoHpRatio < 1 && boss.phaseTwoIntervalMultiplier !== undefined,
  'combat.enemies.boss: 缺少独占波、体型、质量、二阶段或独立标定配置');

  const platformIds = new Set(levels.platforms.map((platform) => platform.id));
  const enemyById = new Map(combat.enemies.map((enemy) => [enemy.id, enemy]));
  const arrowIds = new Set(combat.arrows.map((arrow) => arrow.id));
  const levelById = new Map(levels.levels.map((level) => [level.id, level]));
  require(platformIds.has(levels.playerPlatformId), 'levels.playerPlatformId: 平台引用不存在');
  for (const platform of levels.platforms) {
    require(platform.surfaceY_M > combat.run.fallKillY_M, `levels.platforms.${platform.id}: 台面低于出界线`);
  }
  for (const level of levels.levels) {
    if (level.unlockArrow !== null) require(arrowIds.has(level.unlockArrow), `${level.id}.unlockArrow: 箭种引用不存在`);
    if (level.unlockLevel !== null) require(levelById.has(level.unlockLevel), `${level.id}.unlockLevel: 关卡引用不存在`);
    level.waves.forEach((wave, waveIndex) => {
      const path = `${level.id}.waves.${waveIndex}`;
      require(wave.length <= combat.limits.maxLiveEnemies, `${path}: 敌人数量超限`);
      unique(wave.map((spawn) => spawn.platformId), `${path}.platformId`);
      wave.forEach((spawn) => {
        require(enemyById.has(spawn.enemyId), `${path}: 敌人引用不存在`);
        require(platformIds.has(spawn.platformId), `${path}: 平台引用不存在`);
        require(spawn.platformId !== levels.playerPlatformId, `${path}: 敌人不可使用玩家出生平台`);
        if (enemyById.get(spawn.enemyId)?.exclusiveWave) require(wave.length === 1, `${path}: 首领波必须独占`);
      });
    });
  }
  // The configured first level is the new-save entry. Its unlock chain must reach every level exactly once.
  const visited = new Set<string>();
  let next: string | null = levels.levels[0]?.id ?? null;
  while (next !== null && !visited.has(next)) {
    visited.add(next);
    next = levelById.get(next)?.unlockLevel ?? null;
  }
  require(next === null, 'levels.unlockLevel: 解锁链存在循环');
  require(visited.size === levels.levels.length, 'levels.unlockLevel: 新档无法到达全部关卡');
  const unlockedArrows = new Set<string>(['normal']);
  for (const level of levels.levels) {
    if (level.unlockArrow !== null) {
      require(!unlockedArrows.has(level.unlockArrow), `${level.id}.unlockArrow: 不得重复解锁`);
      unlockedArrows.add(level.unlockArrow);
    }
  }
  require(unlockedArrows.size === arrowIds.size, 'levels.unlockArrow: 三种箭无法全部解锁');
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return pack;
}
