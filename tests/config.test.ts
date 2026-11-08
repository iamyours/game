import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGeneratedFiles, generateFiles, loadSeedPack, renderGenerated, seedHash } from '../tools/config/files.js';
import { validateSeedPack } from '../tools/config/validate.js';
import type { SeedPack } from '../tools/config/schema.js';
import { describeBoot, readBootManifest } from '../assets/scripts/core/BootManifest.js';

const baseline = await loadSeedPack();
function copy(): SeedPack { return structuredClone(baseline); }

test('四份原始种子通过结构与交叉引用校验，但骨架稳定性仍未验收', () => {
  const pack = validateSeedPack(copy());
  assert.equal(pack.combat.feelTargets.validated, false);
  assert.equal(pack.rig.status, 'runtime_spec_ready_requires_stability');
});

const invalidCases: [string, (pack: SeedPack) => void, RegExp][] = [
  ['箭种重复', (p) => { p.combat.arrows[1]!.id = 'normal'; }, /combat.arrows.*重复/],
  ['敌人重复', (p) => { p.combat.enemies[1]!.id = 'archer'; }, /combat.enemies.*重复/],
  ['平台重复', (p) => { p.levels.platforms[1]!.id = p.levels.platforms[0]!.id; }, /levels.platforms.*重复/],
  ['关卡重复', (p) => { p.levels.levels[1]!.id = p.levels.levels[0]!.id; }, /levels.levels.*重复/],
  ['不存在的玩家平台', (p) => { p.levels.playerPlatformId = 'missing'; }, /playerPlatformId/],
  ['不存在的敌人平台', (p) => { p.levels.levels[0]!.waves[0]![0]!.platformId = 'missing'; }, /平台引用不存在/],
  ['敌我出生同台', (p) => { p.levels.levels[0]!.waves[0]![0]!.platformId = p.levels.playerPlatformId; }, /玩家出生平台/],
  ['同波平台重叠', (p) => { p.levels.levels[0]!.waves[2]![1]!.platformId = 'enemy_low'; }, /platformId.*重复/],
  ['无效解锁引用', (p) => { p.levels.levels[0]!.unlockLevel = 'missing'; }, /关卡引用不存在/],
  ['解锁自循环', (p) => { p.levels.levels[0]!.unlockLevel = 'L001'; }, /循环/],
  ['解锁多节点循环', (p) => { p.levels.levels[2]!.unlockLevel = 'L001'; }, /循环/],
  ['关卡不可达', (p) => { p.levels.levels[0]!.unlockLevel = 'L003'; }, /无法到达/],
  ['箭种解锁遗漏', (p) => { p.levels.levels[1]!.unlockArrow = null; }, /三种箭无法全部解锁/],
  ['箭种重复解锁', (p) => { p.levels.levels[1]!.unlockArrow = 'impact'; }, /重复解锁/],
  ['首领混编', (p) => { p.levels.levels[2]!.waves[2]!.push({ enemyId: 'archer', platformId: 'enemy_low', spawnDelaySec: 0 }); }, /首领波必须独占/],
  ['超出配置敌人上限', (p) => { p.combat.limits.maxLiveEnemies = 1; }, /敌人数量超限/],
  ['首领未独立标定', (p) => { delete p.combat.enemies[2]!.rigRequiresSeparateCalibration; }, /boss.*缺少/],
  ['质量比例非一', (p) => { p.rig.partGroups[0]!.massFractionTotal = 0.9; }, /质量比例必须为 1/],
  ['部位数量不符', (p) => { p.rig.partGroups[3]!.count = 3; }, /刚体数不匹配/],
  ['部位重复', (p) => { p.rig.partGroups[3]!.id = 'head'; }, /rig.partGroups.*重复/],
  ['瞄准初始角越界', (p) => { p.combat.input.initialAimDeg = 180; }, /初始角度/],
  ['设计画布竖屏', (p) => { p.combat.viewport.designWidth = 720; }, /必须横屏/],
  ['视野比例漂移', (p) => { p.combat.viewport.worldHeightM = 10; }, /宽高比不匹配/],
  ['摇杆死区过大', (p) => { p.combat.input.deadzoneDesign = 100; }, /死区/],
  ['过大箭冲量', (p) => { p.combat.arrows[0]!.impulseNs = 100; }, /冲量超过/],
  ['过大体力消耗', (p) => { p.combat.arrows[0]!.staminaCost = 101; }, /体力消耗/],
  ['普通箭错误溢出', (p) => { p.combat.arrows[0]!.armorOverflow = true; }, /只有穿甲箭/],
  ['过大玩家冲量上限', (p) => { p.combat.reaction.playerMaxIncomingImpulseNs = 5; }, /玩家冲量/],
  ['出生点在出界线下', (p) => { p.levels.platforms[0]!.surfaceY_M = -10; }, /出界线/],
  ['常态预算超过峰值', (p) => { p.combat.limits.peakBodiesBudget = 60; }, /常态刚体/],
  ['单人插箭超过全场', (p) => { p.combat.limits.maxEmbeddedVisuals = 1; }, /单角色插箭/],
  ['攻击间隔小于蓄势', (p) => { p.combat.enemies[0]!.telegraphSec = 10; }, /蓄势必须短于/],
];
for (const [name, mutate, pattern] of invalidCases) {
  test(`配置拒绝：${name}`, () => { const pack = copy(); mutate(pack); assert.throws(() => validateSeedPack(pack), pattern); });
}
for (const [name, value] of [['空值', null], ['数组', []], ['空对象', {}]] as const) {
  test(`配置拒绝：${name}`, () => assert.throws(() => validateSeedPack(value)));
}
test('结构校验拒绝未知字段、非有限数、负尺寸和颠倒区间', () => {
  for (const mutate of [
    (p: SeedPack) => { Object.assign(p.combat, { typo: 1 }); },
    (p: SeedPack) => { p.combat.arrows[0]!.speedMps = Infinity; },
    (p: SeedPack) => { p.levels.platforms[0]!.widthM = -1; },
    (p: SeedPack) => { p.combat.enemies[0]!.attackIntervalRangeSec = [3, 2]; },
  ]) { const pack = copy(); mutate(pack); assert.throws(() => validateSeedPack(pack)); }
});
test('生成结果确定、标明未验证、来源与 SHA-256 完整', () => {
  const a = renderGenerated(baseline);
  assert.deepEqual(a, renderGenerated(copy()));
  assert.match(seedHash(baseline), /^[a-f0-9]{64}$/);
  const manifest = readBootManifest(JSON.parse(a.get('manifest.json')!));
  assert.equal(manifest.runtimeVerified, false);
  assert.match(describeBoot(manifest), /尚未实现\/验证/);
  for (const name of ['combat', 'rig', 'levels', 'platform']) {
    const entry = JSON.parse(a.get(`${name}.json`)!);
    assert.equal(entry.generatedFrom, `configs/${name}.seed.json`);
    assert.equal(entry.sourceKind, 'unverified_seed');
  }
});
test('种子变化会改变哈希', () => {
  const changed = copy(); changed.combat.arrows[0]!.speedMps += 1;
  assert.notEqual(seedHash(changed), seedHash(baseline));
});
test('漂移检查拒绝元数据/数值篡改与文件缺失', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'storm-config-'));
  try {
    await generateFiles(baseline, directory);
    await checkGeneratedFiles(baseline, directory);
    const path = join(directory, 'combat.json');
    const entry = JSON.parse(await readFile(path, 'utf8'));
    entry.runtimeVerified = true;
    await writeFile(path, JSON.stringify(entry));
    await assert.rejects(checkGeneratedFiles(baseline, directory), /combat.json/);
    await generateFiles(baseline, directory);
    await rm(join(directory, 'manifest.json'));
    await assert.rejects(checkGeneratedFiles(baseline, directory), /ENOENT/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('启动清单拒绝被误标为已验证、无效版本、哈希与尺寸', () => {
  const raw = JSON.parse(renderGenerated(baseline).get('manifest.json')!);
  for (const patch of [{ runtimeVerified: true }, { sourceKind: 'production' }, { formatVersion: 99 }, { seedHash: 'bad' }]) {
    assert.throws(() => readBootManifest({ ...raw, ...patch }));
  }
  assert.throws(() => readBootManifest({ ...raw, summary: { ...raw.summary, designWidth: 1 } }));
});
