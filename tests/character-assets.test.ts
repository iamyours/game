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
