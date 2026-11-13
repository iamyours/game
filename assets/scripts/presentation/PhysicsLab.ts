import { aimHintPoints, applyDrawStrength } from '../domain/archery';
import { _decorator, AudioClip, AudioSource, BoxCollider2D, Camera, Canvas, Color, Component, ERigidBody2DType, Game, Graphics, Label, Layers, Node,
  PhysicsSystem2D, RenderRoot2D, RigidBody2D, UITransform, game, input, Input, profiler, resources, screen, sys, view, isValid, type EventTouch } from 'cc';
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
import { drawWeaponBow } from './WeaponVisual';
import { ThunderBowSkin, ThunderWeaponAssets, thunderArrowLength } from './ThunderWeaponSkin';
import { handDrawFlex, nockedArrowTip } from '../domain/weaponGeometry';
import { ArcadeBattle } from '../combat/ArcadeBattle';
import { CharacterSkin } from './CharacterSkin';
import { ShotBudget, type ShotRejection } from '../domain/BattleRules';
import { ArcadeRecordRepository } from '../domain/SaveRepository';
import { eventCallbackCount, RuntimeDiagnostics } from '../domain/RuntimeDiagnostics';
import { battleAimRect, battlePauseLayout, battleResultLayout, cooldownProgress } from '../domain/BattleLayout';
import { ImpactFeedback } from '../domain/ProjectilePresentation';
import { drawImpactMark, drawRuinsPlatform } from './BattleArt';
import { RuinsArtAssets } from './RuinsArtAssets';

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
  private arcade: ArcadeBattle | null = null;
  private arcadeMode = typeof location === 'undefined' || new URLSearchParams(location.search).get('practice') !== '1';
  private probe!: CalibrationProbe;
  private router!: InputRouter;
  private viewport!: LabViewport;
  private config!: PhysicsLabConfig;
  private overlay!: Node;
  private hud!: Graphics;
  private aim!: Graphics;
  private impactArt!: Graphics;
  private readonly impactFeedback = new ImpactFeedback();
  private readonly ruinsArt = new RuinsArtAssets();
  private title!: Label;
  private vitals!: Label;
  private metrics!: Label;
  private aimLabel!: Label;
  private switchLabel!: Label;
  private pauseLabel!: Label;
  private resetLabel!: Label;
  private resetRect: Rect = empty;
  private resetTouch: number | null = null;
  private notice!: Label;
  private retryLabel!: Label;
  private retryRect: Rect = empty;
  private layout: InputLayout = { aim: empty, arrowSwitch: empty };
  private pauseRect: Rect = empty;
  private pauseId: number | null = null;
  private manualPause = false;
  private hidden = false;
  private shots = 0;
  private lastAttempt: { stepId: number; result: 'hands-unready' | 'arrow-limit' | 'muzzle-blocked' | 'fired' | ShotRejection } | null = null;
  private lastShot: (ShotIntent & { stepId: number; socket: ReturnType<AimController['bowSocket']>;
    hands: PoseController['handsSnapshot']; launchTip: Point; drawAmount: number; speedMps: number }) | null = null;
  private dirty = true;
  private ragdollFactory: RagdollFactory | null = null;
  private ragdolls: RagdollInstance[] = [];
  private skins: CharacterSkin[] = [];
  private playerAim!: AimController;
  private enemyAim!: AimController;
  private projectiles!: ProjectileSystem;
  private weaponAssets!: ThunderWeaponAssets;
  private playerBow!: ThunderBowSkin;
  private hitResolver!: HitResolver;
  private combatStates!: Map<string, ActorCombatState>;
  private resetRequested = false;
  private demoRequested: PoseName | null = null;
  private poseButtons: { pose: PoseName; label: Label; rect: Rect }[] = [];
  private poseTouch: { id: number; index: number } | null = null;
  private resetCount = 0;
  private shotBudget!: ShotBudget;
  private records!: ArcadeRecordRepository;
  private soundLabel!: Label;
  private soundRect: Rect = empty;
  private soundTouch: number | null = null;
  private soundSource!: AudioSource;
  private readonly audioClips = new Map<string, AudioClip>();
  private readonly lastSoundSteps = new Map<string, number>();
  private readonly diagnostics = new RuntimeDiagnostics();
  private recordPendingAt: number | null = null;
  private restartSampleStep: number | null = null;
  private resultRecorded = false;
  private disposed = false;
  private fullscreenLabel!: Label;
  private fullscreenRect: Rect = empty;
  private fullscreenTouch: number | null = null;
  private get canFullscreen(): boolean {
    return this.arcadeMode && typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  }

  public setup(canvas: Canvas, config: PhysicsLabConfig, seedHash: string): void {
    this.config = config;
    this.shotBudget = new ShotBudget(config.player);
    this.records = new ArcadeRecordRepository(sys.localStorage);
    this.soundSource = this.node.addComponent(AudioSource);
    if (this.arcadeMode) for (const kind of ['shot', 'hit', 'drop', 'hit-heavy', 'hit-critical']) resources.load(`audio/${kind}`, AudioClip, (error, clip) => {
      if (error) { console.warn('[Audio]', error); return; }
      if (this.disposed || !isValid(this.node)) return;
      clip.addRef(); this.audioClips.set(kind, clip);
    });
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

    this.viewport = new LabViewport(worldCamera, config.viewport, this.arcadeMode);
    this.physics = new Physics(config.physics);
    this.router = new InputRouter({ deadzoneDesign: config.input.deadzoneDesign,
      initialRad: Physics.radians(config.input.initialAimDeg), minRad: Physics.radians(config.input.minAimDeg),
      maxRad: Physics.radians(config.input.maxAimDeg), firstShotDelaySec: config.input.firstShotDelaySec,
      pullBackToAim: config.input.pullBackToAim, fullDrawDistanceDesign: config.input.fullDrawDistanceDesign }, config.arrows, this.arcadeMode);
    if (!this.arcadeMode) this.drawRuler(world);
    // Native fixtures capture their collision mask when created. Configure it first,
    // including when setup runs on an already-active scene (editor/re-entry).
    this.ragdollFactory = new RagdollFactory(config.rig);
    if (this.arcadeMode) this.drawBackdrop(world);
    this.buildPlatforms(world, config.rig.collisionGroups.platform);
    this.ragdolls = [
      this.ragdollFactory.spawn(world, 'PlayerRagdoll', [3.5, 3.41], '#63C6C9'),
      ...(!this.arcadeMode ? [this.ragdollFactory.spawn(world, 'EnemyRagdoll', [18, 3.41], '#E98575')] : []),
    ];
    this.skins = this.ragdolls.map(actor => new CharacterSkin(actor, config.rig));
    this.skins.forEach((skin, index) => {
      void skin.load(index === 0 ? 'hero' : 'enemy', this.arcadeMode ? 'ruins' : 'classic').catch(error => {
        console.warn('[PhysicsLab] 角色图片加载失败，保留灰盒：', error);
      });
    });
    this.playerAim = new AimController(this.ragdolls[0], new PoseController(this.ragdolls[0], config.rig, config.bowControl));
    this.enemyAim = this.arcadeMode ? this.playerAim : new AimController(this.ragdolls[1]!, new PoseController(this.ragdolls[1]!, config.rig, config.bowControl));
    this.playerAim.setPose('standing');
    this.enemyAim.setPose('standing');
    this.combatStates = new Map([
      ['PlayerRagdoll', { id: 'PlayerRagdoll', hp: config.player.hp, armor: 0, hits: 0, lastHit: null }],
      ['EnemyRagdoll', { id: 'EnemyRagdoll', hp: config.enemies[0]?.hp ?? 60, armor: config.enemies[0]?.helmetDurability ?? 0, hits: 0, lastHit: null }],
    ]);
    this.hitResolver = new HitResolver(this.combatStates, config, (state) => {
      const aim = state.id === 'PlayerRagdoll' ? this.playerAim : this.enemyAim;
      this.arcade?.hit(state, state.lastHit!.partId);
      const hit = state.lastHit!;
      const tier = hit.partId === 'head' ? 3 : hit.arrow.id === 'impact' || state.hp <= 0 ? 2 : 1;
      this.impactFeedback.hit(hit.shotId, hit.pointM, Math.atan2(hit.incomingVelocityMps.y, hit.incomingVelocityMps.x), tier);
      this.playSound(tier === 3 ? 'hit-critical' : tier === 2 ? 'hit-heavy' : 'hit');
      if (state.hp <= 0) aim.setAlive(false);
      else if (state.lastHit) aim.registerHit(state.lastHit.jointReaction);
      this.dirty = true;
    }, this.arcadeMode && config.arcade.headshotLethal, id => this.ragdolls.find(actor => actor.id === id)?.bodies.get('chest'));
    if (this.arcadeMode) this.combatStates.delete('EnemyRagdoll');
    this.weaponAssets = new ThunderWeaponAssets();
    this.playerBow = new ThunderBowSkin(world, this.weaponAssets);
    void this.weaponAssets.load().catch(error => console.warn('[ThunderWeapon] 素材加载失败，保留程序武器：', error));
    this.projectiles = new ProjectileSystem(world, config, this.ragdolls, (candidate, targetBody) => this.hitResolver.resolve(candidate, targetBody), this.weaponAssets);
    if (this.arcadeMode) this.arcade = new ArcadeBattle(world, config, this.ragdollFactory!, this.ragdolls, this.combatStates, this.projectiles, aim => { this.enemyAim = aim ?? this.playerAim; }, kind => this.playSound(kind), effect => {
      const player = this.combatStates.get('PlayerRagdoll')!;
      player.hp = Math.min(config.player.hp, player.hp + effect.hp); this.shotBudget.restore(effect.stamina);
    }, this.ruinsArt);
    this.probe = new CalibrationProbe(world, config.physics);
    if (this.arcadeMode) for (const name of ['GlideBody', 'DropBody']) { const g = world.getChildByName(name)?.getComponent(Graphics); if (g) g.enabled = false; }
    this.aim = child(world, 'AimPreview').addComponent(Graphics);
    this.impactArt = child(world, 'ImpactFeedback').addComponent(Graphics);
    this.overlay = child(canvas.node, 'PhysicsLabHUD');
    this.hud = child(this.overlay, 'TouchZones').addComponent(Graphics);
    this.title = label(this.overlay, 'Title', 42, this.arcadeMode ? '风暴弓手 · 连续对战' : '风暴弓手 / PhysicsLab');
    this.vitals = label(this.overlay, 'Vitals', 26);
    this.metrics = label(this.overlay, 'Metrics', 26);
    this.aimLabel = label(this.overlay, 'AimLabel', 28);
    this.switchLabel = label(this.overlay, 'ArrowSwitch', 30);
    this.pauseLabel = label(this.overlay, 'Pause', 30);
    this.resetLabel = label(this.overlay, 'Reset', 30, '重开');
    this.soundLabel = label(this.overlay, 'Sound', 26);
    this.fullscreenLabel = label(this.overlay, 'Fullscreen', 24, '全屏');
    this.poseButtons = (this.arcadeMode ? [] : ['standing', 'staggered', 'downed'] as const).map((pose, i) => ({
      pose, label: label(this.overlay, `Pose_${pose}`, 25, ['站立重置', '后仰测试', '倒地测试'][i]), rect: empty,
    }));
    this.notice = label(this.overlay, 'Notice', 36);
    this.retryLabel = label(this.overlay, 'Retry', 30, '再来一局');
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
    if (this.arcadeMode && !this.hidden && !this.manualPause && !this.viewport.portrait) {
      const counts = this.physics?.nativeCounts();
      if (counts) {
        const memoryBytes = typeof performance === 'undefined' ? null :
          (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
        const sample = { ...counts, frameMs: dt * 1000, memoryBytes, listeners: this.listenerCounts().cocosTotal };
        this.diagnostics.sample(sample);
        if (this.restartSampleStep !== null && this.physics!.steps >= this.restartSampleStep) {
          this.diagnostics.restart(sample); this.restartSampleStep = null;
        }
      }
    }
    if (this.dirty && this.physics) { this.dirty = false; this.drawHUD(); }
    if (this.physics) { this.drawAim(); this.arcade?.draw(); this.drawImpactFeedback(); }
  }

  public onDestroy(): void {
    this.disposed = true;
    this.impactFeedback.clear();
    view.off('canvas-resize', this.resize, this);
    input.off(Input.EventType.TOUCH_START, this.press, this);
    input.off(Input.EventType.TOUCH_MOVE, this.move, this);
    input.off(Input.EventType.TOUCH_END, this.release, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.cancel, this);
    game.off(Game.EVENT_HIDE, this.hide, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.cancel);
    this.records?.flush();
    this.soundSource?.stop();
    for (const clip of this.audioClips.values()) clip.decRef(); this.audioClips.clear();
    this.projectiles?.dispose();
    this.playerBow?.dispose();
    this.weaponAssets?.dispose();
    this.arcade?.dispose();
    this.ruinsArt.dispose();
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
    return { thunderSkin: this.playerBow?.snapshot ?? null, arcade: this.arcade?.snapshot ?? null, stamina: this.shotBudget.stamina, cooldownSec: this.shotBudget.cooldownSec,
      records: this.records.snapshot, saveStatus: this.records.lastWrite, diagnostics: this.diagnostics.report(),
      nativeCounts: this.physics?.nativeCounts() ?? null, projectilePoolSize: this.projectiles?.poolSize ?? 0,
      projectileVisuals: { embedded: this.projectiles?.embeddedCount ?? 0, maxEmbedded: this.config.limits.maxEmbeddedVisuals,
        embeddedTtlSec: this.config.limits.embeddedTtlSec, terrainTtlSec: this.config.limits.terrainEmbeddedTtlSec },
      listenerCounts: this.listenerCounts(), soundRect: this.soundRect, seedHash: this.seedHash, calibration: this.probe.result, stepId: this.physics?.steps,
      autoSimulation: PhysicsSystem2D.instance.autoSimulation, shots: this.shots, lastShot: this.lastShot,
      lastAttempt: this.lastAttempt, lastReleaseResult: this.router.lastReleaseResult,
      aimId: this.router.aimId, aimDeg: Physics.degrees(this.router.aimRad), arrow: this.router.selectedArrow.id,
      drawProgress: this.router.drawProgress, paused: this.manualPause, hidden: this.hidden, portrait: v.portrait, layout: this.layout,
      poseButtons: this.poseButtons.map(({ pose, rect }) => ({ pose, rect })),
      pauseRect: this.pauseRect, resetRect: this.resetRect, fullscreenRect: this.fullscreenRect,
      fullscreenAvailable: this.canFullscreen, width: v.width, height: v.height, safe: v.safe, battleBounds: v.worldBounds,
      retryRect: this.retryRect, resultVisible: this.arcadeMode && this.combatStates.get('PlayerRagdoll')!.hp <= 0 && !v.portrait && !this.manualPause,
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
    return this.physics?.nativeCounts()?.bodies ?? this.node.getComponentsInChildren(RigidBody2D)
      .filter(body => body.enabled && body.node.activeInHierarchy).length;
  }

  private listenerCounts() {
    const counts = [input, view, game].map(target => eventCallbackCount(target, { owner: this }));
    const globals = counts.every(n => n !== null) ? (counts as number[]).reduce((sum, n) => sum + n, 0) : null;
    const contacts = this.projectiles.contactListenerCount;
    return { scope: 'Cocos callbacks owned by this lab and its projectile pool; DOM/OS excluded',
      globals, contacts, cocosTotal: globals === null || contacts === null ? null : globals + contacts };
  }

  private countHingeJoints(): number {
    return this.ragdolls.reduce((count, ragdoll) => count + ragdoll.joints.size, 0);
  }

  private beforeStep = (dt: number, stepId: number): void => {
    this.projectiles.beginStep(stepId);
    const shot = this.router.step(dt);
    if (this.arcadeMode) this.shotBudget.step(dt, this.router.aimId !== null || shot !== null,
      this.combatStates.get('PlayerRagdoll')!.hp > 0);
    this.playerAim.setWorldAim(shot?.aimRad ?? this.router.aimRad);
    this.playerAim.setDraw(this.router.aimId !== null || shot !== null, shot ? shot.strength : this.router.drawProgress);
    this.playerAim.step(dt);
    if (this.arcade) {
      this.arcade.beforeStep(dt);
      if (this.combatStates.get('PlayerRagdoll')!.hp <= 0) { this.router.cancel(); return; }
    } else { this.enemyAim.setWorldAim(0); this.enemyAim.step(dt); }
    if (!shot) return;
    if (!this.playerAim.handsSnapshot.ready) {
      this.lastAttempt = { stepId, result: 'hands-unready' };
      this.dirty = true;
      return;
    }
    const arrow = this.config.arrows.find((value) => value.id === shot.arrowId);
    if (!arrow) return;
    const socket = this.playerAim.bowSocket();
    const launchTip = nockedArrowTip(this.playerAim.handsSnapshot.stringGrip, shot.aimRad, thunderArrowLength(arrow.id));
    const blocked = this.projectiles.launchBlockReason('PlayerRagdoll', socket, launchTip);
    if (blocked) {
      this.lastAttempt = { stepId, result: blocked };
      this.dirty = true;
      return;
    }
    const launchArrow = applyDrawStrength(arrow, shot.strength, this.config.bowControl.minPowerRatio);
    if (this.arcadeMode) {
      const rejection = this.shotBudget.release(arrow, { active: true, alive: true, armed: true, launchClear: true });
      if (rejection) { this.lastAttempt = { stepId, result: rejection }; this.dirty = true; return; }
    }
    const shotId = this.projectiles.fire('PlayerRagdoll', { ...socket, angleRad: shot.aimRad }, launchArrow, launchTip);
    if (shotId !== null) { this.lastShot = { ...shot, stepId, socket, launchTip, hands: this.playerAim.handsSnapshot,
      drawAmount: this.playerAim.poseSnapshot.drawAmount, speedMps: launchArrow.speedMps }; this.shots += 1;
      this.lastAttempt = { stepId, result: 'fired' }; this.playerAim.releaseBow(); this.playSound('shot'); }
    this.dirty = true;
  };

  private afterStep = (_dt: number, stepId: number): void => {
    this.impactFeedback.step(_dt);
    const prior = this.probe.result;
    this.probe.afterStep(stepId);
    this.projectiles.afterStep();
    this.arcade?.afterStep();
    if (this.arcade) {
      if (this.arcade.score > this.records.snapshot.bestScore && this.recordPendingAt === null) this.recordPendingAt = stepId;
      const dead = this.combatStates.get('PlayerRagdoll')!.hp <= 0;
      if (dead) {
        this.router.cancel();
        this.playerAim.setAlive(false);
        if (!this.resultRecorded) { this.records.record(this.arcade.score); this.resultRecorded = true; }
      }
      if (this.recordPendingAt !== null && stepId >= this.recordPendingAt) {
        this.records.record(this.arcade.score); this.recordPendingAt = null;
      }
      this.dirty = true;
    }
    if (this.resetRequested) {
      this.resetRequested = false; this.demoRequested = null;
      this.projectiles.clear();
      this.impactFeedback.clear();
      if (this.arcade) { this.ragdolls[0]!.reset(); this.arcade.reset(); }
      else this.ragdollFactory?.resetAll();
      for (const state of this.combatStates.values()) { if (this.arcade && state.id !== 'PlayerRagdoll') continue; state.hp = state.id === 'PlayerRagdoll' ? this.config.player.hp : (this.config.enemies[0]?.hp ?? 60); state.armor = state.id === 'PlayerRagdoll' ? 0 : (this.config.enemies[0]?.helmetDurability ?? 0); state.hits = 0; state.lastHit = null; }
      this.router.cancel();
      this.shotBudget.reset(); this.resultRecorded = false; this.recordPendingAt = null;
      this.lastSoundSteps.clear(); this.restartSampleStep = stepId + 60;
      this.records.flush();
      this.playerAim.reset(); this.enemyAim.reset();
      if (this.arcade) this.enemyAim.setWorldAim(Math.PI - 0.2);
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
      if (this.arcadeMode && this.combatStates.get('PlayerRagdoll')!.hp <= 0) {
        if (contains(this.retryRect, point)) this.resetTouch = touch.getID();
        continue; // Result is a modal: no hidden HUD controls or battlefield input behind it.
      }
      if (contains(this.pauseRect, point)) {
        if (this.pauseId === null) this.pauseId = touch.getID();
      } else if (this.arcadeMode && this.manualPause && contains(this.retryRect, point)) this.pauseId = touch.getID();
      else if (this.canFullscreen && (!this.arcadeMode || this.manualPause) && contains(this.fullscreenRect, point)) this.fullscreenTouch = touch.getID();
      else if (this.arcadeMode && this.manualPause && contains(this.soundRect, point)) this.soundTouch = touch.getID();
      else if ((!this.arcadeMode || this.manualPause) && contains(this.resetRect, point)) this.resetTouch = touch.getID();
      else if (this.arcadeMode && this.manualPause) continue;
      else if (this.poseButtons.some(button => contains(button.rect, point))) {
        this.poseTouch = { id: touch.getID(), index: this.poseButtons.findIndex(button => contains(button.rect, point)) };
      } else this.router.press(touch.getID(), point, this.layout);
    }
    this.dirty = true;
  }
  private move(event: EventTouch): void {
    if (this.arcadeMode && this.combatStates.get('PlayerRagdoll')!.hp <= 0) return;
    for (const touch of event.getTouches()) this.router.move(touch.getID(), this.viewport.fromUILocation(touch.getUILocation()));
    this.dirty = true;
  }
  private release(event: EventTouch): void {
    for (const touch of event.getTouches()) {
      const point = this.viewport.fromUILocation(touch.getUILocation());
      if (this.pauseId === touch.getID()) {
        this.pauseId = null;
        if (contains(this.pauseRect, point) || (this.arcadeMode && this.manualPause && contains(this.retryRect, point))) {
          this.manualPause = !this.manualPause; this.syncPause();
        }
      } else if (this.fullscreenTouch === touch.getID()) {
        this.fullscreenTouch = null;
        if (contains(this.fullscreenRect, point)) this.toggleFullscreen();
      } else if (this.soundTouch === touch.getID()) {
        this.soundTouch = null;
        if (contains(this.soundRect, point)) {
          this.records.setSound(!this.records.snapshot.soundEnabled);
          if (!this.records.snapshot.soundEnabled) this.soundSource.stop();
        }
      } else if (this.resetTouch === touch.getID()) {
        this.resetTouch = null;
        const dead = this.arcadeMode && this.combatStates.get('PlayerRagdoll')!.hp <= 0;
        if (dead ? contains(this.retryRect, point) : (!this.arcadeMode || this.manualPause) && contains(this.resetRect, point)) {
          this.manualPause = false; this.syncPause(); this.resetRagdolls();
        }
      } else if (this.poseTouch?.id === touch.getID()) {
        const button = this.poseButtons[this.poseTouch.index]!;
        this.poseTouch = null;
        if (contains(button.rect, point)) this.requestPoseDemo(button.pose);
      } else if (!this.arcadeMode || this.combatStates.get('PlayerRagdoll')!.hp > 0) this.router.release(touch.getID(), point, this.layout);
    }
    this.dirty = true;
  }
  private cancel = (): void => {
    this.pauseId = this.resetTouch = this.soundTouch = this.fullscreenTouch = null;
    this.poseTouch = null;
    this.router.cancel();
    this.dirty = true;
  };
  private hide(): void { this.records.flush(); this.soundSource.stop(); this.hidden = true; this.syncPause(); }
  private show(): void { this.hidden = false; this.syncPause(); }
  private syncPause(): void {
    this.cancel();
    const blocked = this.hidden || this.manualPause || this.viewport.portrait;
    this.router.setBlocked(blocked);
    this.physics?.setPaused(blocked);
    if (blocked) this.soundSource.stop();
  }

  private resize(): void {
    this.viewport.resize();
    this.ruinsArt.resize(this.viewport.worldBounds);
    this.projectiles.setViewBounds(this.viewport.worldBounds);
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
    this.soundRect = { ...this.resetRect, left: this.resetRect.left - switchW - 12, right: this.resetRect.left - 12 };
    this.placeLabel(this.soundLabel, midpoint(this.soundRect));
    this.placeLabel(this.pauseLabel, midpoint(this.pauseRect));
    if (this.arcadeMode) {
      this.layout.aim = battleAimRect(safe);
      const buttonW = Math.max(132, minSize), buttonH = Math.max(78, minSize), gap = 12;
      const action = (index: number): Rect => ({ left: safe.right - 20 - buttonW - index * (buttonW + gap),
        right: safe.right - 20 - index * (buttonW + gap), top: safe.top + 20, bottom: safe.top + 20 + buttonH });
      this.pauseRect = action(0); this.resetRect = action(1); this.soundRect = action(2); this.fullscreenRect = action(3);
      this.placeLabel(this.pauseLabel, midpoint(this.pauseRect)); this.placeLabel(this.resetLabel, midpoint(this.resetRect));
      this.placeLabel(this.soundLabel, midpoint(this.soundRect)); this.placeLabel(this.fullscreenLabel, midpoint(this.fullscreenRect));
      this.placeLabel(this.title, safe.left + 134, safe.top + 47);
      this.placeLabel(this.metrics, safe.left + 335, safe.top + 48);
      this.placeLabel(this.vitals, safe.left + 236, safe.top + 102);
      const font = Math.max(26, 13 * screen.devicePixelRatio / view.getScaleX());
      for (const l of [this.metrics, this.vitals, this.soundLabel, this.pauseLabel, this.resetLabel, this.fullscreenLabel]) {
        l.fontSize = font; l.lineHeight = font * 1.3;
      }
      this.title.fontSize = Math.max(40, font * 1.45);
      this.aimLabel.fontSize = font; this.aimLabel.lineHeight = font * 1.3;
      this.aimLabel.overflow = Label.Overflow.SHRINK;
      this.aimLabel.node.getComponent(UITransform)!.setContentSize(w * 0.55, Math.max(70, font * 2));
      this.placeLabel(this.aimLabel, safe.left + w * 0.29, safe.bottom - 42);
      this.layout.arrowSwitch = { left: safe.right - Math.max(200, minSize) - 24, right: safe.right - 24,
        top: safe.bottom - Math.max(104, minSize) - 28, bottom: safe.bottom - 28 };
      this.placeLabel(this.switchLabel, midpoint(this.layout.arrowSwitch)); this.switchLabel.fontSize = font + 2;
      const result = battleResultLayout(safe, minSize);
      this.retryRect = result.retry;
      this.placeLabel(this.retryLabel, midpoint(this.retryRect)); this.retryLabel.fontSize = font + 4;
    }
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
    const dead = this.arcadeMode && this.combatStates.get('PlayerRagdoll')!.hp <= 0;
    for (const l of [this.title, this.metrics, this.aimLabel, this.pauseLabel, this.resetLabel]) l.node.active = !portrait;
    for (const button of this.poseButtons) button.label.node.active = !portrait;
    this.soundLabel.node.active = !portrait && this.arcadeMode && this.manualPause && !dead;
    this.vitals.node.active = !portrait && this.arcadeMode;
    this.fullscreenLabel.node.active = !portrait && this.canFullscreen && (!this.arcadeMode || this.manualPause) && !dead;
    this.resetLabel.node.active = !portrait && (!this.arcadeMode || (this.manualPause && !dead));
    this.soundLabel.string = this.records.snapshot.soundEnabled ? '音效 开' : '音效 关';
    this.switchLabel.node.active = !portrait && !dead && !this.manualPause && this.router.canSwitch;
    this.retryLabel.node.active = !portrait && (dead || (this.arcadeMode && this.manualPause));
    this.retryLabel.string = dead ? '再来一局' : '继续战斗';
    this.pauseLabel.node.active = !portrait && !dead;
    this.aimLabel.node.active = !portrait && !dead && !this.manualPause;
    this.notice.node.active = portrait || this.manualPause || dead;
    this.notice.fontSize = portrait ? Math.max(36, 24 * screen.devicePixelRatio / view.getScaleX()) : 36;
    this.notice.lineHeight = this.notice.fontSize * 1.3;
    this.notice.string = portrait ? '请横置屏幕' : this.manualPause && !dead ? '已暂停' :
      `本次击败 ${this.arcade?.score ?? 0} 名敌人\n最高记录 ${this.records.snapshot.bestScore}`;
    if (!portrait && (dead || (this.arcadeMode && this.manualPause))) {
      const touch = 48 * screen.devicePixelRatio / view.getScaleX();
      const panel = dead ? battleResultLayout(this.viewport.safe, touch) : battlePauseLayout(this.viewport.safe, touch);
      this.retryRect = panel.retry; this.placeLabel(this.retryLabel, midpoint(this.retryRect)); this.placeLabel(this.notice, panel.summary);
      if (!dead) {
        const options = battlePauseLayout(this.viewport.safe, touch).options;
        this.soundRect = options[0]!; this.fullscreenRect = options[1]!; this.resetRect = options[2]!;
        this.placeLabel(this.soundLabel, midpoint(this.soundRect)); this.placeLabel(this.fullscreenLabel, midpoint(this.fullscreenRect));
        this.placeLabel(this.resetLabel, midpoint(this.resetRect));
      }
    } else this.placeLabel(this.notice, this.viewport.width / 2, this.viewport.height / 2);
    if (portrait) return;
    if (this.arcadeMode) { this.drawBattleHUD(); return; }
    const box = (r: Rect, tint: string): void => {
      const p = this.viewport.toLocal({ x: r.left, y: r.bottom });
      fill(g, p.x, p.y, r.right - r.left, r.bottom - r.top, tint);
    };
    box(this.layout.aim, '#203A4CE8');
    box(this.pauseRect, '#294657');
    box(this.resetRect, '#294657');
    if (this.arcadeMode) box(this.soundRect, '#294657');
    for (const button of this.poseButtons) box(button.rect, '#294657');
    if (this.router.canSwitch) box(this.layout.arrowSwitch, '#294657');
    if (this.manualPause) box({ left: this.viewport.width / 2 - 310, right: this.viewport.width / 2 + 310,
      top: this.viewport.height / 2 - 44, bottom: this.viewport.height / 2 + 44 }, '#102631');
    const id = this.router.selectedArrow.id;
    const tint = arrowTints[id] ?? '#F7C66F';
    this.pauseLabel.string = this.manualPause ? '继续' : '暂停';
    this.switchLabel.string = `切箭 · ${arrowNames[id] ?? id}`;
    this.switchLabel.color = color(tint);
    const enemy = this.combatStates.get(this.arcade?.snapshot.enemyId ?? 'EnemyRagdoll');
    this.aimLabel.string = `拖动拉弓 · 松手放箭   力度 ${Math.round(this.router.drawProgress * 100)}%   ${Physics.degrees(this.router.aimRad).toFixed(1)}°   ·   发射 ${this.shots}   ·   敌人 ${enemy?.hp ?? 0} HP / ${enemy?.hits ?? 0} 命中`;
    const release = this.router.lastReleaseResult;
    const result = release === 'too-short' ? '按住时间太短' : release === 'cooldown' ? '射击冷却中' :
      release === 'queued' && this.lastAttempt ? ({ 'hands-unready': '双手尚未到位，请调整瞄准',
        'muzzle-blocked': '弓口被身体或平台挡住，请调整角度', 'arrow-limit': '在途箭已达上限', fired: '已放箭', exhausted: '体力不足', cooldown: '射击冷却中',
         dead: '你已倒下', inactive: '', disarmed: '弓已脱落', blocked: '弓口被挡住' })[this.lastAttempt.result] : '';
    if (result) this.aimLabel.string += `   ·   ${result}`;
    if (this.arcade) this.aimLabel.string = `拖动拉弓 · 松手放箭  ${Math.round(this.router.drawProgress * 100)}%  · 击败 ${this.arcade.score}  · 生命 ${this.combatStates.get('PlayerRagdoll')!.hp}  · 体力 ${Math.floor(this.shotBudget.stamina)}  · 最佳 ${this.records.snapshot.bestScore}` + (result ? `  · ${result}` : '');
    const hit = enemy?.lastHit;
    const r = this.probe.result;
    this.metrics.string = hit ? (enemy.hp === 0 ? '靶手已击倒 · 点重置再试' : `${arrowNames[hit.arrow.id]} · 命中${({ head: '头部', torso: '躯干', limb: '四肢' })[hit.zone]}  ·  -${hit.result.hpDamage} HP · ${hit.impulseNs.toFixed(2)} N·s`) : r ? `标定${r.passed ? '通过' : '失败'}  ·  位移 ${r.checks.glideXM.actual.toFixed(3)} m  ·  落体 ${r.checks.dropYM.actual.toFixed(3)} m  ·  ${r.steps} 步 / 1 s`
      : '正在采样 Box2D：滑行 / 落体 / 旋转';
    if (this.arcade) this.metrics.string = this.arcade.snapshot.telegraph ? '敌人正在拉弓' : '爆头一击致命 · 躲不过的箭需要抢先击倒敌人';
    if (this.arcade && this.combatStates.get('PlayerRagdoll')!.hp <= 0) this.metrics.string = `你已倒下 · 击败 ${this.arcade.score} 名敌人 · 点重置再来`;
    if (this.arcade && !this.records.lastWrite.ok) this.metrics.string += ' · 本地记录未保存，重开时重试';
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

  private toggleFullscreen(): void {
    if (!this.canFullscreen) return;
    this.cancel();
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    void request.then(() => {
      if (this.disposed) return;
      this.resize(); this.dirty = true;
    }).catch(() => { this.dirty = true; });
  }

  private drawBattleHUD(): void {
    const g = this.hud, safe = this.viewport.safe;
    const box = (r: Rect, hex: string, radius = 16): void => {
      const p = this.viewport.toLocal({ x: r.left, y: r.bottom });
      g.fillColor = color(hex); g.roundRect(p.x, p.y, r.right - r.left, r.bottom - r.top, radius); g.fill();
      g.strokeColor = color('#88B8CA30'); g.lineWidth = 1.5;
      g.roundRect(p.x, p.y, r.right - r.left, r.bottom - r.top, radius); g.stroke();
    };
    const hp = this.combatStates.get('PlayerRagdoll')!.hp, stamina = this.shotBudget.stamina;
    // Local scrims keep text readable over the painted sky without dimming the battlefield.
    box({ left: safe.left + 12, right: safe.left + 464, top: safe.top + 6, bottom: safe.top + 156 }, '#102A38D8', 18);
    if (hp > 0 && !this.manualPause) {
      const cx = safe.left + (safe.right - safe.left) * 0.29, width = Math.min(900, (safe.right - safe.left) * 0.55);
      box({ left: cx - width / 2, right: cx + width / 2, top: safe.bottom - 77, bottom: safe.bottom - 10 }, '#102A38B8', 16);
    }
    if (hp > 0) box(this.pauseRect, '#193646C8');
    if (this.router.canSwitch && hp > 0 && !this.manualPause) {
      const cooldown = this.shotBudget.cooldownSec;
      box(this.layout.arrowSwitch, cooldown > 0 ? '#162D3CE8' : '#1E3A49E8', 22);
      const interval = this.config.arrows.find(a => a.id === this.lastShot?.arrowId)?.intervalSec ?? this.config.arrows[0]!.intervalSec;
      const progress = cooldownProgress(cooldown, interval), r = this.layout.arrowSwitch;
      const track = { left: r.left + 20, right: r.right - 20, top: r.bottom - 15, bottom: r.bottom - 9 };
      box(track, '#375160', 3);
      if (progress > 0) box({ ...track, right: track.left + (track.right - track.left) * progress }, cooldown > 0 ? '#E5B669' : '#69C7D3', 3);
    }
    this.title.string = `击败 ${String(this.arcade!.score).padStart(2, '0')}`;
    this.metrics.string = `最高 ${this.records.snapshot.bestScore}`; this.metrics.color = color('#9AB6C4');
    this.vitals.string = `生命 ${hp}     体力 ${Math.floor(stamina)}`; this.vitals.color = color('#B9CED6');
    for (const [offset, ratio, tint] of [[28, hp / this.config.player.hp, '#F28480'], [250, stamina / this.config.player.stamina, '#69C7D3']] as const) {
      const track = { left: safe.left + offset, right: safe.left + offset + 194, top: safe.top + 132, bottom: safe.top + 140 };
      box(track, '#29424D', 4);
      if (ratio > 0) box({ ...track, right: track.left + 194 * Math.min(1, ratio) }, tint, 3);
    }
    this.pauseLabel.string = this.manualPause ? '继续' : '暂停';
    this.soundLabel.string = this.records.snapshot.soundEnabled ? '音效 开' : '音效 关';
    this.fullscreenLabel.string = typeof document !== 'undefined' && document.fullscreenElement ? '退出全屏' : '全屏';
    const id = this.router.selectedArrow.id, tint = arrowTints[id] ?? '#F7C66F';
    this.switchLabel.string = `${arrowNames[id] ?? id}箭  ›`; this.switchLabel.color = color(tint);
    const release = this.router.lastReleaseResult;
    const cooling = this.shotBudget.cooldownSec > 0.001;
    const result = release === 'too-short' ? '按住后松手发射' : release === 'cooldown' ? (cooling ? '准备下一箭' : '') :
      release === 'queued' && this.lastAttempt ? ({ 'hands-unready': '调整角度，让双手就位',
        'muzzle-blocked': '弓口被挡住，请调整角度', 'arrow-limit': '等待在途箭落下', fired: '', exhausted: '体力恢复中',
        cooldown: cooling ? '准备下一箭' : '', dead: '', inactive: '', disarmed: '弓已脱落', blocked: '弓口被挡住' })[this.lastAttempt.result] : '';
    this.aimLabel.color = color(result ? '#F7C790' : '#C4D6DE');
    this.aimLabel.string = hp <= 0 ? `本次击败 ${this.arcade!.score} 名敌人 · 点重开再来` : result ||
      (this.router.aimId !== null ? `拉弓 ${Math.round(this.router.drawProgress * 100)}% · 松手放箭` :
        cooling ? `下一箭 ${this.shotBudget.cooldownSec.toFixed(1)}s · 可先瞄准` : '左侧拖动拉弓 · 松手放箭');
    if (!this.records.lastWrite.ok) this.aimLabel.string += ' · 记录暂未保存';
    const drag = this.router.drag;
    if (drag && hp > 0) {
      const origin = this.viewport.toLocal(drag.origin), p = this.viewport.toLocal(drag.point), radius = this.config.input.fullDrawDistanceDesign;
      const scale = Math.min(1, radius / Math.max(1, Math.hypot(p.x - origin.x, p.y - origin.y)));
      g.strokeColor = color('#95C8D25A'); g.lineWidth = 2; g.circle(origin.x, origin.y, radius); g.stroke();
      g.strokeColor = color(tint); g.lineWidth = 4;
      g.moveTo(origin.x, origin.y); g.lineTo(origin.x + (p.x - origin.x) * scale, origin.y + (p.y - origin.y) * scale); g.stroke();
      g.fillColor = color(tint); g.circle(origin.x + (p.x - origin.x) * scale, origin.y + (p.y - origin.y) * scale, 11); g.fill();
    }
    if (hp <= 0 || this.manualPause) {
      box({ left: 0, top: 0, right: this.viewport.width, bottom: this.viewport.height }, '#071721A8', 0);
      const touch = 48 * screen.devicePixelRatio / view.getScaleX();
      const { panel, retry } = hp <= 0 ? battleResultLayout(safe, touch) : battlePauseLayout(safe, touch);
      box(panel, '#173543F5', 26); box(retry, '#376775', 18);
      if (hp > 0) {
        box(this.soundRect, '#224958'); box(this.resetRect, '#224958');
        if (this.canFullscreen) box(this.fullscreenRect, '#224958');
      }
    }
  }

  private drawAim(): void {
    const g = this.aim;
    g.clear();
    if (this.viewport.portrait || this.manualPause || this.hidden || (this.arcade && this.combatStates.get('PlayerRagdoll')!.hp <= 0)) { this.playerBow.hide(); return; }
    const arrow = this.config.arrows.find(value => value.id === this.router.selectedArrow.id)!;
    const socket = { ...this.playerAim.bowSocket(), angleRad: this.router.aimRad };
    const drawing = this.router.aimId !== null;
    const hand = this.playerAim.handsSnapshot.stringGrip;
    const pose = this.playerAim.poseSnapshot;
    const followingHand = drawing || (!pose.bowReleasing && pose.drawAmount > 0.001);
    const flex = followingHand ? handDrawFlex(socket, hand, this.config.bowControl.braceDepthM,
      this.config.bowControl.drawTravelM, pose.drawAmount) : pose.bowFlex;
    if (!this.playerBow.draw(socket, this.config.bowControl, arrow.id, flex, followingHand ? hand : undefined, drawing)) {
      drawWeaponBow(g, socket, this.config.bowControl, arrow.id, flex, followingHand ? hand : undefined, drawing ? TIP_OFFSET_M : undefined);
    }
    const readyTip = drawing ? nockedArrowTip(hand, socket.angleRad, thunderArrowLength(arrow.id)) : undefined;
    const clear = this.projectiles.muzzleClear('PlayerRagdoll', socket, readyTip);
    g.fillColor = color(!clear ? '#FF645E' : !this.playerAim.handsSnapshot.ready ? '#F0A84B' : arrowTints[arrow.id]);
    g.circle(Physics.units(socket.x), Physics.units(socket.y), Physics.units(0.08));
    if (clear && this.router.aimId !== null) {
      const launchArrow = applyDrawStrength(arrow, this.router.drawProgress, this.config.bowControl.minPowerRatio);
      for (const point of aimHintPoints(readyTip ?? socket, socket.angleRad, launchArrow.speedMps,
        this.config.physics.gravityMps2, this.config.physics.fixedTimeStepSec, readyTip ? 0 : TIP_OFFSET_M)) {
        g.circle(Physics.units(point.x), Physics.units(point.y), Physics.units(0.035));
      }
    }
    g.fill();
  }

  private drawImpactFeedback(): void {
    const g = this.impactArt; g.clear();
    if (this.viewport.portrait || this.hidden) return;
    for (const mark of this.impactFeedback.items) {
      const { radius, opacity } = this.impactFeedback.sample(mark);
      drawImpactMark(g, mark.point, mark.directionRad, radius, opacity, mark.tier);
    }
  }

  private playSound(kind: 'shot' | 'hit' | 'drop' | 'hit-heavy' | 'hit-critical'): void {
    if (!this.arcadeMode || !this.records.snapshot.soundEnabled || this.hidden || this.manualPause) return;
    const clip = this.audioClips.get(kind) ?? (kind.startsWith('hit-') ? this.audioClips.get('hit') : undefined), step = this.physics?.steps ?? 0;
    if (!clip || step - (this.lastSoundSteps.get(kind) ?? -100) < 3) return;
    this.lastSoundSteps.set(kind, step);
    this.soundSource.stop(); this.soundSource.clip = clip; this.soundSource.volume = kind === 'shot' ? 0.25 : 0.4;
    this.soundSource.play();
  }

  private drawBackdrop(world: Node): void {
    const g = child(world, 'RuinsBackdrop').addComponent(Graphics);
    // Low-contrast original silhouettes leave limbs, arrows and the fall space readable.
    fill(g, Physics.units(-40), Physics.units(-30), Physics.units(100), Physics.units(70), '#142A38');
    // Broad atmospheric bands and distant broken ridges keep the middle flight corridor quiet.
    for (let i = 0; i < 36; i++) {
      const glow = Math.max(0, 1 - Math.abs(-8 + (i + 0.5) * 0.6 - 3) / 8);
      const hex = [20 + 3 * glow, 42 + 7 * glow, 56 + 8 * glow].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      fill(g, Physics.units(-40), Physics.units(-8 + i * 0.6), Physics.units(100), Physics.units(0.6), `#${hex}`);
    }
    for (const [baseline, tint, offset] of [[-1.8, '#1B3946', 0], [-3, '#234651', 2.3]] as const) {
      g.fillColor = color(tint); g.moveTo(Physics.units(-40), Physics.units(-30));
      for (let i = 0; i <= 40; i++) {
        const x = -40 + i * 2.5, y = baseline + Math.sin(i * 1.7 + offset) * 0.8;
        g.lineTo(Physics.units(x), Physics.units(y));
      }
      g.lineTo(Physics.units(60), Physics.units(-30)); g.close(); g.fill();
    }
    g.fillColor = color('#54758275');
    for (let i = 0; i < 34; i++) {
      g.circle(Physics.units(-6 + (i * 7.3) % 38), Physics.units(1 + (i * 3.7) % 10), Physics.units(i % 3 ? 0.012 : 0.025));
    }
    g.fill();
    this.ruinsArt.attachBackdrop(g.node);
  }

  private buildPlatforms(world: Node, platformGroup: number): void {
    const platforms = [
      { id: 'player_main', x: 3.5, surfaceY: 3, width: 5 },
      { id: 'enemy_low', x: 18, surfaceY: 3, width: 3 },
      { id: 'enemy_high', x: 20, surfaceY: 6, width: 3 },
    ];
    for (const platform of platforms.filter(p => !this.arcadeMode || p.id === 'player_main')) {
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
      if (this.arcadeMode) { graphics.clear(); drawRuinsPlatform(graphics, platform.width, true); }
      if (this.arcadeMode) this.ruinsArt.attachPlatform(node, platform.width);
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
    for (const [x, y, w] of (this.arcadeMode ? [[3.5, 3, 5]] : [[3.5, 3, 5], [18, 3, 3], [20, 6, 3]])) {
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
