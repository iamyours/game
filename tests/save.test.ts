import assert from 'node:assert/strict';
import test from 'node:test';
import { SaveRepository, type StoragePort } from '../assets/scripts/domain/SaveRepository.js';
import { loadSeedPack } from '../tools/config/files.js';
const { levels } = await loadSeedPack();
class Memory implements StoragePort {
  data = new Map<string, string>(); failWrite = false; failBackup = false; failRead = false;
  getItem(key: string) { if (this.failRead) throw Error('denied'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrite || (this.failBackup && key.includes('.backup'))) throw Error('full');
    this.data.set(key, value);
  }
}
const key = 'storm-archers.save';

test('新档顺序解锁三关及两箭，重复 runId/重复首通无新增，重载保留设置', () => {
  const storage = new Memory(), save = new SaveRepository(storage, levels.levels);
  assert.deepEqual(save.snapshot.unlockedLevels, ['L001']);
  assert.throws(() => save.settle('locked', 'L003', 'won'));
  assert.equal(save.settle('lose', 'L001', 'lost').applied, true);
  assert.deepEqual(save.snapshot.unlockedLevels, ['L001']);
  for (const level of levels.levels) assert.equal(save.settle(level.id, level.id, 'won').write.ok, true);
  assert.deepEqual(save.snapshot.unlockedArrows, ['normal', 'impact', 'piercing']);
  assert.equal(save.settle('L001', 'L001', 'won').applied, false);
  assert.throws(() => save.settle('L001', 'L001', 'lost'), /冲突/);
  save.settle('another-run', 'L001', 'won');
  assert.equal(save.snapshot.firstClears.length, 3);
  save.setPreferences({ soundEnabled: false, tutorialSeen: true });
  const reload = new SaveRepository(storage, levels.levels);
  assert.equal(reload.snapshot.soundEnabled, false); assert.equal(reload.snapshot.tutorialSeen, true);
  assert.equal(reload.settle('L001', 'L001', 'won').applied, false);
  const copy = reload.snapshot; copy.unlockedLevels.length = 0;
  assert.equal(reload.snapshot.unlockedLevels.length, 3);
});

test('写入失败保留内存进度供重试，重复结算重试持久化而不重复授予', () => {
  const storage = new Memory(), save = new SaveRepository(storage, levels.levels);
  storage.failWrite = true;
  const result = save.settle('r1', 'L001', 'won');
  assert.deepEqual(result.write, { ok: false, reason: 'write-failed' });
  assert.equal(save.dirty, true); assert.ok(save.snapshot.unlockedLevels.includes('L002'));
  storage.failWrite = false;
  assert.deepEqual(save.settle('r1', 'L001', 'won'), { applied: false, write: { ok: true } });
  assert.equal(save.dirty, false);
  assert.equal(new SaveRepository(storage, levels.levels).snapshot.settlements.length, 1);
});

test('坏档先备份再回退；备份失败不得覆盖原档，重试不覆盖旧备份', () => {
  const storage = new Memory(); storage.data.set(key, '{bad'); storage.data.set(key + '.backup', 'earlier');
  storage.failBackup = true;
  const save = new SaveRepository(storage, levels.levels);
  assert.equal(save.loadStatus, 'recovered');
  assert.deepEqual(save.flush(), { ok: false, reason: 'backup-failed' });
  assert.equal(storage.data.get(key), '{bad');
  storage.failBackup = false; assert.equal(save.flush().ok, true);
  assert.equal(storage.data.get(key + '.backup'), 'earlier');
  assert.equal(storage.data.get(key + '.backup.1'), '{bad');
  assert.equal(JSON.parse(storage.data.get(key)!).schemaVersion, 1);
});

test('读取异常或未来版本禁止覆写；未知版本/坏字段不静默转为有效档', () => {
  const storage = new Memory(); storage.failRead = true;
  const blocked = new SaveRepository(storage, levels.levels);
  assert.deepEqual(blocked.flush(), { ok: false, reason: 'read-failed' });
  storage.failRead = false; storage.data.set(key, '{"schemaVersion":2,"valuable":"future"}');
  const future = new SaveRepository(storage, levels.levels);
  future.setPreferences({ soundEnabled: false });
  assert.deepEqual(future.flush(), { ok: false, reason: 'future-version' });
  assert.equal(storage.data.get(key), '{"schemaVersion":2,"valuable":"future"}');
  for (const raw of ['[]', 'null', '{"schemaVersion":-1}', '{"schemaVersion":1}']) {
    storage.data.set(key, raw);
    assert.equal(new SaveRepository(storage, levels.levels).loadStatus, 'recovered');
  }
});

test('v0 明确迁移，保留旧原文；无法从未通关的后续关卡越级解锁', () => {
  const storage = new Memory();
  const raw = JSON.stringify({ schemaVersion: 0, completedLevels: ['L001', 'L002'], soundEnabled: false });
  storage.data.set(key, raw);
  const save = new SaveRepository(storage, levels.levels);
  assert.equal(save.loadStatus, 'migrated');
  assert.deepEqual(save.snapshot.unlockedLevels, ['L001', 'L002', 'L003']);
  assert.equal(save.snapshot.soundEnabled, false);
  assert.equal(save.flush().ok, true); assert.equal(storage.data.get(key + '.backup'), raw);
  storage.data.set(key, JSON.stringify({ schemaVersion: 0, completedLevels: ['L003'], soundEnabled: true }));
  assert.deepEqual(new SaveRepository(storage, levels.levels).snapshot.unlockedLevels, ['L001']);
});

test('页面流程先完成对局才写结果；重复结果回调去重，重试新 runId，未解锁不可进', async () => {
  const { PageFlow } = await import('../assets/scripts/domain/PageFlow.js');
  const storage = new Memory(), save = new SaveRepository(storage, levels.levels);
  let serial = 0;
  const flow = new PageFlow(save, levels.levels, 1.5, () => `flow-${++serial}`);
  flow.settings(); assert.equal(flow.snapshot.page, 'settings'); flow.closeSettings();
  assert.throws(() => flow.begin('L003'));
  const run = flow.begin('L001'); run.start();
  assert.throws(() => flow.showResult());
  for (let i = 0; i < 3; i++) {
    const snapshot = () => ({ playerAlive: true, playerOutOfBounds: false, hostileProjectiles: 0,
      enemies: run.enemiesToSpawn.map(e => ({ id: e.id, alive: false, outOfBounds: false })) });
    run.afterStep(1 / 60, snapshot());
    if (i < 2) run.afterStep(1.5, snapshot());
  }
  assert.equal(flow.showResult().applied, true);
  assert.equal(flow.showResult().applied, false);
  const next = flow.next(); assert.equal(next.snapshot.levelId, 'L002');
  assert.notEqual(next.runId, run.runId);
  next.start(); next.afterStep(1 / 60, { playerAlive: false, playerOutOfBounds: false, enemies: [], hostileProjectiles: 0 });
  flow.showResult(); const retry = flow.retry(); assert.notEqual(retry.runId, next.runId);
  flow.home(); assert.equal(flow.snapshot.page, 'home'); assert.equal(flow.session, null);
});
