// Offline sprite-deformation QA only. Uses production pure geometry; NOT a Cocos/Box2D screenshot.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { bowArtPoint, bowArtStrip, spriteShear } from '../assets/scripts/domain/weaponGeometry.ts';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const spec = JSON.parse(await readFile('assets/resources/weapons/thunder-art.json', 'utf8'));
const bow = (await readFile('assets/resources/weapons/thunder-bow.png')).toString('base64');
const arrow = (await readFile('assets/resources/weapons/thunder-arrow.png')).toString('base64');
const states = [{ flex: 0, name: 'REST', depth: 0.55 }, { flex: 0.5, name: 'HALF DRAW', depth: 0.65 }, { flex: 1, name: 'FULL DRAW', depth: 0.75 }, { flex: -0.4, name: 'RELEASE', depth: null }];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1440" height="650"><defs><image id="bow" width="1254" height="1254" href="data:image/png;base64,${bow}"/><image id="arrow" width="2172" height="724" href="data:image/png;base64,${arrow}"/></defs><rect width="1440" height="650" fill="#142A38"/><text x="38" y="48" fill="#e7f5f8" font-size="25" font-family="sans-serif">THUNDER BOW / GRIP-ANCHORED FLEX</text><text x="38" y="75" fill="#93aeba" font-size="14" font-family="sans-serif">Offline texture deformation preview. Physics still requires the current Creator build.</text>`;
for (let k = 0; k < states.length; k++) {
 const state = states[k], scale = 265, ox = 225 + k * 350, oy = 340;
 svg += `<text x="${ox - 90}" y="124" fill="#8fe8f4" font-size="17" font-family="sans-serif">${state.name}</text>`;
 for (let i = 0; i < spec.bow.strips; i++) {
  const s = bowArtStrip(i, spec.bow, 0.64, 0.55, state.flex), [x,y,w,h] = s.rect;
  const t = spriteShear(s.shearX, s.verticalScale), deg = 180 / Math.PI;
  svg += `<g transform="translate(${ox + s.xM * scale},${oy - s.yM * scale}) rotate(${-t.rotationRad * deg}) scale(${t.scaleX},${t.scaleY})"><g transform="rotate(${-t.childRotationRad * deg}) scale(-1,1)"><svg x="${-s.widthM * scale / 2}" y="${-s.baseHeightM * scale / 2}" width="${s.widthM * scale}" height="${s.baseHeightM * scale}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none"><use href="#bow"/></svg></g></g>`;
 }
 const top = bowArtPoint(spec.bow.upperTip, spec.bow, 0.64, 0.55, state.flex), bottom = bowArtPoint(spec.bow.lowerTip, spec.bow, 0.64, 0.55, state.flex);
 const nock = state.depth === null || k === 0 ? (top.x + bottom.x) / 2 : -state.depth;
 svg += `<path d="M ${ox + top.x * scale} ${oy - top.y * scale} L ${ox + nock * scale} ${oy} L ${ox + bottom.x * scale} ${oy - bottom.y * scale}" fill="none" stroke="#c3f2ff" stroke-width="2"/>`;
 svg += `<circle cx="${ox}" cy="${oy}" r="4" fill="#ffb74d"/>`;
 if (k === 1 || k === 2) {
  const rect = spec.arrow.rect, length = 0.96, height = length * rect[3] / rect[2];
  svg += `<svg x="${ox - state.depth * scale}" y="${oy - height * scale / 2}" width="${length * scale}" height="${height * scale}" viewBox="${rect.join(' ')}" preserveAspectRatio="none"><use href="#arrow"/></svg>`;
 }
}
svg += '</svg>';
const dir = 'evidence/thunder-skin-20261111'; await mkdir(dir, { recursive: true });
// The SVG embeds two source PNGs and is an intermediate, so only persist the rendered QA artifact.
await sharp(Buffer.from(svg)).png().toFile(`${dir}/draw-states.png`);
console.log('Rendered rest, half/full draw and release directly from production geometry; not engine runtime.');
