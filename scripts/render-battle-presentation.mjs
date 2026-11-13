// Offline visual QA: production Graphics paths, camera framing, HUD and original atlas crops.
// The posed actors are illustrative; this does NOT run Cocos, Box2D or validate gameplay.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
const out = process.env.PRESENTATION_PREVIEW_DIR || 'evidence/art-direction-20261113'; mkdirSync(out, { recursive: true });
const paths = [];
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
  fromHEX(hex) { const h = hex.replace('#', ''); this.r = parseInt(h.slice(0, 2), 16); this.g = parseInt(h.slice(2, 4), 16); this.b = parseInt(h.slice(4, 6), 16); this.a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255; return this; }
  toString() { return `rgba(${this.r},${this.g},${this.b},${this.a / 255})`; }
}
class Node {
  constructor(name = '') { this.name = name; this.children = []; this.components = new Map(); this.active = true; this.worldPosition = { x: 0, y: 0, z: 0 }; }
  set parent(p) { this._parent = p; p?.children.push(this); } get parent() { return this._parent; }
  addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
  getComponent(Type) { if (!this.components.has(Type)) this.addComponent(Type); return this.components.get(Type); }
  setPosition(x, y) { this.x = x; this.y = y; } setWorldPosition(x, y, z) { this.worldPosition = { x, y, z }; }
}
class Graphics {
  constructor() { this.path = ''; this.commands = []; this.fillColor = new Color(); this.strokeColor = new Color(); this.lineWidth = 1; paths.push(this); }
  clear() { this.commands.length = 0; this.path = ''; }
  moveTo(x, y) { this.path += `M${x},${y} `; } lineTo(x, y) { this.path += `L${x},${y} `; }
  bezierCurveTo(...p) { this.path += `C${p.join(',')} `; }
  close() { this.path += 'Z '; }
  rect(x, y, w, h) { this.path += `M${x},${y}h${w}v${h}h${-w}Z `; }
  roundRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    this.path += `M${x + r},${y}h${w - 2 * r}q${r},0 ${r},${r}v${h - 2 * r}q0,${r} ${-r},${r}h${2 * r - w}q${-r},0 ${-r},${-r}v${2 * r - h}q0,${-r} ${r},${-r}Z `;
  }
  circle(x, y, r) { this.path += `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0 `; }
  fill() { this.commands.push(`<path d="${this.path}" fill="${this.fillColor}"/>`); this.path = ''; }
  stroke() { this.commands.push(`<path d="${this.path}" fill="none" stroke="${this.strokeColor}" stroke-width="${this.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`); this.path = ''; }
}
class UITransform { setContentSize(w, h) { this.width = w; this.height = h; } }
class Label { static Overflow = { SHRINK: 1 }; constructor() { this.node = new Node(); this.string = ''; this.color = new Color(); } }
const view = { scale: 1, getScaleX() { return this.scale; }, getScaleY() { return this.scale; },
  setDesignResolutionSize(w, h, policy) { this.scale = policy === 1 ? screen.windowSize.height / h : screen.windowSize.width / w; } };
