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
const out = process.env.PRESENTATION_PREVIEW_DIR || 'evidence/non-gory-20261113'; mkdirSync(out, { recursive: true });
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
const { RunProgression } = load('assets/scripts/domain/RunProgression.ts');
const { BattleLoadout } = load('assets/scripts/domain/BattleLoadout.ts');
const { RunChallenges, CareerRepository, biomeForStage } = load('assets/scripts/domain/Expedition.ts');
const { drawRuinsPlatform, drawImpactMark, drawChargeCue, drawSkillMark, drawNeckBridge } = load('assets/scripts/presentation/BattleArt.ts');
const config = JSON.parse(readFileSync('configs/combat.seed.json'));
const rig = JSON.parse(readFileSync('configs/rig.seed.json'));
const bodies = new Map(rig.bodyDefinitions.map(b => [b.id, b]));
const art = Object.fromEntries(['hero', 'enemy'].map(name => [name, {
  spec: JSON.parse(readFileSync(`assets/resources/characters/${name}-ruins-v2-frames.json`)),
  image: readFileSync(`assets/resources/characters/${name}-ruins-v2.png`).toString('base64'),
}]));
const scenery = JSON.parse(readFileSync('assets/resources/scenery/ruins-art-v2.json')).assets;
const backdropImage = readFileSync(scenery.background.path).toString('base64');
const biomeImages = { storm: backdropImage,
  frost: readFileSync('assets/resources/scenery/frost-sanctum-v1.png').toString('base64'),
  ember: readFileSync('assets/resources/scenery/ember-citadel-v1.png').toString('base64') };
