import { BoxCollider2D, CircleCollider2D, Color, ERigidBody2DType, Graphics, Node, RigidBody2D, Sprite, UIOpacity } from 'cc';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { ArcadeCycle, BowState, PlatformPressure, canRelease, chooseArcadeSpawn, platformAngularVelocity } from '../domain/ArcadeRules';
import { AttackSlots, EnemyAttack, ballisticAngles, predictAim } from '../domain/BattleRules';
import { PickupRules } from '../domain/PickupRules';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import { RagdollFactory, type RagdollInstance } from '../physics/RagdollFactory';
import { AimController } from '../physics/AimController';
import { PoseController } from '../physics/PoseController';
import { CharacterSkin } from '../presentation/CharacterSkin';
import type { ActorCombatState } from './HitResolver';
import { ProjectileSystem, TIP_OFFSET_M } from './ProjectileSystem';
import { drawWeaponBow, WEAPON_STYLES } from '../presentation/WeaponVisual';
import { nockedArrowTip } from '../domain/weaponGeometry';
import { drawChargeCue, drawRuinsPlatform } from '../presentation/BattleArt';
import type { RuinsArtAssets } from '../presentation/RuinsArtAssets';
import { highlightOpacity, retirementOpacity } from '../domain/ProjectilePresentation';
import { RunProgression, RUN_RULES, type Encounter, type PerkId } from '../domain/RunProgression';
import { BattleLoadout } from '../domain/BattleLoadout';
import { RunChallenges, biomeForStage } from '../domain/Expedition';

type Enemy = { actor: RagdollInstance; aim: AimController; skin: CharacterSkin; platform: Node;
  attack: EnemyAttack; attackArrowId: string; encounter: Encounter; spec: PhysicsLabConfig['enemies'][number]; hpMax: number; bow: BowState; pressure: PlatformPressure; heavy: boolean; rocking: boolean; bornAt: number; deadAt: number | null; telegraph: boolean };
