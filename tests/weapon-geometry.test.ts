import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { bowArtPoint, bowArtStrip, handDrawFlex, nockedArrowTip, spriteShear, validateThunderArt, type ThunderArtSpec } from '../assets/scripts/domain/weaponGeometry.js';
const spec = JSON.parse(await readFile(new URL('../assets/resources/weapons/thunder-art.json', import.meta.url), 'utf8')) as ThunderArtSpec & { sha256: Record<string, string> };

test('雷霆透明PNG尺寸、哈希和所有分片有效；不含旧概念图背景', async () => {
  validateThunderArt(spec);
  for (const [name, part] of [['thunder-bow', spec.bow], ['thunder-arrow', spec.arrow]] as const) {
    const bytes = await readFile(new URL(`../assets/resources/weapons/${name}.png`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG'); assert.equal(bytes[25], 6);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], part.imageSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256[name]);
  }
});

test('弯曲和前向回弹都固定握点；弦端后移/缩拢，双侧弓臂同步', () => {
  for (const flex of [-0.4, 0, 0.5, 1]) {
    const grip = bowArtPoint(spec.bow.grip, spec.bow, 0.64, 0.55, flex); assert.ok(Math.hypot(grip.x, grip.y) < 1e-12);
  }
  for (const pixel of [spec.bow.upperTip, spec.bow.lowerTip]) {
    const rest = bowArtPoint(pixel, spec.bow, 0.64, 0.55, 0), half = bowArtPoint(pixel, spec.bow, 0.64, 0.55, 0.5), full = bowArtPoint(pixel, spec.bow, 0.64, 0.55, 1);
    assert.ok(full.x < half.x && half.x < rest.x);
    assert.ok(Math.abs(full.y) < Math.abs(half.y) && Math.abs(half.y) < Math.abs(rest.y));
    assert.ok(bowArtPoint(pixel, spec.bow, 0.64, 0.55, -0.4).x > rest.x);
  }
});

test('40段弓身在拉满与回弹时无负尺寸、切片越界或纵向裂缝，握把不靠整体缩放', () => {
  for (const flex of [-0.4, 0, 0.5, 1]) {
    const strips = Array.from({ length: spec.bow.strips }, (_, i) => bowArtStrip(i, spec.bow, 0.64, 0.55, flex));
    for (let i = 0; i < strips.length; i++) {
      const s = strips[i]!; assert.ok(s.widthM > 0 && s.heightM > 0);
      assert.ok(s.rect[1] >= spec.bow.rect[1] && s.rect[1] + s.rect[3] <= spec.bow.rect[1] + spec.bow.rect[3]);
      assert.equal(s.widthM, bowArtStrip(i, spec.bow, 0.64, 0.55, 0).widthM);
      if (i) { const previous = strips[i - 1]!; assert.ok(previous.yM - previous.heightM / 2 <= s.yM + s.heightM / 2 + 1e-9); }
    }
  }
});

test('弓臂不能抢先于真实拉弦手变满；左右朝向与不同世界角一致', () => {
  for (const angleRad of [0, 0.4, Math.PI, Math.PI + 0.4]) for (const amount of [0, 0.5, 1]) {
    const socket = { x: 4, y: 6, angleRad }, depth = 0.55 + 0.2 * amount;
    const hand = { x: socket.x - Math.cos(angleRad) * depth, y: socket.y - Math.sin(angleRad) * depth };
    assert.ok(Math.abs(handDrawFlex(socket, hand, 0.55, 0.2, 1) - amount) < 1e-9);
    assert.ok(handDrawFlex(socket, hand, 0.55, 0.2, 0.25) <= 0.25);
  }
});

test('搭箭保持刚性长度，真实发射复用同一个箭尖；向左和高仰角不跳位置', () => {
  for (const angle of [-0.2, 0, 1.2, Math.PI]) for (const length of [0.96, 1.02, 1.1]) {
    const hand = { x: 3.7, y: 4.8 }, tip = nockedArrowTip(hand, angle, length);
    assert.ok(Math.abs(Math.hypot(tip.x - hand.x, tip.y - hand.y) - length) < 1e-9);
    assert.ok(Math.abs((tip.x - hand.x) * Math.sin(angle) - (tip.y - hand.y) * Math.cos(angle)) < 1e-9);
  }
});

test('切片表拒绝越界、反向弦端和过量分片', () => {
  for (const mutate of [(s: ThunderArtSpec) => { s.bow = { ...s.bow, strips: 200 }; },
    (s: ThunderArtSpec) => { s.bow = { ...s.bow, upperTip: [810, 900] }; },
    (s: ThunderArtSpec) => { s.arrow = { ...s.arrow, rect: [0, 0, 99999, 300] }; }]) {
    const copy = structuredClone(spec); mutate(copy); assert.throws(() => validateThunderArt(copy));
  }
});


test('公开节点旋转/缩放分解等于连续剪切，横切边界不会出现平移台阶', () => {
  for (const flex of [-0.4, 0, 0.5, 1]) for (let i = 0; i < spec.bow.strips; i++) {
    const s = bowArtStrip(i, spec.bow, 0.64, 0.55, flex), t = spriteShear(s.shearX, s.verticalScale);
    for (const [x, y] of [[1, 0], [0, 1], [-0.3, 0.2]]) {
      const rx = Math.cos(t.childRotationRad) * x! - Math.sin(t.childRotationRad) * y!;
      const ry = Math.sin(t.childRotationRad) * x! + Math.cos(t.childRotationRad) * y!;
      const resultX = Math.cos(t.rotationRad) * t.scaleX * rx - Math.sin(t.rotationRad) * t.scaleY * ry;
      const resultY = Math.sin(t.rotationRad) * t.scaleX * rx + Math.cos(t.rotationRad) * t.scaleY * ry;
      assert.ok(Math.abs(resultX - (x! + s.shearX * y!)) < 1e-10);
      assert.ok(Math.abs(resultY - s.verticalScale * y!) < 1e-10);
    }
  }
});
