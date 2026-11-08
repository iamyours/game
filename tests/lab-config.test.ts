import assert from 'node:assert/strict';
import test from 'node:test';
import { readPhysicsLabConfig } from '../assets/scripts/core/PhysicsLabConfig.js';
import { readBootManifest } from '../assets/scripts/core/BootManifest.js';
import { loadSeedPack, renderGenerated } from '../tools/config/files.js';

test('PhysicsLab 启动配置来自同一哈希的生成物，拒绝旧版本与混包', async () => {
  const pack = await loadSeedPack();
  const generated = renderGenerated(pack);
  const manifest = readBootManifest(JSON.parse(generated.get('manifest.json')!));
  const resource = JSON.parse(generated.get('combat.json')!);
  assert.deepEqual(readPhysicsLabConfig(resource, manifest), pack.combat);
  assert.throws(() => readPhysicsLabConfig({ ...resource, seedHash: '0'.repeat(64) }, manifest), /不一致/);
  assert.throws(() => readPhysicsLabConfig({ ...resource, data: { ...resource.data, configVersion: 1 } }, manifest), /不一致/);
  assert.throws(() => readPhysicsLabConfig(null, manifest), /不一致/);
});

test('禁止配置第二步进器或引擎自动步与适配器并行', async () => {
  const { seedPackSchema } = await import('../tools/config/schema.js');
  const pack = await loadSeedPack();
  for (const change of [{ engineAutoSimulation: true }, { customSecondStepper: true }, { maxStepsPerFrame: 100 }]) {
    assert.equal(seedPackSchema.safeParse({ ...pack, combat: { ...pack.combat, physics: { ...pack.combat.physics, ...change } } }).success, false);
  }
});

test('松手单发种子拒绝自动连射与取消发射的旧规则', async () => {
  const { seedPackSchema } = await import('../tools/config/schema.js');
  const pack = await loadSeedPack();
  for (const change of [{ holdToFire: true }, { releaseToFire: false }, { cancelNeverFires: false }]) {
    assert.equal(seedPackSchema.safeParse({ ...pack, combat: { ...pack.combat,
      input: { ...pack.combat.input, ...change } } }).success, false);
  }
});

test('力度配置拒绝死区内满弓及轻拉等于满弓的退化映射', async () => {
  const { validateSeedPack } = await import('../tools/config/validate.js');
  const pack = await loadSeedPack();
  assert.throws(() => validateSeedPack({ ...pack, combat: { ...pack.combat,
    input: { ...pack.combat.input, fullDrawDistanceDesign: pack.combat.input.deadzoneDesign } } }), /满弓距离/);
  assert.throws(() => validateSeedPack({ ...pack, combat: { ...pack.combat,
    bowControl: { ...pack.combat.bowControl, minPowerRatio: 1 } } }), /轻拉倍率/);
});