/** Owns only the endless battle loop; called from the existing single fixed step. */
export class ArcadeBattle {
  public ready: Promise<void> = Promise.resolve();
  public readonly loadout = new BattleLoadout();
  public readonly challenges = new RunChallenges();
  public readonly progression = new RunProgression(Math.random, () => this.loadout.canUpgrade);
  public get rewardReady(): boolean { return this.progression.pending && !this.current && this.projectiles.count === 0; }
  public chooseReward(id: PerkId): boolean {
    if (this.states.get(this.player.id)!.hp <= 0 || !this.rewardReady || !this.progression.choose(id)) return false;
    if (id === 'forge') this.loadout.upgrade();
    this.onPickup({ hp: this.progression.afterBoss || id === 'recover' ? RUN_RULES.recoverHp : RUN_RULES.upgradeHp, stamina: this.cfg.player.stamina });
    return true;
  }
  private readonly cycle: ArcadeCycle;
  private pickupRules: PickupRules;
  private readonly pickupNodes = new Map<number, Node>();
  private get elapsed() { return this.cycle.elapsed; }
  private serial = 0;
  private nextSpawn = Infinity;
  private readonly enemies: Enemy[] = [];
  private readonly injuries = new Map<string, Map<string, number>>();
  private readonly drops: { node: Node; until: number }[] = [];
  private readonly graphics: Graphics;
  public get score() { return this.cycle.score; }
  public enemyShots = 0;
  public rejectedShots = 0;
  private spawnRetryAt = 0;
  private initialSpawnPending = true;
  private collapseRequested = false;
  private defeatText = '';
  private defeatAt = -Infinity;
  public get current() { return this.enemies.find(e => e.deadAt === null); }
  public get defeatBanner(): string { return this.elapsed - this.defeatAt < 1.2 ? this.defeatText : ''; }
  public get enemyStatus() {
    const enemy = this.current;
    return enemy ? { armed: enemy.bow.armed, downed: enemy.aim.poseSnapshot.pose === 'downed',
      collapseSec: enemy.pressure.remainingSec, collapsing: enemy.pressure.collapsed } : null;
  }
  public get snapshot() { return { score: this.score, enemyShots: this.enemyShots, enemyId: this.current?.actor.id ?? null,
    stage: this.progression.stage, progress: this.progression.progress, offers: this.progression.offers, upgrades: this.progression.upgrades, loadout: this.loadout.snapshot,
    biome: biomeForStage(this.progression.stage).id, challenges: this.challenges.snapshot,
    rewardReady: this.rewardReady, encounter: this.current?.encounter.kind ?? null, boss: this.bossStatus, enemyStatus: this.enemyStatus, defeatBanner: this.defeatBanner,
    pickups: this.pickupRules.snapshot, armed: this.current?.bow.armed ?? false, heavy: this.current?.heavy ?? false, rocking: this.current?.rocking ?? false,
    rejectedShots: this.rejectedShots, telegraph: this.current?.telegraph ?? false, bodiesRetained: this.enemies.length, platformCount: this.enemies.length, dropCount: this.drops.length, nextSpawnSec: Number.isFinite(this.nextSpawn) ? Math.max(0, this.nextSpawn - this.elapsed) : null }; }
  public constructor(private readonly world: Node, private readonly cfg: PhysicsLabConfig,
    private readonly factory: RagdollFactory, private readonly actors: RagdollInstance[],
    private readonly states: Map<string, ActorCombatState>, private readonly projectiles: ProjectileSystem,
    private readonly onSpawn: (aim: AimController | null) => void,
    private readonly onSound: (kind: 'shot' | 'drop') => void = () => {},
    private readonly onPickup: (effect: { hp: number; stamina: number; item?: 'potion' | 'rune' }) => void = () => {},
    private readonly ruinsArt?: RuinsArtAssets, private readonly strictResources = false) {
    this.cycle = new ArcadeCycle(cfg.arcade.respawnSec);
    this.pickupRules = new PickupRules(cfg.pickups, Math.random, true);
    const overlay = new Node('BattleFeedback'); overlay.layer = world.layer; overlay.parent = world;
    this.graphics = overlay.addComponent(Graphics);
    this.spawn();
    if (strictResources && !this.current) throw new Error('首场敌人生成失败，请重试');
  }
  private get player() { return this.actors[0]!; }
  public get bossStatus() {
    const enemy = this.current;
    if (enemy?.encounter.kind !== 'boss') return null;
    const hp = this.states.get(enemy.actor.id)!.hp;
    return { name: enemy.encounter.name, hp, hpMax: enemy.hpMax, phase: hp <= enemy.hpMax / 2 ? 2 : 1 };
  }
  public allowsInstantHeadshot(id: string): boolean { return !this.enemies.some(e => e.actor.id === id && e.encounter.kind === 'boss'); }
  public beforeStep(dt: number): void {
    this.cycle.step(dt);
    this.challenges.step(dt);
    this.loadout.step(dt, this.states.get(this.player.id)!.hp > 0);
    this.stepPickups(dt);
    const enemy = this.current;
    if (!enemy) return;
    if (enemy.rocking) {
      const body = enemy.platform.getComponent(RigidBody2D)!;
      body.angularVelocity = platformAngularVelocity(this.elapsed - enemy.bornAt,
        P.radians(this.cfg.arcade.platformTiltDeg), this.cfg.arcade.platformPeriodSec, 0);
    }
    const state = this.states.get(enemy.actor.id)!;
    const player = this.states.get(this.player.id)!;
    if (enemy.pressure.step(dt, { active: player.hp > 0, alive: state.hp > 0, armed: enemy.bow.armed,
      downed: enemy.aim.poseSnapshot.pose === 'downed', boss: enemy.encounter.kind === 'boss' })) this.collapseRequested = true;
    const spec = enemy.spec;
    const events = enemy.attack.step(dt, { active: player.hp > 0, alive: state.hp > 0, armed: enemy.bow.armed, hpRatio: state.hp / enemy.hpMax }, () => {
      const socket = enemy.aim.bowSocket(), target = this.player.worldPointM('chest', [0, 0]);
      const velocity = this.player.bodies.get('chest')!.linearVelocity;
      return predictAim({ x: target.x - socket.x, y: target.y - socket.y }, velocity,
        spec.speedMps, Math.abs(this.cfg.physics.gravityMps2[1]), spec.telegraphSec);
    });
    for (const event of events) if (event.aimRad !== null) enemy.aim.setWorldAim(event.aimRad);
    const release = events.find(e => e.kind === 'release');
    if (events.some(e => e.kind === 'telegraph')) {
      enemy.telegraph = true;
      enemy.attackArrowId = enemy.encounter.kind === 'boss' && state.hp > enemy.hpMax / 2 ? 'impact' : 'normal';
    }
    // Keep the drawing pose through the release sample; only then let the bow hand relax.
    enemy.aim.setDraw(enemy.telegraph && enemy.bow.armed, enemy.telegraph ? 1 : 0);
    enemy.aim.step(dt);
    if (release) {
      const socket = enemy.aim.bowSocket();
      const launchTip = nockedArrowTip(enemy.aim.handsSnapshot.stringGrip, socket.angleRad, WEAPON_STYLES[enemy.attackArrowId === 'impact' ? 'impact' : 'normal'].arrowLength);
      if (canRelease({ alive: player.hp > 0 && state.hp > 0, armed: enemy.bow.armed,
        handsReady: enemy.aim.handsSnapshot.ready,
        muzzleClear: this.projectiles.launchBlockReason(enemy.actor.id, socket, launchTip) === null })) {
        const seed = this.cfg.arrows.find(a => a.id === enemy.attackArrowId)!;
        const shot = this.projectiles.fire(enemy.actor.id, socket,
          { ...seed, baseDamage: spec.arrowBaseDamage, speedMps: spec.speedMps }, launchTip);
        if (shot !== null) { this.enemyShots += 1; enemy.aim.releaseBow(); this.onSound('shot'); }
      } else this.rejectedShots++;
      enemy.telegraph = false;
      enemy.aim.setDraw(false, 0);
    }
    if (!enemy.bow.armed || player.hp <= 0) { enemy.telegraph = false; enemy.aim.setDraw(false, 0); }
  }

