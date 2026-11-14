// Offline QA of production texture strips and geometry. Does not run Creator or physics.
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { bowArtPoint, bowArtStrip, spriteShear, validateThunderArt } from '../assets/scripts/domain/weaponGeometry.ts';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const config = JSON.parse(await readFile('configs/combat.seed.json', 'utf8'));
const states = [{ flex: 0, name: 'REST', depth: null }, { flex: 0.5, name: 'HALF DRAW', depth: 0.65 },
  { flex: 1, name: 'FULL DRAW', depth: 0.75 }, { flex: -0.4, name: 'RELEASE', depth: null }];
const variants = [['thunder', '#93E5FF'], ['gale', '#A5E6B5'], ['moon', '#CBB6FF']];
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1710"><rect width="1440" height="1710" fill="#142A38"/><text x="35" y="35" fill="#E7F5F8" font-size="23" font-family="sans-serif">THREE GPT WEAPONS / GRIP-ANCHORED FLEX</text><text x="35" y="60" fill="#93AEBA" font-size="14" font-family="sans-serif">Offline texture + production geometry preview. Creator runtime still requires verification.</text>';
for (let row = 0; row < variants.length; row++) {
  const [id, tint] = variants[row], spec = JSON.parse(await readFile(`assets/resources/weapons/${id}-art.json`, 'utf8'));
  validateThunderArt(spec);
  const bow = (await readFile(`assets/resources/weapons/${id === 'thunder' ? 'thunder-bow' : `${id}-weapon`}.png`)).toString('base64');
  const arrow = (await readFile(`assets/resources/weapons/${id === 'thunder' ? 'thunder-arrow' : `${id}-weapon`}.png`)).toString('base64');
  const crop = (image, size, rect, x, y, width, height) => `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${rect.join(' ')}" preserveAspectRatio="none"><image width="${size[0]}" height="${size[1]}" href="data:image/png;base64,${image}"/></svg>`;
  svg += `<text x="35" y="${100 + row * 535}" fill="${tint}" font-size="21" font-family="sans-serif">${id.toUpperCase()}</text>`;
  for (let col = 0; col < states.length; col++) {
    const state = states[col], scale = 235, ox = 220 + col * 350, oy = 345 + row * 535;
    svg += `<text x="${ox - 90}" y="${135 + row * 535}" fill="${tint}" font-size="16" font-family="sans-serif">${state.name}</text>`;
    for (let i = 0; i < spec.bow.strips; i++) {
      const s = bowArtStrip(i, spec.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, state.flex);
      const t = spriteShear(s.shearX, s.verticalScale), deg = 180 / Math.PI;
      svg += `<g transform="translate(${ox + s.xM * scale},${oy - s.yM * scale}) rotate(${-t.rotationRad * deg}) scale(${t.scaleX},${t.scaleY})"><g transform="rotate(${-t.childRotationRad * deg}) scale(-1,1)">${crop(bow, spec.bow.imageSize, s.rect, -s.widthM * scale / 2, -s.baseHeightM * scale / 2, s.widthM * scale, s.baseHeightM * scale)}</g></g>`;
    }
    const top = bowArtPoint(spec.bow.upperTip, spec.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, state.flex);
    const bottom = bowArtPoint(spec.bow.lowerTip, spec.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, state.flex);
    const nock = state.depth === null ? (top.x + bottom.x) / 2 : -state.depth;
    svg += `<path d="M${ox + top.x * scale},${oy - top.y * scale}L${ox + nock * scale},${oy}L${ox + bottom.x * scale},${oy - bottom.y * scale}" fill="none" stroke="${tint}" stroke-width="2"/><circle cx="${ox}" cy="${oy}" r="3" fill="#FFB74D"/>`;
    if (state.depth !== null) {
      const length = 1.28, height = Math.max(0.18, length * spec.arrow.rect[3] / spec.arrow.rect[2]);
      svg += crop(arrow, spec.arrow.imageSize, spec.arrow.rect, ox - state.depth * scale, oy - height * scale / 2, length * scale, height * scale);
    }
  }
}
svg += '</svg>';
const dir = process.env.WEAPON_PREVIEW_DIR || 'evidence/weapon-art-20261114';
await mkdir(dir, { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(`${dir}/draw-states.png`);
console.log(`${dir}/draw-states.png: three textures, four draw states; offline only.`);
