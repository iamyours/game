import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadSeedPack } from '../tools/config/files.js';
const pack = await loadSeedPack();

test('两套角色 PNG 为 RGBA，哈希与尺寸吻合；11 个身体和装备切片均在边界内', async () => {
  for (const skin of ['hero', 'enemy']) {
    const base = new URL(`../assets/resources/characters/${skin}-`, import.meta.url);
    const image = await readFile(new URL(base.href + 'atlas.png'));
    const spec = JSON.parse(await readFile(new URL(base.href + 'frames.json'), 'utf8')) as {
      imageSize: [number, number]; sha256: string; frames: Record<string, { rect: number[]; anchor: number[] }>;
    };
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image[25], 6, 'PNG color type 6 = RGBA');
    assert.deepEqual(spec.imageSize, [image.readUInt32BE(16), image.readUInt32BE(20)]);
    assert.equal(createHash('sha256').update(image).digest('hex'), spec.sha256);
    assert.equal(Object.keys(spec.frames).length, 16);
    for (const id of [...pack.rig.bodyDefinitions.map(b => b.id), 'bow', 'normal', 'impact', 'piercing', 'helmet']) {
      const frame = spec.frames[id]!;
      assert.ok(frame, id);
      const [x, y, w, h] = frame.rect as [number, number, number, number];
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
      assert.ok(x + w <= spec.imageSize[0] && y + h <= spec.imageSize[1]);
      assert.deepEqual(frame.anchor, [0.5, 0.5]);
    }
  }
});

test('遗迹v2四张原图哈希/尺寸与清单一致；人物11片与平台三段不越界', async () => {
  const base = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('assets/resources/scenery/ruins-art-v2.json', base), 'utf8'));
  assert.equal(manifest.runtimeVerified, false, '素材检查不替代引擎验收');
  for (const [name, asset] of Object.entries(manifest.assets) as [string, { path: string; imageSize: number[]; sha256: string; rect?: number[]; capWidthPx?: number; frames?: string }][]) {
    const image = await readFile(new URL(asset.path, base));
    assert.equal(createHash('sha256').update(image).digest('hex'), asset.sha256, name);
    assert.deepEqual(asset.imageSize, [image.readUInt32BE(16), image.readUInt32BE(20)]);
    if (name !== 'background') assert.equal(image[25], 6, `${name}须有透明通道`);
    if (asset.frames) {
      const spec = JSON.parse(await readFile(new URL(`assets/resources/${asset.frames}.json`, base), 'utf8'));
      assert.equal(spec.sha256, asset.sha256); assert.deepEqual(spec.imageSize, asset.imageSize);
      assert.deepEqual(Object.keys(spec.frames).sort(), pack.rig.bodyDefinitions.map(b => b.id).sort());
      for (const body of pack.rig.bodyDefinitions) {
        const [x, y, w, h] = spec.frames[body.id].rect;
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= asset.imageSize[0]! && y + h <= asset.imageSize[1]!, body.id);
      }
    }
    if (asset.rect) {
      const [x, y, w, h] = asset.rect as [number, number, number, number];
      assert.ok(x >= 0 && y >= 0 && x + w <= asset.imageSize[0]! && y + h <= asset.imageSize[1]!);
      assert.ok(asset.capWidthPx! * 2 < w, '平台中段必须有正宽度');
    }
  }
});