  public afterStep(): void {
    const player = this.states.get(this.player.id)!;
    if (P.positionM(this.player.bodies.get('pelvis')!.node).y < this.cfg.run.fallKillY_M) player.hp = 0;
    for (const enemy of [...this.enemies]) {
      const state = this.states.get(enemy.actor.id)!;
      if (enemy.deadAt === null && P.positionM(enemy.actor.bodies.get('pelvis')!.node).y < this.cfg.run.fallKillY_M) state.hp = 0;
      if (state.hp <= 0 && enemy.deadAt === null) this.kill(enemy);
      else if (enemy.deadAt === null && enemy === this.current && this.collapseRequested) this.releasePlatform(enemy);
      if (enemy.deadAt !== null) {
        const age = this.elapsed - enemy.deadAt, opacity = retirementOpacity(age, this.cfg.arcade.cleanupSec);
        this.fade(enemy.actor.root, opacity); this.fade(enemy.platform, opacity);
        if (age >= this.cfg.arcade.cleanupSec) this.remove(enemy);
      }
    }
    this.collapseRequested = false;
    const corpses = this.enemies.filter(e => e.deadAt !== null);
    while (corpses.length > this.cfg.limits.maxCorpses) this.remove(corpses.shift()!);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i]!;
      this.fade(drop.node, retirementOpacity(this.cfg.arcade.cleanupSec - (drop.until - this.elapsed), this.cfg.arcade.cleanupSec));
      if (drop.until <= this.elapsed) { P.retire(drop.node); this.drops.splice(i, 1); }
    }
    for (const [id, parts] of this.injuries) {
      for (const [part, expires] of parts) if (expires <= this.elapsed) parts.delete(part);
      if (!parts.size) this.injuries.delete(id);
    }
    if (player.hp > 0 && !this.current && !this.progression.pending && this.elapsed >= this.spawnRetryAt &&
      (this.initialSpawnPending || this.cycle.canSpawn(true))) this.spawn();
  }
  public hit(state: ActorCombatState, part: string): void {
    if (state.id === this.player.id && state.lastHit && state.lastHit.result.hpDamage > 0) this.challenges.damaged();
    let marked = this.injuries.get(state.id);
    if (!marked) { marked = new Map(); this.injuries.set(state.id, marked); }
    marked.set(part, this.elapsed + 0.18);
    const enemy = this.enemies.find(e => e.actor.id === state.id);
    const hit = state.lastHit;
    if (enemy && state.hp > 0 && hit && enemy.bow.hit(hit.shotId, part, hit.result.zoneDamage)) this.dropBow(enemy);
  }
  public reset(): void {
    for (const enemy of [...this.enemies]) this.remove(enemy);
    for (const drop of this.drops) P.retire(drop.node); this.drops.length = 0;
    this.injuries.clear(); this.enemyShots = this.rejectedShots = 0;
    this.collapseRequested = false; this.defeatText = ''; this.defeatAt = -Infinity;
    this.cycle.reset(); this.spawnRetryAt = 0; this.initialSpawnPending = true;
    this.progression.reset();
    this.challenges.reset();
    this.loadout.reset();
    this.clearPickups(); this.pickupRules = new PickupRules(this.cfg.pickups, Math.random, true);
    for (const node of this.player.bodyNodes.values()) {
      const sprite = node.getChildByName(`Skin_${node.name}`)?.getComponent(Sprite);
      if (sprite) sprite.color = Color.WHITE;
    }
    this.spawn();
  }
  public dispose(): void {
    this.injuries.clear();
    this.clearPickups();
    for (const enemy of [...this.enemies]) this.remove(enemy);
    for (const drop of this.drops) P.retire(drop.node); this.drops.length = 0;
    this.graphics.node.destroy();
  }
  private clearPickups(): void {
    this.pickupRules.clear();
    for (const node of this.pickupNodes.values()) { this.projectiles.unregisterPickup(node); P.retire(node); }
    this.pickupNodes.clear();
  }
  private stepPickups(dt: number): void {
    if (this.states.get(this.player.id)!.hp <= 0) { this.clearPickups(); return; }
    const pickup = this.pickupRules.step(dt, true, () => this.pickupPoint());
    const retained = new Set(this.pickupRules.snapshot.map(p => p.id));
    for (const [id, node] of this.pickupNodes) if (!retained.has(id)) {
      this.projectiles.unregisterPickup(node); P.retire(node); this.pickupNodes.delete(id);
    }
    if (!pickup) return;
    const node = new Node(`Pickup_${pickup.id}`); node.layer = this.world.layer; node.parent = this.world;
    P.place(node, pickup.x, pickup.y);
    const body = node.addComponent(RigidBody2D); body.type = ERigidBody2DType.Static; body.group = this.cfg.rig.collisionGroups.platform;
    const collider = node.addComponent(CircleCollider2D); collider.group = body.group; collider.radius = P.units(0.16); collider.sensor = true; collider.apply();
    const g = node.addComponent(Graphics); g.fillColor = new Color().fromHEX(pickup.kind === 'red' ? '#F27979' : pickup.kind === 'gold' ? '#F5CF78' : '#7AD49D');
    g.circle(0, 0, P.units(0.16)); g.fill(); g.fillColor = new Color(196, 230, 177, 255);
    g.ellipse(P.units(0.04), P.units(0.18), P.units(0.08), P.units(0.04)); g.fill();
    this.pickupNodes.set(pickup.id, node);
    this.projectiles.registerPickup(node, () => {
      if (this.states.get(this.player.id)!.hp <= 0) return;
      const effect = this.pickupRules.collect(pickup.id, 'player');
      if (effect) this.onPickup(effect);
      this.projectiles.unregisterPickup(node); P.retire(node); this.pickupNodes.delete(pickup.id);
    });
  }
  private pickupPoint(): { x: number; y: number } | null {
    const socket = this.player.worldPointM('rightForearm', [0.12, -0.07]), speed = this.cfg.arrows[0]!.speedMps;
    const gravity = Math.abs(this.cfg.physics.gravityMps2[1]);
    for (let i = 0; i < 12; i++) {
      const point = { x: 6.5 + Math.random() * 6.5, y: 4 + Math.random() * 3 };
      if (P.testPointM(point).length) continue;
      const angle = ballisticAngles(point.x - socket.x, point.y - socket.y, speed, gravity)
        .find(a => a >= P.radians(this.cfg.input.minAimDeg) && a <= P.radians(this.cfg.input.maxAimDeg));
      if (angle === undefined) continue;
      const duration = (point.x - socket.x) / (speed * Math.cos(angle));
      let previous = { x: socket.x + Math.cos(angle) * 0.31, y: socket.y + Math.sin(angle) * 0.31 };
      let blocked = false;
      for (let k = 1; k <= 24; k++) {
        const t = duration * k / 24;
        const next = { x: socket.x + speed * Math.cos(angle) * t, y: socket.y + speed * Math.sin(angle) * t - gravity * t * t / 2 };
        if (P.raycastM(previous, next, this.cfg.rig.collisionGroups.platform | this.cfg.rig.collisionGroups.ragdoll).length) { blocked = true; break; }
        previous = next;
      }
      if (!blocked) return point;
    }
    return null;
  }
  private spawn(): void {
    let candidate: ReturnType<typeof chooseArcadeSpawn> | null = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const c = chooseArcadeSpawn(this.cfg, Math.random);
      // Inspect the spawn volume with the native world's queries, not only ballistic reachability.
      let occupied = false;
      for (let px = c.x - c.width / 2 - 0.1; px <= c.x + c.width / 2 + 0.1; px += 0.2) {
        if (P.raycastM({ x: px, y: c.y - 0.7 }, { x: px, y: c.y + 2.6 },
          this.cfg.rig.collisionGroups.platform | this.cfg.rig.collisionGroups.ragdoll).length ||
          P.testPointM({ x: px, y: c.y - 0.7 }).length) { occupied = true; break; }
      }
      if (!occupied) { candidate = c; break; }
    }
    if (!candidate) { this.spawnRetryAt = this.elapsed + 0.25; return; }
    const { x, y, width } = candidate;
    const encounter = this.progression.encounter(this.cfg);
    const heavy = encounter.massMultiplier > 1;
    const rocking = encounter.rocking;
    const platform = new Node(`EnemyPlatform_${++this.serial}`); platform.layer = this.world.layer; platform.parent = this.world;
    P.place(platform, x, y - 0.3);
    const body = platform.addComponent(RigidBody2D); body.type = rocking ? ERigidBody2DType.Kinematic : ERigidBody2DType.Static; body.group = this.cfg.rig.collisionGroups.platform;
    const collider = platform.addComponent(BoxCollider2D); collider.group = body.group;
    collider.size.set(P.units(width), P.units(0.6)); collider.friction = 0.9; collider.apply();
    drawRuinsPlatform(platform.addComponent(Graphics), width);
    const platformReady = this.ruinsArt?.attachPlatform(platform, width) ?? Promise.resolve();
    const actor = this.factory.spawn(this.world, `Enemy_${this.serial}`, [x, y + 0.41], encounter.tint, encounter.massMultiplier, -1);
    const aim = new AimController(actor, new PoseController(actor, actor.definition, this.cfg.bowControl)); aim.setWorldAim(Math.PI - 0.2);
    const skin = new CharacterSkin(actor, actor.definition);
    const strict = this.strictResources && this.initialSpawnPending;
    const skinReady = skin.load('enemy', 'ruins', strict).then(() => {
      if (!this.enemies.some(e => e.actor === actor)) return;
      for (const node of actor.bodyNodes.values()) {
        const sprite = node.getChildByName(`Skin_${node.name}`)?.getComponent(Sprite);
        if (sprite) sprite.color = new Color().fromHEX(encounter.tint);
      }
    }).catch(e => { if (strict) throw e; console.warn('[Arcade skin]', e); });
    this.ready = Promise.all([platformReady, skinReady]).then(() => {});
    const spec = encounter.spec;
    const hpMax = spec.hp;
    this.states.set(actor.id, { id: actor.id, hp: hpMax, armor: 0, hits: 0, lastHit: null });
    this.actors.push(actor); this.projectiles.registerActor(actor);
    this.enemies.push({ actor, aim, skin, platform, hpMax, heavy, rocking, encounter, bornAt: this.elapsed,
      bow: new BowState(this.cfg.reaction.enemyArmTraumaToDisarm * (encounter.kind === 'boss' ? 3 : 1)), pressure: new PlatformPressure(), deadAt: null, telegraph: false, attackArrowId: 'normal',
      spec, attack: new EnemyAttack(spec, this.cfg.run, new AttackSlots(this.cfg.run.enemyAttackStartSeparationSec), Math.random) });
    this.nextSpawn = Infinity; this.initialSpawnPending = false; this.cycle.spawned(); this.onSpawn(aim);
  }
  private kill(enemy: Enemy): void {
    enemy.deadAt = this.elapsed; enemy.telegraph = false; enemy.aim.setAlive(false);
    this.releasePlatform(enemy);
    if (enemy.bow.drop()) this.dropBow(enemy);
    const generation = Number(enemy.actor.id.slice('Enemy_'.length));
    if (this.cycle.defeated(generation)) {
      const hit = this.states.get(enemy.actor.id)!.lastHit;
      this.defeatText = enemy.encounter.kind === 'boss' ? '首领击败 · 获得战利品' :
        P.positionM(enemy.actor.bodies.get('pelvis')!.node).y < this.cfg.run.fallKillY_M ? '坠落击败' :
          hit?.attackerId === this.player.id && hit.partId === 'head' ? '爆头击败' : '击败';
      this.defeatAt = this.elapsed;
      const reward = this.challenges.defeated(hit?.attackerId === this.player.id && hit.partId === 'head',
        enemy.encounter.kind === 'boss', this.states.get(this.player.id)!.hp > 0);
      if (reward === 'forge') {
        if (!this.loadout.upgrade()) { this.loadout.charge(100); this.challenges.describeReward('弓已满级 · 技能蓄满'); }
      } else if (reward && !this.loadout.addItem(reward)) {
        if (reward === 'potion') { this.onPickup({ hp: 15, stamina: 0 }); this.challenges.describeReward('药瓶已满 · 回复15生命'); }
        else { this.loadout.charge(25); this.challenges.describeReward('符石已满 · 蓄能 +25'); }
      }
      if (enemy.encounter.kind === 'boss') { this.loadout.upgrade(); this.loadout.addItem('rune'); this.loadout.charge(100); }
      this.progression.defeated(); this.loadout.charge(15);
    }
    this.nextSpawn = this.elapsed + this.cfg.arcade.respawnSec;
  }
  private releasePlatform(enemy: Enemy): void {
    const body = enemy.platform.getComponent(RigidBody2D)!;
    if (body.type === ERigidBody2DType.Dynamic) return;
    enemy.rocking = false;
    body.type = ERigidBody2DType.Dynamic;
    P.setVelocity(body, (Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 1.5); body.wakeUp();
  }
  private dropBow(enemy: Enemy): void {
    enemy.telegraph = false; enemy.aim.setDraw(false, 0); enemy.aim.setArmed(false);
    // Cancel the attack state immediately in the same after-step as disarm/death.
    enemy.attack.step(0, { active: false, alive: enemy.deadAt === null, armed: false, hpRatio: 0 }, () => null);
    this.onSound('drop');
    // A detached bow carries the real hand's position and velocity; no live limb is teleported.
    const socket = enemy.aim.bowSocket(), node = new Node('DroppedBow'); node.layer = this.world.layer; node.parent = this.world;
    P.place(node, socket.x, socket.y);
    node.setRotationFromEuler(0, 0, P.degrees(socket.angleRad));
    const bow = node.addComponent(RigidBody2D); bow.type = ERigidBody2DType.Dynamic; bow.group = this.cfg.rig.collisionGroups.ragdoll;
    const collider = node.addComponent(BoxCollider2D); collider.group = bow.group;
    collider.size.set(P.units(0.3), P.units(this.cfg.bowControl.bowHalfHeightM * 2)); collider.apply();
    drawWeaponBow(node.addComponent(Graphics), { x: 0, y: 0, angleRad: 0 }, this.cfg.bowControl, 'normal', 0);
    const v = enemy.actor.bodies.get('rightForearm')!.linearVelocity; P.setVelocity(bow, v.x, v.y, 2);
    while (this.drops.length >= this.cfg.limits.maxPhysicalEquipmentDrops) P.retire(this.drops.shift()!.node);
    this.drops.push({ node, until: this.elapsed + this.cfg.arcade.cleanupSec });

  }
  private remove(enemy: Enemy): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    this.projectiles.unregisterActor(enemy.actor); enemy.skin.dispose(); this.factory.remove(enemy.actor); P.retire(enemy.platform);
    this.states.delete(enemy.actor.id); this.injuries.delete(enemy.actor.id);
    const i = this.actors.indexOf(enemy.actor); if (i >= 0) this.actors.splice(i, 1);
    if (!this.current) this.onSpawn(null);
  }
  public draw(): void {
    const g = this.graphics; g.clear();
    for (const enemy of this.enemies) enemy.skin.draw();
    const threatened = this.current;
    if (threatened?.pressure.remainingSec !== null && threatened?.pressure.remainingSec !== undefined) {
      const center = P.positionM(threatened.platform);
      g.strokeColor = new Color(255, 196, 105, Math.round(170 + 65 * Math.sin(this.elapsed * 14)));
      g.lineWidth = P.units(0.045);
      g.moveTo(P.units(center.x - 0.55), P.units(center.y - 0.12));
      g.lineTo(P.units(center.x - 0.16), P.units(center.y + 0.14));
      g.lineTo(P.units(center.x + 0.08), P.units(center.y - 0.2));
      g.lineTo(P.units(center.x + 0.45), P.units(center.y + 0.12)); g.stroke();
    }
    for (const actor of this.actors) {
      const state = this.states.get(actor.id); if (!state) continue;
      for (const [part, expires] of this.injuries.get(actor.id) ?? []) {
        const opacity = highlightOpacity(expires, this.elapsed);
        if (opacity <= 0) continue;
        g.strokeColor = new Color(255, 197, 104, Math.round(210 * opacity)); g.lineWidth = P.units(0.025);
        for (const joint of actor.definition.jointDefinitions.filter(j => j.childId === part || j.parentId === part)) {
          if (!actor.joints.has(joint.id)) continue;
          const p = actor.worldPointM(joint.parentId, joint.parentAnchorM);
          g.circle(P.units(p.x), P.units(p.y), P.units(0.10)); g.stroke();
        }
      }
      if (state.hp <= 0) continue;
      const head = actor.worldPointM('head', [0, 0]), enemy = this.enemies.find(e => e.actor === actor);
      const max = enemy?.hpMax ?? this.cfg.player.hp;
      g.fillColor = new Color(38, 32, 43, 255); g.rect(P.units(head.x - 0.36), P.units(head.y + 0.37), P.units(0.72), P.units(0.08)); g.fill();
      g.fillColor = new Color(240, 74, 90, 255); g.rect(P.units(head.x - 0.35), P.units(head.y + 0.38), P.units(0.7 * Math.max(0, state.hp / max)), P.units(0.06)); g.fill();
      if (enemy?.encounter.kind === 'elite' || enemy?.encounter.kind === 'boss') {
        g.strokeColor = new Color().fromHEX(enemy.encounter.tint); g.lineWidth = P.units(0.04);
        g.moveTo(P.units(head.x - 0.2), P.units(head.y + 0.63));
        g.lineTo(P.units(head.x - 0.2), P.units(head.y + 0.51));
        g.lineTo(P.units(head.x + 0.2), P.units(head.y + 0.51));
        g.lineTo(P.units(head.x + 0.2), P.units(head.y + 0.63));
        g.moveTo(P.units(head.x), P.units(head.y + 0.51));
        g.lineTo(P.units(head.x), P.units(head.y + 0.69)); g.stroke();
      }
      if (!enemy || !enemy.bow.armed) continue;
      if (enemy.telegraph) drawChargeCue(g, head);
      drawWeaponBow(g, enemy.aim.bowSocket(), this.cfg.bowControl, enemy.attackArrowId === 'impact' ? 'impact' : 'normal', enemy.aim.poseSnapshot.bowFlex,
        enemy.telegraph ? enemy.aim.handsSnapshot.stringGrip : undefined, enemy.telegraph ? TIP_OFFSET_M : undefined);
    }
  }

  private fade(node: Node, opacity: number): void {
    if (opacity >= 1) return;
    const visual = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    visual.opacity = Math.round(255 * opacity);
  }
}