const platformImage = readFileSync(scenery.platform.path).toString('base64');
function platformSvg(widthM) {
  const { rect: [x, y, w, h], capWidthPx: capPx, capWidthM } = scenery.platform;
  const cap = Math.min(capWidthM, widthM / 3), widths = [cap, widthM - cap * 2, cap];
  const rects = [[x, y, capPx, h], [x + capPx, y, w - capPx * 2, h], [x + w - capPx, y, capPx, h]];
  let left = -widthM / 2;
  return widths.map((width, i) => {
    const svg = `<g transform="scale(1,-1)"><svg x="${left * 32}" y="${-0.3 * 32}" width="${width * 32}" height="${0.6 * 32}" viewBox="${rects[i].join(' ')}" preserveAspectRatio="none"><image width="${scenery.platform.imageSize[0]}" height="${scenery.platform.imageSize[1]}" href="data:image/png;base64,${platformImage}"/></svg></g>`;
    left += width; return svg;
  }).join('');
}
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const weapons = Object.fromEntries(['thunder', 'gale', 'moon'].map(id => [id, {
  spec: JSON.parse(readFileSync(`assets/resources/weapons/${id}-art.json`)),
  bow: readFileSync(`assets/resources/weapons/${id === 'thunder' ? 'thunder-bow' : `${id}-weapon`}.png`).toString('base64'),
  arrow: readFileSync(`assets/resources/weapons/${id === 'thunder' ? 'thunder-arrow' : `${id}-weapon`}.png`).toString('base64'),
}]));
function weaponSvg(socket, hand, bowId) {
  const { spec: thunder, bow: thunderBow, arrow: thunderArrow } = weapons[bowId];
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
function actorSvg(skin, origin, mirrored, angle, bowId = 'thunder') {
  const data = art[skin], elements = [];
  const neck = new Graphics(), chestBody = bodies.get('chest'), headBody = bodies.get('head');
  const neckJoint = rig.jointDefinitions.find(j => j.id === 'neck');
  drawNeckBridge(neck,
    { x: chestBody.positionM[0] + neckJoint.parentAnchorM[0], y: chestBody.positionM[1] + neckJoint.parentAnchorM[1] - 0.13 },
    { x: headBody.positionM[0] + neckJoint.childAnchorM[0], y: headBody.positionM[1] + neckJoint.childAnchorM[1] + 0.10 }, 0.12);
  elements.push(neck.commands.join(''));
  const crop = (id, x, y, w, h, rotation = 0) => {
    const rect = data.spec.frames[id].rect;
    elements.push(`<g transform="translate(${x * 32},${y * 32}) rotate(${rotation})"><g transform="scale(1,-1)"><svg x="${-w * 16}" y="${-h * 16}" width="${w * 32}" height="${h * 32}" viewBox="${rect.join(' ')}" preserveAspectRatio="none"><image width="${data.spec.imageSize[0]}" height="${data.spec.imageSize[1]}" href="data:image/png;base64,${data.image}"/></svg></g></g>`);
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
  const g = new Graphics(); drawWeaponBow(g, socket, config.bowControl, 'normal', 0.7, hand, 0.31,
    bowId === 'moon' ? 'piercing' : bowId === 'gale' ? 'impact' : 'normal', bowId === 'moon' ? '#CBB6FF' : bowId === 'gale' ? '#A5E6B5' : '#F7C66F');
  return `<g transform="translate(${origin[0] * 32},${origin[1] * 32}) scale(${mirrored ? -1 : 1},1)">${elements.join('')}${skin === 'hero' ? weaponSvg(socket, hand, bowId) : g.commands.join('')}</g>`;
}
const reports = [];
const uiChecks = [];
for (const [name, width, height, hp, cooldown] of [['desktop', 1440, 810, 92, 0], ['phone-wide', 844, 390, 92, 0], ['tablet', 1024, 768, 92, 0],
  ['phone-cooldown', 844, 390, 92, 0.4], ['phone-defeat', 844, 390, 0, 0], ['phone-pause', 844, 390, 92, 0], ['phone-impact', 844, 390, 92, 0],
  ['phone-normal-hit', 844, 390, 92, 0], ['phone-heavy-hit', 844, 390, 92, 0],
  ['phone-reward', 844, 390, 92, 0], ['desktop-reward', 1440, 810, 92, 0],
  ['phone-boss', 844, 390, 92, 0], ['phone-gale', 844, 390, 92, 0], ['phone-moon', 844, 390, 92, 0], ['phone-moon-skill', 844, 390, 92, 0],
  ['desktop-frost', 1440, 810, 92, 0], ['desktop-ember', 1440, 810, 92, 0]].filter(([name]) => !process.env.PREVIEW_VIEWS || process.env.PREVIEW_VIEWS.split(',').includes(name))) {
  paths.length = 0; screen.windowSize = { width, height };
  const lab = new PhysicsLab(), camera = { node: new Node(), orthoHeight: 0 };
  // The production async asset owner is tested separately; this offline renderer consumes its actual PNG/crops.
  lab.ruinsArt = { resize() {}, attachBackdrop() {}, attachPlatform() {} };
  lab.viewport = new LabViewport(camera, config.viewport, true); lab.config = config;
  lab.projectiles = { setViewBounds() {} }; lab.physics = { setPaused() {} }; lab.soundSource = { stop() {} };
  lab.router = new InputRouter({ ...config.input, initialRad: 0.3, minRad: -0.26, maxRad: 1.3 }, config.arrows, true);
  const progression = new RunProgression(() => 0);
  if (name === 'desktop-frost' || name === 'desktop-ember') for (let i = 0; i < (name.endsWith('frost') ? 15 : 30); i++) {
    progression.defeated(); if (progression.pending) progression.choose(progression.offers[0]);
  }
  const loadout = new BattleLoadout();
  lab.arcade = { current: { encounter: { name: '弓手', hint: '瞄准头部，或射伤持弓臂', tint: '#E98575' } }, enemyStatus: null, snapshot: { nextSpawnSec: 1.2 }, score: 3, progression, loadout, challenges: new RunChallenges(), bossStatus: null, get rewardReady() { return progression.pending; }, chooseReward(id) { return progression.choose(id); } };
  lab.career = new CareerRepository({ getItem: () => null, setItem() {} });
  lab.combatStates = new Map([['PlayerRagdoll', { hp: 92 }]]); lab.shotBudget = { stamina: 78, cooldownSec: cooldown };
  lab.lastShot = { arrowId: 'impact' };
  lab.records = { snapshot: { bestScore: 12, soundEnabled: true }, lastWrite: { ok: true } };
  for (const id of ['title', 'metrics', 'vitals', 'aimLabel', 'switchLabel', 'pauseLabel', 'resetLabel', 'soundLabel', 'musicLabel', 'questLabel', 'fullscreenLabel', 'notice', 'retryLabel', 'bossLabel']) lab[id] = new Label();
  lab.rewardLabels = Array.from({ length: 3 }, () => new Label());
  lab.equipmentButtons = ['bow', 'skill', 'potion', 'rune'].map(kind => ({ kind, label: new Label(), rect: {} }));
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
  lab.playerAim = { poseSnapshot: { pose: 'downed' }, bowSocket: () => ({ x: 4.3, y: 4.9 }) }; lab.press(event(4, point)); assert.equal(lab.router.aimId, 4);
  const control = kind => { const r = lab.equipmentButtons.find(b => b.kind === kind).rect; return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; };
  lab.press(event(41, control('bow'))); lab.release(event(41, control('bow')));
  assert.equal(loadout.bow, 'gale'); assert.equal(lab.router.aimId, 4, '切装备不抢瞄准手');
  lab.cancel(); lab.press(event(42, control('skill'))); lab.release(event(42, control('skill')));
  assert.equal(loadout.snapshot.primed.shots, 3); assert.equal(lab.router.step(0.2), null);
  lab.combatStates.get('PlayerRagdoll').hp = 50;
  lab.press(event(43, control('potion'))); lab.release(event(43, control('potion')));
  assert.equal(lab.combatStates.get('PlayerRagdoll').hp, 85); assert.equal(loadout.snapshot.items.potion, 1);
  lab.press(event(44, control('rune'))); lab.cancel(); lab.release(event(44, control('rune'))); assert.equal(loadout.snapshot.rune, false);
  loadout.reset();
  if (name === 'phone-gale' || name === 'phone-moon') loadout.switchBow();
  if (name === 'phone-moon') loadout.switchBow();
  lab.cancel(); lab.combatStates.get('PlayerRagdoll').hp = hp; lab.manualPause = name === 'phone-pause'; lab.drawHUD();
  if (name.endsWith('reward')) {
    for (let i = 0; i < 5; i++) progression.defeated();
    lab.syncPause(); lab.drawHUD();
    assert.equal(lab.rewardVisible, true); assert.equal(lab.router.snapshot?.aimId ?? lab.router.aimId, null);
    const backdrop = { x: safe.left + 8, y: safe.top + 8 };
    lab.press(event(31, backdrop)); lab.release(event(31, backdrop)); assert.equal(lab.router.aimId, null); assert.equal(progression.pending, true);
    lab.press(event(32, pausePoint)); lab.release(event(32, pausePoint)); assert.equal(lab.manualPause, false);
    const card = lab.rewardRects[0], cardPoint = { x: (card.left + card.right) / 2, y: (card.top + card.bottom) / 2 };
    lab.press(event(33, cardPoint)); lab.release(event(33, { x: card.right + 10, y: cardPoint.y })); assert.equal(progression.pending, true);
    lab.press(event(34, cardPoint)); lab.cancel(); lab.release(event(34, cardPoint)); assert.equal(progression.pending, true);
    lab.press(event(35, cardPoint)); lab.release(event(35, cardPoint));
    assert.equal(progression.pending, false); assert.equal(progression.upgrades.quick, 1); assert.equal(lab.router.step(0.2), null);
    // Present the following stage's actual offers after verifying the first choice.
    for (let i = 0; i < 5; i++) progression.defeated();
    lab.syncPause(); lab.drawHUD();
    assert.ok(lab.rewardLabels.every(l => l.node.active)); assert.equal(lab.pauseLabel.node.active, false);
    uiChecks.push({ name, rewardBlocksBattlefield: true, pauseCannotLeakThroughReward: true,
      draggedOutDoesNotChoose: true, cancelledDoesNotChoose: true, selectionDoesNotFire: true, rankAppliedOnce: true,
      scope: 'Production reward handlers + progression in UI fixture; no engine/physics' });
  }
  if (cooldown > 0) assert.ok(lab.aimLabel.string.includes('0.4s'));
  if (name === 'phone-boss') {
    lab.arcade.bossStatus = { name: '遗迹守望者', hp: 82, hpMax: 180, phase: 2 }; lab.drawHUD(); assert.equal(lab.bossLabel.node.active, true);
  }
  if (name === 'phone-moon-skill') {
    loadout.switchBow(); loadout.switchBow(); loadout.activate({ x: 4.3, y: 4.9 }); lab.drawHUD();
  }
  uiChecks.push({ name, inputAtCharacter: true, releaseOnce: true, deadBlocksAim: true, retryQueuesResetOnly: true,
    aliveDownedAcceptsAim: true, modalDoesNotLeakInput: true, pauseContinuesWithoutShot: true,
    scope: 'Production component handlers + InputRouter in a UI fixture; no engine/physics' });
  const ui = lab.hud.commands.join(''), world = new Node(); lab.drawBackdrop(world);
  let worldSvg = world.children.map(n => [...n.components.values()].flatMap(g => g.commands ?? []).join('')).join('');
  const frame = battleFrame(width / height), scale = width / frame.width / 32;
  const biome = biomeForStage(progression.stage).id;
  const artAspect = biome === 'storm' ? scenery.background.imageSize[0] / scenery.background.imageSize[1] : 1.5;
  const artWidth = Math.max(frame.width, frame.height * artAspect), artHeight = artWidth / artAspect;
  worldSvg += `<g transform="translate(${frame.centerX * 32},${frame.centerY * 32}) scale(1,-1)"><image x="${-artWidth * 16}" y="${-artHeight * 16}" width="${artWidth * 32}" height="${artHeight * 32}" href="data:image/png;base64,${biomeImages[biome]}"/></g>`;
  for (const [x, y, w] of [[3.5, 3, 5], [18.5, 4.1, 2.4]]) {
    worldSvg += `<g transform="translate(${x * 32},${(y - 0.3) * 32})">${platformSvg(w)}</g>`;
  }
  worldSvg += actorSvg('hero', [3.5, 3.41], false, 0.25, loadout.bow) + actorSvg('enemy', [18.5, 4.51], true, 0.08);
  const flying = weapons[loadout.bow], arrowRect = flying.spec.arrow.rect, arrowLength = WEAPON_STYLES.normal.arrowLength;
  const arrowHeight = Math.max(0.18, arrowLength * arrowRect[3] / arrowRect[2]);
  worldSvg += `<g transform="translate(${11.8 * 32},${5.7 * 32}) rotate(${-0.08 * 180 / Math.PI}) scale(1,-1)"><svg x="${-arrowLength * 32}" y="${-arrowHeight * 16}" width="${arrowLength * 32}" height="${arrowHeight * 32}" viewBox="${arrowRect.join(' ')}" preserveAspectRatio="none"><image width="${flying.spec.arrow.imageSize[0]}" height="${flying.spec.arrow.imageSize[1]}" href="data:image/png;base64,${flying.arrow}"/></svg></g>`;
  if (name === 'phone-moon-skill') {
    const effects = new Graphics(); drawSkillMark(effects, { kind: 'moon', point: { x: 18.5, y: 5.8 }, age: 0.06, duration: 0.42, hit: true });
    worldSvg += effects.commands.join('');
  }
  const cue = new Graphics(); drawChargeCue(cue, { x: 18.5, y: 6.13 }); worldSvg += cue.commands.join('');
  if (['phone-impact', 'phone-normal-hit', 'phone-heavy-hit'].includes(name)) {
    const tier = name === 'phone-impact' ? 3 : name === 'phone-heavy-hit' ? 2 : 1;
    const impact = new Graphics(); drawImpactMark(impact, { x: 18.42, y: tier === 3 ? 6.1 : 5.35 }, 0.2, tier === 3 ? 0.55 : tier === 2 ? 0.43 : 0.28, 0.75, tier);
    worldSvg += impact.commands.join('');
  }
  const labels = [...['title', 'metrics', 'vitals', 'aimLabel', 'switchLabel', 'pauseLabel', 'resetLabel', 'soundLabel', 'musicLabel', 'questLabel', 'fullscreenLabel', 'notice', 'retryLabel', 'bossLabel'].map(key => lab[key]), ...lab.rewardLabels, ...lab.equipmentButtons.map(b => b.label)].map(l => {
    if (!l.node.active) return '';
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