const screen = { windowSize: { width: 1440, height: 810 }, devicePixelRatio: 1 };
const cc = new Proxy({ Color, Node, Graphics, Label, UITransform, Component: class {}, _decorator: { ccclass: () => x => x },
  PHYSICS_2D_PTM_RATIO: 32, ResolutionPolicy: { FIXED_HEIGHT: 1, FIXED_WIDTH: 2 }, view, screen,
  sys: { getSafeAreaRect: () => ({ x: 0, y: 0, xMax: screen.windowSize.width / view.scale, yMax: screen.windowSize.height / view.scale }) },
}, { get: (object, key) => object[key] ?? class {} });
const cache = new Map();
function load(file) {
  file = resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  const localRequire = name => name === 'cc' ? cc : load(resolve(dirname(file), name.replace(/\.js$/, '.ts') + (/\.(ts|js)$/.test(name) ? '' : '.ts')));
  const context = { exports: module.exports, module, require: localRequire, console, URLSearchParams,
    document: { fullscreenEnabled: true, fullscreenElement: null } };
  vm.runInNewContext(js, context, { filename: file }); return module.exports;
}
const { PhysicsLab } = load('assets/scripts/presentation/PhysicsLab.ts');
const { LabViewport } = load('assets/scripts/presentation/LabViewport.ts');
const { drawWeaponArrow, drawWeaponBow, WEAPON_STYLES } = load('assets/scripts/presentation/WeaponVisual.ts');
const { battleFrame } = load('assets/scripts/domain/BattleLayout.ts');
const { armGeometry, solveArm } = load('assets/scripts/domain/archery.ts');
const { bowArtStrip, bowArtPoint, spriteShear } = load('assets/scripts/domain/weaponGeometry.ts');
const { InputRouter } = load('assets/scripts/input/InputRouter.ts');
const { drawRuinsPlatform, drawImpactMark, drawChargeCue } = load('assets/scripts/presentation/BattleArt.ts');
const config = JSON.parse(readFileSync('configs/combat.seed.json'));
const rig = JSON.parse(readFileSync('configs/rig.seed.json'));
const bodies = new Map(rig.bodyDefinitions.map(b => [b.id, b]));
const art = Object.fromEntries(['hero', 'enemy'].map(name => [name, {
  spec: JSON.parse(readFileSync(`assets/resources/characters/${name}-frames.json`)),
  image: readFileSync(`assets/resources/characters/${name}-atlas.png`).toString('base64'),
}]));
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const thunder = JSON.parse(readFileSync('assets/resources/weapons/thunder-art.json'));
const thunderBow = readFileSync('assets/resources/weapons/thunder-bow.png').toString('base64');
const thunderArrow = readFileSync('assets/resources/weapons/thunder-arrow.png').toString('base64');
function thunderSvg(socket, hand) {
  const deg = 180 / Math.PI, parts = [];
  const crop = (image, sourceSize, rect, w, h, x = -w / 2) => `<g transform="scale(1,-1)"><svg x="${x}" y="${-h / 2}" width="${w}" height="${h}" viewBox="${rect.join(' ')}" preserveAspectRatio="none"><image width="${sourceSize[0]}" height="${sourceSize[1]}" href="data:image/png;base64,${image}"/></svg></g>`;
  for (let i = 0; i < thunder.bow.strips; i++) {
    const s = bowArtStrip(i, thunder.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, 0.7), t = spriteShear(s.shearX, s.verticalScale);
    parts.push(`<g transform="translate(${s.xM * 32},${s.yM * 32}) rotate(${t.rotationRad * deg}) scale(${t.scaleX},${t.scaleY})"><g transform="rotate(${t.childRotationRad * deg}) scale(-1,1)">${crop(thunderBow, thunder.bow.imageSize, s.rect, s.widthM * 32, s.baseHeightM * 32)}</g></g>`);
  }
  const top = bowArtPoint(thunder.bow.upperTip, thunder.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, 0.7);
  const bottom = bowArtPoint(thunder.bow.lowerTip, thunder.bow, config.bowControl.bowHalfHeightM, config.bowControl.braceDepthM, 0.7);
  parts.push(`<path d="M${top.x * 32},${top.y * 32}L${-0.69 * 32},0L${bottom.x * 32},${bottom.y * 32}" fill="none" stroke="#C3F2FF" stroke-width="0.65"/>`);
  const length = WEAPON_STYLES.normal.arrowLength;
  parts.push(`<g transform="translate(${(length - 0.69) * 32},0)">${crop(thunderArrow, thunder.arrow.imageSize, thunder.arrow.rect, length * 32, Math.max(0.18, length * thunder.arrow.rect[3] / thunder.arrow.rect[2]) * 32, -length * 32)}</g>`);
  return `<g transform="translate(${socket.x * 32},${socket.y * 32}) rotate(${socket.angleRad * deg})">${parts.join('')}</g>`;
}
function actorSvg(skin, origin, mirrored, angle) {
  const data = art[skin], elements = [];
  const crop = (id, x, y, w, h, rotation = 0) => {
    const rect = data.spec.frames[id].rect;
    elements.push(`<g transform="translate(${x * 32},${y * 32}) rotate(${rotation})"><g transform="scale(1,-1)"><svg x="${-w * 16}" y="${-h * 16}" width="${w * 32}" height="${h * 32}" viewBox="${rect.join(' ')}" preserveAspectRatio="none"><image width="1254" height="1254" href="data:image/png;base64,${data.image}"/></svg></g></g>`);
  };
  for (const b of rig.bodyDefinitions.filter(b => !/Arm|Forearm/.test(b.id))) crop(b.id, b.positionM[0], b.positionM[1], ...b.sizeM);
  const chest = bodies.get('chest').positionM, socket = { x: 0.86, y: 1.46, angleRad: angle };
  const hand = { x: socket.x - Math.cos(angle) * 0.69, y: socket.y - Math.sin(angle) * 0.69 };
  for (const side of ['left', 'right']) {
    const g = armGeometry(rig, side), shoulder = { x: chest[0] + g.shoulderAnchorM[0], y: chest[1] + g.shoulderAnchorM[1] }, target = side === 'right' ? socket : hand;
    const solved = solveArm(g, shoulder, target, 0), u = solved.shoulderRad + g.upperRestRad;
    const elbow = { x: shoulder.x + g.upperLengthM * Math.cos(u), y: shoulder.y + g.upperLengthM * Math.sin(u) };
    for (const [id, a, b] of [[`${side}UpperArm`, shoulder, elbow], [`${side}Forearm`, elbow, solved.reached]]) {
      crop(id, (a.x + b.x) / 2, (a.y + b.y) / 2, bodies.get(id).sizeM[0], Math.hypot(b.x - a.x, b.y - a.y) + 0.07,
        Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90);
    }
  }
  const g = new Graphics(); drawWeaponBow(g, socket, config.bowControl, 'normal', 0.7, hand, 0.31);
  return `<g transform="translate(${origin[0] * 32},${origin[1] * 32}) scale(${mirrored ? -1 : 1},1)">${elements.join('')}${skin === 'hero' ? thunderSvg(socket, hand) : g.commands.join('')}</g>`;
}
const reports = [];
const uiChecks = [];
for (const [name, width, height, hp, cooldown] of [['desktop', 1440, 810, 92, 0], ['phone-wide', 844, 390, 92, 0],
  ['phone-cooldown', 844, 390, 92, 0.4], ['phone-defeat', 844, 390, 0, 0], ['phone-pause', 844, 390, 92, 0], ['phone-impact', 844, 390, 92, 0]]) {
  paths.length = 0; screen.windowSize = { width, height };
  const lab = new PhysicsLab(), camera = { node: new Node(), orthoHeight: 0 };
  lab.viewport = new LabViewport(camera, config.viewport, true); lab.config = config;
  lab.projectiles = { setViewBounds() {} }; lab.physics = { setPaused() {} }; lab.soundSource = { stop() {} };
  lab.router = new InputRouter({ ...config.input, initialRad: 0.3, minRad: -0.26, maxRad: 1.3 }, config.arrows, true);
  lab.arcade = { score: 3 }; lab.combatStates = new Map([['PlayerRagdoll', { hp: 92 }]]); lab.shotBudget = { stamina: 78, cooldownSec: cooldown };
  lab.lastShot = { arrowId: 'impact' };
  lab.records = { snapshot: { bestScore: 12, soundEnabled: true }, lastWrite: { ok: true } };
  for (const id of ['title', 'metrics', 'vitals', 'aimLabel', 'switchLabel', 'pauseLabel', 'resetLabel', 'soundLabel', 'fullscreenLabel', 'notice', 'retryLabel']) lab[id] = new Label();
  lab.resetLabel.string = '重开'; lab.retryLabel.string = '再来一局';
  lab.poseButtons = []; lab.hud = new Graphics(); lab.resize();
  // Exercise the production component's input handlers. This fixture has NO Cocos/physics backend.
  const safe = lab.viewport.safe, point = { x: safe.left + (safe.right - safe.left) * 0.17, y: safe.top + (safe.bottom - safe.top) * 0.55 };
  const event = (id, p) => ({ getTouches: () => [{ getID: () => id, getUILocation: () => ({ x: p.x, y: lab.viewport.height - p.y }) }] });
  lab.press(event(1, point)); assert.equal(lab.router.aimId, 1);
  lab.move(event(1, { x: point.x - 110, y: point.y + 20 })); assert.equal(lab.router.step(0.2), null);
  lab.release(event(1, { x: point.x - 110, y: point.y + 20 })); assert.ok(lab.router.step(0.01)); assert.equal(lab.router.step(0.01), null);
  lab.cancel();
  const pausePoint = { x: (lab.pauseRect.left + lab.pauseRect.right) / 2, y: (lab.pauseRect.top + lab.pauseRect.bottom) / 2 };
  lab.press(event(8, pausePoint)); lab.release(event(8, pausePoint)); lab.drawHUD(); assert.equal(lab.manualPause, true);
  lab.press(event(9, point)); lab.release(event(9, point)); assert.equal(lab.router.aimId, null);
  const continuePoint = { x: (lab.retryRect.left + lab.retryRect.right) / 2, y: (lab.retryRect.top + lab.retryRect.bottom) / 2 };
  lab.press(event(10, continuePoint)); lab.release(event(10, continuePoint)); assert.equal(lab.manualPause, false);
  lab.cancel(); lab.combatStates.get('PlayerRagdoll').hp = 0; lab.drawHUD();
  assert.equal(lab.retryLabel.node.active, true); assert.equal(lab.switchLabel.node.active, false);
  lab.press(event(11, pausePoint)); lab.release(event(11, pausePoint)); assert.equal(lab.manualPause, false);
  lab.press(event(2, point)); assert.equal(lab.router.aimId, null);
  const retryPoint = { x: (lab.retryRect.left + lab.retryRect.right) / 2, y: (lab.retryRect.top + lab.retryRect.bottom) / 2 };
  const hiddenReset = { x: (lab.resetRect.left + lab.resetRect.right) / 2, y: (lab.resetRect.top + lab.resetRect.bottom) / 2 };
  lab.press(event(12, retryPoint)); lab.release(event(12, hiddenReset)); assert.equal(lab.resetRequested, false);
  lab.press(event(3, retryPoint)); lab.release(event(3, retryPoint)); assert.equal(lab.resetRequested, true); assert.equal(lab.router.step(0.01), null);
  lab.resetRequested = false; lab.combatStates.get('PlayerRagdoll').hp = 1;
  lab.playerAim = { poseSnapshot: { pose: 'downed' } }; lab.press(event(4, point)); assert.equal(lab.router.aimId, 4);
  lab.cancel(); lab.combatStates.get('PlayerRagdoll').hp = hp; lab.manualPause = name === 'phone-pause'; lab.drawHUD();
  if (cooldown > 0) assert.ok(lab.aimLabel.string.includes('0.4s'));
  uiChecks.push({ name, inputAtCharacter: true, releaseOnce: true, deadBlocksAim: true, retryQueuesResetOnly: true,
    aliveDownedAcceptsAim: true, modalDoesNotLeakInput: true, pauseContinuesWithoutShot: true,
    scope: 'Production component handlers + InputRouter in a UI fixture; no engine/physics' });
  const ui = lab.hud.commands.join(''), world = new Node(); lab.drawBackdrop(world);
  let worldSvg = world.children.map(n => [...n.components.values()].flatMap(g => g.commands ?? []).join('')).join('');
  const frame = battleFrame(width / height), scale = width / frame.width / 32;
  for (const [x, y, w] of [[3.5, 3, 5], [18.5, 4.1, 2.4]]) {
    const platform = new Graphics(); drawRuinsPlatform(platform, w, x < 10);
    worldSvg += `<g transform="translate(${x * 32},${(y - 0.3) * 32})">${platform.commands.join('')}</g>`;
  }
  worldSvg += actorSvg('hero', [3.5, 3.41], false, 0.25) + actorSvg('enemy', [18.5, 4.51], true, 0.08);
  const arrow = new Graphics(); drawWeaponArrow(arrow, 'normal', { x: 11.8, y: 5.7 }, -0.08);
  worldSvg += arrow.commands.join('');
  const cue = new Graphics(); drawChargeCue(cue, { x: 18.5, y: 6.13 }); worldSvg += cue.commands.join('');
  if (name === 'phone-impact') {
    const impact = new Graphics(); drawImpactMark(impact, { x: 18.42, y: 6.1 }, 0.2, 0.43, 0.75, 3);
    worldSvg += impact.commands.join('');
  }
  const labels = ['title', 'metrics', 'vitals', 'aimLabel', 'switchLabel', 'pauseLabel', 'resetLabel', 'soundLabel', 'fullscreenLabel', 'notice', 'retryLabel'].map(key => {
    const l = lab[key]; if (!l.node.active) return '';
    const lines = l.string.split('\n'), x = l.node.x + lab.viewport.width / 2;
    return `<text x="${x}" y="${lab.viewport.height / 2 - l.node.y}" text-anchor="middle" dominant-baseline="central" font-size="${l.fontSize}" fill="${l.color}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? l.fontSize * 1.3 : -(lines.length - 1) * l.fontSize * 0.65}">${esc(line)}</tspan>`).join('')}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#142A38"/><g transform="translate(${width / 2},${height / 2}) scale(${scale},${-scale}) translate(${-frame.centerX * 32},${-frame.centerY * 32})">${worldSvg}</g><g transform="scale(${view.scale})"><g transform="translate(${lab.viewport.width / 2},${lab.viewport.height / 2}) scale(1,-1)">${ui}</g><g font-family="Noto Sans CJK SC, sans-serif">${labels}</g></g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${out}/${name}-offline.png`);
  reports.push({ name, width, height, hp, cooldown, frame, safe: lab.viewport.safe,
    controls: { aim: lab.layout.aim, switch: lab.layout.arrowSwitch, pause: lab.pauseRect, fullscreen: lab.fullscreenRect, retry: lab.retryRect } });
}
writeFileSync(`${out}/presentation-layout.json`, JSON.stringify({ scope: 'Offline production Graphics/HUD/camera QA; posed actors; NOT Creator or physics runtime', views: reports }, null, 2) + '\n');
writeFileSync(`${out}/interaction-qa.json`, JSON.stringify({ scope: 'UI fixture only, NOT actual gameplay', checks: uiChecks }, null, 2) + '\n');
console.log('Rendered production HUD, arrow paths and camera in desktop + wide phone sizes. Posed actors; NOT runtime evidence.');
