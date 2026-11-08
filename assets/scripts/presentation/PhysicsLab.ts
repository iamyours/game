import { aimHintPoints, applyDrawStrength } from '../domain/archery';
import { _decorator, BoxCollider2D, Camera, Canvas, Color, Component, ERigidBody2DType, Game, Graphics, Label, Layers, Node,
  PhysicsSystem2D, RenderRoot2D, RigidBody2D, game, input, Input, profiler, screen, view, type EventTouch } from 'cc';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { contains, InputRouter, type InputLayout, type Point, type Rect, type ShotIntent } from '../input/InputRouter';
import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import { CalibrationProbe, PROBE } from '../physics/CalibrationProbe';
import { RagdollFactory, type RagdollInstance } from '../physics/RagdollFactory';
import { AimController } from '../physics/AimController';
import { PoseController, type PoseName } from '../physics/PoseController';
import { ProjectileSystem, TIP_OFFSET_M } from '../combat/ProjectileSystem';
import { HitResolver, type ActorCombatState } from '../combat/HitResolver';
import { LabViewport } from './LabViewport';
import { CharacterSkin } from './CharacterSkin';

const { ccclass } = _decorator;
const color = (hex: string): Color => new Color().fromHEX(hex);
const arrowNames: Record<string, string> = { normal: '普通', impact: '冲击', piercing: '穿甲' };
const arrowTints: Record<string, string> = { normal: '#F7C66F', impact: '#F29983', piercing: '#BCAEF6' };
const bow = { x: 3.5, y: 3.85 };
const empty: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
const midpoint = (r: Rect): Point => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

function child(parent: Node, name: string): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  node.parent = parent;
  return node;
}
function label(parent: Node, name: string, size: number, text = ''): Label {
  const l = child(parent, name).addComponent(Label);
  l.fontSize = size;
  l.lineHeight = Math.round(size * 1.3);
  l.string = text;
  l.color = color('#EBF6F8');
  return l;
}
function fill(g: Graphics, x: number, y: number, w: number, h: number, hex: string): void {
  g.fillColor = color(hex);
  g.rect(x, y, w, h);
  g.fill();
}

/** Boot-built physics calibration and target practice. */
@ccclass('StormArchersPhysicsLab')
export class PhysicsLab extends Component {
  private physics: Physics | null = null;
  private probe!: CalibrationProbe;
  private router!: InputRouter;
  private viewport!: LabViewport;
  private config!: PhysicsLabConfig;
  private overlay!: Node;
  private hud!: Graphics;
  private aim!: Graphics;
  private title!: Label;
  private metrics!: Label;
  private aimLabel!: Label;
  private switchLabel!: Label;
  private pauseLabel!: Label;
  private resetLabel!: Label;
  private resetRect: Rect = empty;
  private resetTouch: number | null = null;
  private notice!: Label;
  private layout: InputLayout = { aim: empty, arrowSwitch: empty };
  private pauseRect: Rect = empty;
  private pauseId: number | null = null;
  private manualPause = false;
  private hidden = false;
  private shots = 0;
  private lastAttempt: { stepId: number; result: 'hands-unready' | 'arrow-limit' | 'muzzle-blocked' | 'fired' } | null = null;
  private lastShot: (ShotIntent & { stepId: number; socket: ReturnType<AimController['bowSocket']>;
    hands: PoseController['handsSnapshot']; drawAmount: number; speedMps: number }) | null = null;
  private dirty = true;
  private ragdollFactory: RagdollFactory | null = null;
  private ragdolls: RagdollInstance[] = [];
  private skins: CharacterSkin[] = [];
  private playerAim!: AimController;
  private enemyAim!: AimController;
  private projectiles!: ProjectileSystem;
  private hitResolver!: HitResolver;
  private combatStates!: Map<string, ActorCombatState>;
  private resetRequested = false;
  private demoRequested: PoseName | null = null;
  private poseButtons: { pose: PoseName; label: Label; rect: Rect }[] = [];
  private poseTouch: { id: number; index: number } | null = null;
  private resetCount = 0;

