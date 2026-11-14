import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { optimizeBuiltStartup } = require('../scripts/optimize-startup.cjs');

test('构建缩短默认插屏、保留logo/watermark，MD5文件重命名并更新入口引用，重复执行幂等', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-startup-'));
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/settings.abcde.json'), JSON.stringify({ splashScreen: { totalTime: 3000, logo: { type: 'default' }, displayWatermark: true, clearColor: { x: 0, y: 0, z: 0, w: 1 } }, screen: { orientation: 'landscape' } }));
    writeFileSync(join(dir, 'application.js'), 'this.settingsPath = "src/settings.abcde.json";');
    const result = optimizeBuiltStartup(dir);
    assert.equal(result.status, 'optimized'); assert.equal(result.minimumMs, 500);
    assert.ok(!readdirSync(join(dir, 'src')).includes('settings.abcde.json'));
    assert.ok(readFileSync(join(dir, 'application.js'), 'utf8').includes(result.settings));
    const data = JSON.parse(readFileSync(join(dir, 'src', result.settings)));
    assert.deepEqual(data.splashScreen.logo, { type: 'default' }); assert.equal(data.splashScreen.displayWatermark, true);
    assert.equal(data.screen.orientation, 'landscape'); assert.equal(data.splashScreen.totalTime, 500);
    assert.equal(optimizeBuiltStartup(dir).status, 'unchanged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('关闭的插屏不重新打开；无入口引用的MD5设置拒绝改写且原件完整', () => {
  const dir = mkdtempSync(join(tmpdir(), 'storm-startup-'));
  try {
    mkdirSync(join(dir, 'src'));
    const file = join(dir, 'src/settings.abcde.json'), original = JSON.stringify({ splashScreen: { totalTime: 2000 } });
    writeFileSync(file, original);
    assert.throws(() => optimizeBuiltStartup(dir), /reference/); assert.equal(readFileSync(file, 'utf8'), original);
    writeFileSync(file, JSON.stringify({ splashScreen: { totalTime: 0 } }));
    assert.equal(optimizeBuiltStartup(dir).status, 'unchanged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
