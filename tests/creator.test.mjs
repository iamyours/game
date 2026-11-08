import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creatorBuildArgs, normalizeCreatorBuildStatus, projectBlockers } from '../scripts/creator-support.mjs';

test('Creator 成功码 36 归一为 0，0 / 失败码 / 信号退出不能被误当构建成功', () => {
  assert.equal(normalizeCreatorBuildStatus(36), 0);
  for (const status of [0, 32, 34, null]) assert.notEqual(normalizeCreatorBuildStatus(status), 0);
});
test('CLI 使用 --project，并以编辑器 meta 的 UUID 选择启动场景', () => {
  assert.deepEqual(creatorBuildArgs('/project with spaces', 'actual-editor-uuid'),
    ['--project', '/project with spaces', '--build', 'platform=web-desktop;debug=true;startScene=actual-editor-uuid']);
});
test('未生成的工程阻止构建，版本不匹配和缺失 scene/meta 均被报告', () => {
  const root = mkdtempSync(join(tmpdir(), 'storm-creator-'));
  try {
    assert.ok(projectBlockers(root).length > 0);
    mkdirSync(join(root, 'configs')); mkdirSync(join(root, 'temp')); mkdirSync(join(root, 'assets/scenes'), { recursive: true });
    writeFileSync(join(root, 'configs/engine.lock.json'), JSON.stringify({ patch: '3.8.8' }));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ creator: { version: '3.8.8' } }));
    writeFileSync(join(root, 'temp/tsconfig.cocos.json'), '{}');
    assert.deepEqual(projectBlockers(root), []);
    assert.equal(projectBlockers(root, { requireScene: true }).length, 2);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ creator: { version: '3.8.7' } }));
    assert.match(projectBlockers(root).join('\n'), /版本/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