  public setup(canvas: Canvas, config: PhysicsLabConfig, seedHash: string): void {
    this.config = config;
    this.seedHash = seedHash;
    const uiCamera = canvas.cameraComponent;
    if (!uiCamera) throw new Error('Boot Canvas 缺少 UI 相机');
    const scene = this.node.scene!;
    const world = child(this.node, 'World');
    world.layer = Layers.Enum.UI_3D;
    world.addComponent(RenderRoot2D);
    const worldCamera = child(world, 'WorldCamera').addComponent(Camera);
    worldCamera.projection = Camera.ProjectionType.ORTHO;
    worldCamera.near = 1;
    worldCamera.far = 2000;
    worldCamera.visibility = world.layer;
    worldCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    worldCamera.clearColor = color('#142A38');
    worldCamera.priority = -1;
    uiCamera.visibility = canvas.node.layer;
    uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;

    this.viewport = new LabViewport(worldCamera, config.viewport);
    this.physics = new Physics(config.physics);
    this.router = new InputRouter({ deadzoneDesign: config.input.deadzoneDesign,
      initialRad: Physics.radians(config.input.initialAimDeg), minRad: Physics.radians(config.input.minAimDeg),
      maxRad: Physics.radians(config.input.maxAimDeg), firstShotDelaySec: config.input.firstShotDelaySec,
      pullBackToAim: config.input.pullBackToAim, fullDrawDistanceDesign: config.input.fullDrawDistanceDesign }, config.arrows);
    this.drawRuler(world);
    // Native fixtures capture their collision mask when created. Configure it first,
    // including when setup runs on an already-active scene (editor/re-entry).
    this.ragdollFactory = new RagdollFactory(config.rig);
    this.buildPlatforms(world, config.rig.collisionGroups.platform);
    this.ragdolls = [
      this.ragdollFactory.spawn(world, 'PlayerRagdoll', [3.5, 3.41], '#63C6C9'),
      this.ragdollFactory.spawn(world, 'EnemyRagdoll', [18, 3.41], '#E98575'),
    ];
    this.skins = this.ragdolls.map(actor => new CharacterSkin(actor, config.rig));
    this.skins.forEach((skin, index) => {
      void skin.load(index === 0 ? 'hero' : 'enemy').catch(error => {
        console.warn('[PhysicsLab] 角色图片加载失败，保留灰盒：', error);
      });
    });
    this.playerAim = new AimController(this.ragdolls[0], new PoseController(this.ragdolls[0], config.rig, config.bowControl));
    this.enemyAim = new AimController(this.ragdolls[1], new PoseController(this.ragdolls[1], config.rig, config.bowControl));
    this.playerAim.setPose('standing');
    this.enemyAim.setPose('standing');
    this.combatStates = new Map([
      ['PlayerRagdoll', { id: 'PlayerRagdoll', hp: config.player.hp, armor: 0, hits: 0, lastHit: null }],
      ['EnemyRagdoll', { id: 'EnemyRagdoll', hp: config.enemies[0]?.hp ?? 60, armor: config.enemies[0]?.helmetDurability ?? 0, hits: 0, lastHit: null }],
    ]);
    this.hitResolver = new HitResolver(this.combatStates, config, (state) => {
      const aim = state.id === 'PlayerRagdoll' ? this.playerAim : this.enemyAim;
      if (state.hp <= 0) aim.setAlive(false);
      else if (state.lastHit) aim.registerHit(state.lastHit.jointReaction);
      this.dirty = true;
    });
    this.projectiles = new ProjectileSystem(world, config, this.ragdolls, (candidate, targetBody) => this.hitResolver.resolve(candidate, targetBody));
    this.probe = new CalibrationProbe(world, config.physics);
    this.aim = child(world, 'AimPreview').addComponent(Graphics);
    this.overlay = child(canvas.node, 'PhysicsLabHUD');
    this.hud = child(this.overlay, 'TouchZones').addComponent(Graphics);
    this.title = label(this.overlay, 'Title', 42, '风暴弓手  /  PhysicsLab');
    this.metrics = label(this.overlay, 'Metrics', 26);
    this.aimLabel = label(this.overlay, 'AimLabel', 28);
    this.switchLabel = label(this.overlay, 'ArrowSwitch', 30);
    this.pauseLabel = label(this.overlay, 'Pause', 30);
    this.resetLabel = label(this.overlay, 'Reset', 30, '重置');
    this.poseButtons = (['standing', 'staggered', 'downed'] as const).map((pose, i) => ({
      pose, label: label(this.overlay, `Pose_${pose}`, 25, ['站立重置', '后仰测试', '倒地测试'][i]), rect: empty,
    }));
    this.notice = label(this.overlay, 'Notice', 36);
    this.resize();
    profiler.hideStats();
    view.on('canvas-resize', this.resize, this);
    input.on(Input.EventType.TOUCH_START, this.press, this);
    input.on(Input.EventType.TOUCH_MOVE, this.move, this);
    input.on(Input.EventType.TOUCH_END, this.release, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.cancel, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
    game.on(Game.EVENT_SHOW, this.show, this);
    if (typeof window !== 'undefined') window.addEventListener('blur', this.cancel);
    console.info(`[PhysicsLab] ready in ${scene.name}; seed ${this.seedHash}`);
  }

  private seedHash = '';

  public update(dt: number): void {
    this.physics?.advance(dt, this.beforeStep, this.afterStep);
    if (this.dirty && this.physics) { this.dirty = false; this.drawHUD(); }
    if (this.physics) this.drawAim();
  }

  public onDestroy(): void {
    view.off('canvas-resize', this.resize, this);
    input.off(Input.EventType.TOUCH_START, this.press, this);
    input.off(Input.EventType.TOUCH_MOVE, this.move, this);
    input.off(Input.EventType.TOUCH_END, this.release, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.cancel, this);
    game.off(Game.EVENT_HIDE, this.hide, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.cancel);
    this.projectiles?.clear();
    for (const skin of this.skins) skin.dispose();
    this.ragdollFactory?.dispose();
    this.overlay?.destroy();
    this.physics?.dispose();
  }

  /** Read-only live evidence for the WebGL harness; uses the same handlers as manual play. */
  public snapshot() {
    const v = this.viewport;
    const { worldWidthM, worldHeightM, worldCenterM: [cx, cy] } = this.config.viewport;
    const topLeft = v.worldToUI(cx - worldWidthM / 2, cy + worldHeightM / 2);
    const bottomRight = v.worldToUI(cx + worldWidthM / 2, cy - worldHeightM / 2);
    return { seedHash: this.seedHash, calibration: this.probe.result, stepId: this.physics?.steps,
      autoSimulation: PhysicsSystem2D.instance.autoSimulation, shots: this.shots, lastShot: this.lastShot,
      lastAttempt: this.lastAttempt, lastReleaseResult: this.router.lastReleaseResult,
      aimId: this.router.aimId, aimDeg: Physics.degrees(this.router.aimRad), arrow: this.router.selectedArrow.id,
      drawProgress: this.router.drawProgress, paused: this.manualPause, hidden: this.hidden, portrait: v.portrait, layout: this.layout,
      poseButtons: this.poseButtons.map(({ pose, rect }) => ({ pose, rect })),
      pauseRect: this.pauseRect, resetRect: this.resetRect, width: v.width, height: v.height, safe: v.safe,
      projection: { topLeft, bottomRight, roundTrip: v.uiToWorld(v.worldToUI(bow.x, bow.y)) },
      pose: { player: this.playerAim.poseSnapshot, enemy: this.enemyAim.poseSnapshot, bowSocket: this.playerAim.bowSocket(), hands: this.playerAim.handsSnapshot },
      combat: Array.from(this.combatStates.values()).map((state) => ({ ...state })), projectiles: this.projectiles?.count ?? 0, embedded: this.projectiles?.embeddedCount ?? 0,
      rig: { bodyCount: this.config.rig.bodyCount, jointCount: this.config.rig.jointCount,
        totalMassKg: this.config.rig.massKg, resetCount: this.resetCount,
        ragdolls: this.ragdolls.map((ragdoll) => ragdoll.snapshot()) },
      physicsBodies: this.countRigidBodies(), physicsJoints: this.countHingeJoints() };
  }

  /** Queues a safe post-step reset so no body is teleported while Box2D is stepping. */
  public resetRagdolls(): void {
    this.resetRequested = true;
    this.dirty = true;
  }

  /** T004 grey-box controls; production gameplay will drive these from combat state. */
  public setPose(actor: 'player' | 'enemy', pose: PoseName): void {
    (actor === 'player' ? this.playerAim : this.enemyAim).setPose(pose);
    this.dirty = true;
  }

  /** Lab-only controls; changes and impulses execute in the post-step queue. */
  public requestPoseDemo(pose: PoseName): void {
    this.router.cancel();
    if (pose === 'standing') this.resetRagdolls();
    else this.demoRequested = pose;
  }

  public registerPlayerArmTrauma(durationSec = 0.35): void {
    this.playerAim.registerArmTrauma(durationSec, 0.35);
  }

  private countRigidBodies(): number {
    return this.ragdolls.reduce((count, ragdoll) => count + ragdoll.bodies.size, 0) + 5 + (this.projectiles?.count ?? 0);
  }

  private countHingeJoints(): number {
    return this.ragdolls.reduce((count, ragdoll) => count + ragdoll.joints.size, 0);
  }

  private beforeStep = (dt: number, stepId: number): void => {
    this.projectiles.beginStep(stepId);
    const shot = this.router.step(dt);
    this.playerAim.setWorldAim(shot?.aimRad ?? this.router.aimRad);
    this.playerAim.setDraw(this.router.aimId !== null || shot !== null, shot ? shot.strength : this.router.drawProgress);
    this.playerAim.step(dt);
    this.enemyAim.setWorldAim(0);
    this.enemyAim.step(dt);
    if (!shot) return;
    if (!this.playerAim.handsSnapshot.ready) {
      this.lastAttempt = { stepId, result: 'hands-unready' };
      this.dirty = true;
      return;
    }
    const arrow = this.config.arrows.find((value) => value.id === shot.arrowId);
    if (!arrow) return;
    const socket = this.playerAim.bowSocket();
    const blocked = this.projectiles.launchBlockReason('PlayerRagdoll', socket);
    if (blocked) {
      this.lastAttempt = { stepId, result: blocked };
      this.dirty = true;
      return;
    }
    const launchArrow = applyDrawStrength(arrow, shot.strength, this.config.bowControl.minPowerRatio);
    const shotId = this.projectiles.fire('PlayerRagdoll', { ...socket, angleRad: shot.aimRad }, launchArrow);
    if (shotId !== null) { this.lastShot = { ...shot, stepId, socket, hands: this.playerAim.handsSnapshot,
      drawAmount: this.playerAim.poseSnapshot.drawAmount, speedMps: launchArrow.speedMps }; this.shots += 1;
      this.lastAttempt = { stepId, result: 'fired' }; }
    this.dirty = true;
  };

  private afterStep = (_dt: number, stepId: number): void => {
    const prior = this.probe.result;
    this.probe.afterStep(stepId);
    this.projectiles.afterStep();
    if (this.resetRequested) {
      this.resetRequested = false; this.demoRequested = null;
      this.projectiles.clear();
      this.ragdollFactory?.resetAll();
      for (const state of this.combatStates.values()) { state.hp = state.id === 'PlayerRagdoll' ? this.config.player.hp : (this.config.enemies[0]?.hp ?? 60); state.armor = state.id === 'PlayerRagdoll' ? 0 : (this.config.enemies[0]?.helmetDurability ?? 0); state.hits = 0; state.lastHit = null; }
      this.router.cancel();
      this.playerAim.reset(); this.enemyAim.reset();
      this.shots = 0; this.lastShot = null; this.lastAttempt = null; this.resetCount += 1; this.dirty = true;
    }
    if (this.demoRequested) {
      const pose = this.demoRequested;
      this.demoRequested = null;
      this.playerAim.setPose(pose);
      const chest = this.ragdolls[0]!.bodies.get('chest')!;
      const p = Physics.positionM(chest.node);
      Physics.applyImpulse(chest, pose === 'downed' ? -14 : -4, 0, p.x, p.y + 0.25);
      this.dirty = true;
    }
    if (prior !== this.probe.result) this.dirty = true;
  };

  private press(event: EventTouch): void {
    if (this.hidden || this.viewport.portrait) return;
    for (const touch of event.getTouches()) {
      const point = this.viewport.fromUILocation(touch.getUILocation());
      if (contains(this.pauseRect, point)) {
        if (this.pauseId === null) this.pauseId = touch.getID();
      } else if (contains(this.resetRect, point)) this.resetTouch = touch.getID();
      else if (this.poseButtons.some(button => contains(button.rect, point))) {
        this.poseTouch = { id: touch.getID(), index: this.poseButtons.findIndex(button => contains(button.rect, point)) };
      } else this.router.press(touch.getID(), point, this.layout);
    }
    this.dirty = true;
  }
  private move(event: EventTouch): void {
    for (const touch of event.getTouches()) this.router.move(touch.getID(), this.viewport.fromUILocation(touch.getUILocation()));
    this.dirty = true;
  }
  private release(event: EventTouch): void {
    for (const touch of event.getTouches()) {
      const point = this.viewport.fromUILocation(touch.getUILocation());
      if (this.pauseId === touch.getID()) {
        this.pauseId = null;
        if (contains(this.pauseRect, point)) { this.manualPause = !this.manualPause; this.syncPause(); }
      } else if (this.resetTouch === touch.getID()) {
        this.resetTouch = null;
        if (contains(this.resetRect, point)) { this.manualPause = false; this.syncPause(); this.resetRagdolls(); }
      } else if (this.poseTouch?.id === touch.getID()) {
        const button = this.poseButtons[this.poseTouch.index]!;
        this.poseTouch = null;
        if (contains(button.rect, point)) this.requestPoseDemo(button.pose);
      } else this.router.release(touch.getID(), point, this.layout);
    }
    this.dirty = true;
  }
  private cancel = (): void => {
    this.pauseId = this.resetTouch = null;
    this.poseTouch = null;
    this.router.cancel();
    this.dirty = true;
  };
  private hide(): void { this.hidden = true; this.syncPause(); }
  private show(): void { this.hidden = false; this.syncPause(); }
  private syncPause(): void {
    this.cancel();
    const blocked = this.hidden || this.manualPause || this.viewport.portrait;
    this.router.setBlocked(blocked);
    this.physics?.setPaused(blocked);
  }

  private resize(): void {
    this.viewport.resize();
    const { safe } = this.viewport;
    const w = safe.right - safe.left, h = safe.bottom - safe.top;
    const x = (fraction: number): number => safe.left + fraction * w;
    const y = (fraction: number): number => safe.top + fraction * h;
    const [left, top, right, bottom] = this.config.input.aimZoneNormalized;
    const [switchX, switchY] = this.config.input.switchCenterNormalized;
    // Keep 48 logical pixels even when the design canvas shrinks to fit a small landscape window.
    const minSize = 48 * screen.devicePixelRatio / view.getScaleX();
    const width = Math.max(180, minSize), height = Math.max(100, minSize);
    const switchW = Math.min(width, w), switchH = Math.min(height, h);
    const switchLeft = Math.min(safe.right - switchW, Math.max(safe.left, x(switchX) - switchW / 2));
    const switchTop = Math.min(safe.bottom - switchH, Math.max(safe.top, y(switchY) - switchH / 2));
    this.layout = { aim: { left: x(left), top: y(top), right: x(right), bottom: y(bottom) },
      arrowSwitch: { left: switchLeft, top: switchTop, right: switchLeft + switchW, bottom: switchTop + switchH } };
    this.pauseRect = { left: safe.right - switchW - 20, top: safe.top + 16, right: safe.right - 20, bottom: safe.top + 16 + switchH };
    this.syncPause();
    this.placeLabel(this.title, x(0.32), safe.top + 46);
    this.placeLabel(this.metrics, x(0.32), safe.top + 98);
    this.placeLabel(this.aimLabel, x((left + right) / 2), y(bottom) - 35);
    this.placeLabel(this.switchLabel, midpoint(this.layout.arrowSwitch));
    this.resetRect = { ...this.pauseRect, left: this.pauseRect.left - switchW - 12, right: this.pauseRect.left - 12 };
    this.placeLabel(this.resetLabel, midpoint(this.resetRect));
    this.placeLabel(this.pauseLabel, midpoint(this.pauseRect));
    for (const [index, button] of this.poseButtons.entries()) {
      button.rect = { left: x(0.46 + index * 0.12), right: x(0.57 + index * 0.12),
        top: y(0.88), bottom: y(0.97) };
      this.placeLabel(button.label, midpoint(button.rect));
    }
    this.placeLabel(this.notice, this.viewport.width / 2, this.viewport.height / 2);
  }

  private placeLabel(l: Label, point: Point): void;
  private placeLabel(l: Label, x: number, y: number): void;
  private placeLabel(l: Label, point: Point | number, y = 0): void {
    const p = this.viewport.toLocal(typeof point === 'number' ? { x: point, y } : point);
    l.node.setPosition(p.x, p.y);
  }

  private drawHUD(): void {
    const g = this.hud;
    g.clear();
    const { portrait } = this.viewport;
    for (const l of [this.title, this.metrics, this.aimLabel, this.pauseLabel, this.resetLabel]) l.node.active = !portrait;
    for (const button of this.poseButtons) button.label.node.active = !portrait;
    this.switchLabel.node.active = !portrait && this.router.canSwitch;
    this.notice.node.active = portrait || this.manualPause;
    this.notice.fontSize = portrait ? Math.max(36, 24 * screen.devicePixelRatio / view.getScaleX()) : 36;
    this.notice.lineHeight = this.notice.fontSize * 1.3;
    this.notice.string = portrait ? '请横置屏幕' : '已暂停 · 继续后重新按住瞄准';
    if (portrait) return;
    const box = (r: Rect, tint: string): void => {
      const p = this.viewport.toLocal({ x: r.left, y: r.bottom });
      fill(g, p.x, p.y, r.right - r.left, r.bottom - r.top, tint);
    };
    box(this.layout.aim, '#203A4CE8');
    box(this.pauseRect, '#294657');
    box(this.resetRect, '#294657');
    for (const button of this.poseButtons) box(button.rect, '#294657');
    if (this.router.canSwitch) box(this.layout.arrowSwitch, '#294657');
    if (this.manualPause) box({ left: this.viewport.width / 2 - 310, right: this.viewport.width / 2 + 310,
      top: this.viewport.height / 2 - 44, bottom: this.viewport.height / 2 + 44 }, '#102631');
    const id = this.router.selectedArrow.id;
    const tint = arrowTints[id] ?? '#F7C66F';
    this.pauseLabel.string = this.manualPause ? '继续' : '暂停';
    this.switchLabel.string = `切箭 · ${arrowNames[id] ?? id}`;
    this.switchLabel.color = color(tint);
    const enemy = this.combatStates.get('EnemyRagdoll');
    this.aimLabel.string = `拖动拉弓 · 松手放箭   力度 ${Math.round(this.router.drawProgress * 100)}%   ${Physics.degrees(this.router.aimRad).toFixed(1)}°   ·   发射 ${this.shots}   ·   敌人 ${enemy?.hp ?? 0} HP / ${enemy?.hits ?? 0} 命中`;
    const release = this.router.lastReleaseResult;
    const result = release === 'too-short' ? '按住时间太短' : release === 'cooldown' ? '射击冷却中' :
      release === 'queued' && this.lastAttempt ? ({ 'hands-unready': '双手尚未到位，请调整瞄准',
        'muzzle-blocked': '弓口被身体或平台挡住，请调整角度', 'arrow-limit': '在途箭已达上限', fired: '已放箭' })[this.lastAttempt.result] : '';
    if (result) this.aimLabel.string += `   ·   ${result}`;
    const hit = enemy?.lastHit;
    const r = this.probe.result;
    this.metrics.string = hit ? (enemy.hp === 0 ? '靶手已击倒 · 点重置再试' : `${arrowNames[hit.arrow.id]} · 命中${({ head: '头部', torso: '躯干', limb: '四肢' })[hit.zone]}  ·  -${hit.result.hpDamage} HP · ${hit.impulseNs.toFixed(2)} N·s`) : r ? `标定${r.passed ? '通过' : '失败'}  ·  位移 ${r.checks.glideXM.actual.toFixed(3)} m  ·  落体 ${r.checks.dropYM.actual.toFixed(3)} m  ·  ${r.steps} 步 / 1 s`
      : '正在采样 Box2D：滑行 / 落体 / 旋转';
    const drag = this.router.drag;
    if (drag) {
      const origin = this.viewport.toLocal(drag.origin), p = this.viewport.toLocal(drag.point);
      const radius = this.config.input.fullDrawDistanceDesign;
      const scale = Math.min(1, radius / Math.max(1, Math.hypot(p.x - origin.x, p.y - origin.y)));
      g.strokeColor = color('#87A6B6');
      g.lineWidth = 3;
      g.circle(origin.x, origin.y, radius);
      g.stroke();
      g.fillColor = color(tint);
      g.circle(origin.x + (p.x - origin.x) * scale, origin.y + (p.y - origin.y) * scale, 16);
      g.fill();
    }
  }

  private drawAim(): void {
    const g = this.aim;
    g.clear();
    if (this.viewport.portrait || this.manualPause || this.hidden) return;
    const arrow = this.config.arrows.find(value => value.id === this.router.selectedArrow.id)!;
    const socket = { ...this.playerAim.bowSocket(), angleRad: this.router.aimRad };
    const dx = Math.cos(socket.angleRad), dy = Math.sin(socket.angleRad);
    this.drawBow(g, socket, dx, dy, arrowTints[arrow.id]);
    const clear = this.projectiles.muzzleClear('PlayerRagdoll', socket);
    g.fillColor = color(!clear ? '#FF645E' : !this.playerAim.handsSnapshot.ready ? '#F0A84B' : arrowTints[arrow.id]);
    g.circle(Physics.units(socket.x), Physics.units(socket.y), Physics.units(0.08));
    if (clear && this.router.aimId !== null) {
      const launchArrow = applyDrawStrength(arrow, this.router.drawProgress, this.config.bowControl.minPowerRatio);
      for (const point of aimHintPoints(socket, socket.angleRad, launchArrow.speedMps,
        this.config.physics.gravityMps2, this.config.physics.fixedTimeStepSec, TIP_OFFSET_M)) {
        g.circle(Physics.units(point.x), Physics.units(point.y), Physics.units(0.035));
      }
    }
    g.fill();
  }

  private drawBow(g: Graphics, socket: Point, dx: number, dy: number, arrowTint: string): void {
    const point = (forward: number, across: number) => ({
      x: Physics.units(socket.x + dx * forward - dy * across),
      y: Physics.units(socket.y + dy * forward + dx * across),
    });
    const top = point(-this.config.bowControl.braceDepthM, this.config.bowControl.bowHalfHeightM),
      bottom = point(-this.config.bowControl.braceDepthM, -this.config.bowControl.bowHalfHeightM), center = point(0.36, 0);
    const grip = this.playerAim.handsSnapshot.stringGrip;
    const nock = { x: Physics.units(grip.x), y: Physics.units(grip.y) };
    g.lineWidth = Physics.units(0.065);
    g.strokeColor = color('#DDA460');
    g.moveTo(top.x, top.y);
    g.quadraticCurveTo(center.x, center.y, bottom.x, bottom.y);
    g.stroke();
    g.lineWidth = Physics.units(0.025);
    g.strokeColor = color('#EAF4F7');
    g.moveTo(top.x, top.y);
    g.lineTo(nock.x, nock.y);
    g.lineTo(bottom.x, bottom.y);
    g.stroke();
    if (this.router.aimId !== null) {
      const tip = point(TIP_OFFSET_M, 0);
      g.lineWidth = Physics.units(0.035);
      g.strokeColor = color(arrowTint);
      g.moveTo(nock.x, nock.y);
      g.lineTo(tip.x, tip.y);
      g.stroke();
    }
  }

  private buildPlatforms(world: Node, platformGroup: number): void {
    const platforms = [
      { id: 'player_main', x: 3.5, surfaceY: 3, width: 5 },
      { id: 'enemy_low', x: 18, surfaceY: 3, width: 3 },
      { id: 'enemy_high', x: 20, surfaceY: 6, width: 3 },
    ];
    for (const platform of platforms) {
      const node = child(world, `Platform_${platform.id}`);
      Physics.place(node, platform.x, platform.surfaceY - 0.3);
      const body = node.addComponent(RigidBody2D);
      body.type = ERigidBody2DType.Static;
      body.group = platformGroup;
      const collider = node.addComponent(BoxCollider2D);
      collider.group = platformGroup;
      collider.size.set(Physics.units(platform.width), Physics.units(0.6));
      collider.friction = 0.9;
      collider.restitution = 0;
      collider.apply();
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = color('#496272');
      graphics.rect(Physics.units(-platform.width / 2), Physics.units(-0.3), Physics.units(platform.width), Physics.units(0.6));
      graphics.fill();
    }
  }

  private drawRuler(world: Node): void {
    const g = child(world, 'MeterGrid').addComponent(Graphics);
    const u = Physics.units;
    g.strokeColor = color('#274151');
    g.lineWidth = 0.5;
    for (let x = 0; x <= 24; x++) { g.moveTo(u(x), u(-1.75)); g.lineTo(u(x), u(11.75)); }
    for (let y = -1; y <= 11; y++) { g.moveTo(0, u(y)); g.lineTo(u(24), u(y)); }
    g.stroke();
    for (const [x, y, w] of [[3.5, 3, 5], [18, 3, 3], [20, 6, 3]]) {
      fill(g, u(x - w / 2), u(y - 0.28), u(w), u(0.28), '#496272');
    }
    g.strokeColor = color('#A17C4A');
    g.lineWidth = 1;
    g.moveTo(u(PROBE.x), u(PROBE.y));
    g.lineTo(u(PROBE.x + PROBE.speed), u(PROBE.y));
    for (let x = PROBE.x; x <= PROBE.x + PROBE.speed; x++) { g.moveTo(u(x), u(PROBE.y - 0.24)); g.lineTo(u(x), u(PROBE.y + 0.24)); }
    g.stroke();
    g.strokeColor = color('#4C8A91');
    const bottom = PROBE.y + this.config.physics.gravityMps2[1] / 2;
    g.moveTo(u(PROBE.dropX), u(PROBE.y)); g.lineTo(u(PROBE.dropX), u(bottom));
    for (let y = PROBE.y; y >= bottom; y--) { g.moveTo(u(PROBE.dropX - 0.23), u(y)); g.lineTo(u(PROBE.dropX + 0.23), u(y)); }
    g.stroke();
    for (const [text, x, y] of [['0 m', PROBE.x, PROBE.y + 0.55], ['10 m', PROBE.x + PROBE.speed, PROBE.y + 0.55],
      ['1 m / 格', 15.5, 7.85], ['落体', PROBE.dropX, PROBE.y + 0.55]] as const) {
      const l = label(world, text, 12, text);
      l.node.setPosition(u(x), u(y));
    }
  }
}
