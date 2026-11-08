import { BoxCollider2D, CircleCollider2D, Color, ERigidBody2DType, Graphics, Node, RigidBody2D, Sprite } from 'cc';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { ArcadeCycle, BowState, canRelease, chooseArcadeSpawn, platformAngularVelocity } from '../domain/ArcadeRules';
import { AttackSlots, EnemyAttack, ballisticAngles, predictAim } from '../domain/BattleRules';
import { PickupRules } from '../domain/PickupRules';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import { RagdollFactory, type RagdollInstance } from '../physics/RagdollFactory';
import { AimController } from '../physics/AimController';
import { PoseController } from '../physics/PoseController';
import { CharacterSkin } from '../presentation/CharacterSkin';
import type { RigBodyId } from '../physics/RigDefinition';
import type { ActorCombatState } from './HitResolver';
import { ProjectileSystem } from './ProjectileSystem';

type Enemy = { actor: RagdollInstance; aim: AimController; skin: CharacterSkin; platform: Node;
  attack: EnemyAttack; spec: PhysicsLabConfig['enemies'][number]; hpMax: number; bow: BowState; heavy: boolean; rocking: boolean; bornAt: number; deadAt: number | null; telegraph: boolean };
/** Owns only the endless battle loop; called from the existing single fixed step. */
export class ArcadeBattle {
  private readonly cycle: ArcadeCycle;
  private pickupRules: PickupRules;
  private readonly pickupNodes = new Map<number, Node>();
  private get elapsed() { return this.cycle.elapsed; }
  private serial = 0;
  private nextSpawn = Infinity;
  private readonly enemies: Enemy[] = [];
  private readonly fatalHeads = new Set<string>();
  private readonly injuries = new Map<string, Set<string>>();
  private readonly drops: { node: Node; until: number }[] = [];
  private readonly graphics: Graphics;
  public get score() { return this.cycle.score; }
  public enemyShots = 0;
  public rejectedShots = 0;
  private spawnRetryAt = 0;
  private initialSpawnPending = true;
  public get current() { return this.enemies.find(e => e.deadAt === null); }
  public get snapshot() { return { score: this.score, enemyShots: this.enemyShots, enemyId: this.current?.actor.id ?? null,
    pickups: this.pickupRules.snapshot, armed: this.current?.bow.armed ?? false, heavy: this.current?.heavy ?? false, rocking: this.current?.rocking ?? false,
    rejectedShots: this.rejectedShots, telegraph: this.current?.telegraph ?? false, bodiesRetained: this.enemies.length, platformCount: this.enemies.length, dropCount: this.drops.length, nextSpawnSec: Number.isFinite(this.nextSpawn) ? Math.max(0, this.nextSpawn - this.elapsed) : null }; }
  public constructor(private readonly world: Node, private readonly cfg: PhysicsLabConfig,
    private readonly factory: RagdollFactory, private readonly actors: RagdollInstance[],
    private readonly states: Map<string, ActorCombatState>, private readonly projectiles: ProjectileSystem,
    private readonly onSpawn: (aim: AimController | null) => void,
    private readonly onSound: (kind: 'shot' | 'drop') => void = () => {},
    private readonly onPickup: (effect: { hp: number; stamina: number }) => void = () => {}) {
    this.cycle = new ArcadeCycle(cfg.arcade.respawnSec);
    this.pickupRules = new PickupRules(cfg.pickups, Math.random);
    const overlay = new Node('BattleFeedback'); overlay.layer = world.layer; overlay.parent = world;
    this.graphics = overlay.addComponent(Graphics);
    this.spawn();
  }
  private get player() { return this.actors[0]!; }
  public beforeStep(dt: number): void {
    this.cycle.step(dt);
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
    const spec = enemy.spec;
    const events = enemy.attack.step(dt, { active: player.hp > 0, alive: state.hp > 0, armed: enemy.bow.armed, hpRatio: state.hp / enemy.hpMax }, () => {
      const socket = enemy.aim.bowSocket(), target = this.player.worldPointM('chest', [0, 0]);
      const velocity = this.player.bodies.get('chest')!.linearVelocity;
      return predictAim({ x: target.x - socket.x, y: target.y - socket.y }, velocity,
        spec.speedMps, Math.abs(this.cfg.physics.gravityMps2[1]), spec.telegraphSec);
    });
    for (const event of events) if (event.aimRad !== null) enemy.aim.setWorldAim(event.aimRad);
    const release = events.find(e => e.kind === 'release');
    if (events.some(e => e.kind === 'telegraph')) enemy.telegraph = true;
    // Keep the drawing pose through the release sample; only then let the bow hand relax.
    enemy.aim.setDraw(enemy.telegraph && enemy.bow.armed, enemy.telegraph ? 1 : 0);
    enemy.aim.step(dt);
    if (release) {
      const socket = enemy.aim.bowSocket();
      if (canRelease({ alive: player.hp > 0 && state.hp > 0, armed: enemy.bow.armed,
        handsReady: enemy.aim.handsSnapshot.ready,
        muzzleClear: this.projectiles.launchBlockReason(enemy.actor.id, socket) === null })) {
        const shot = this.projectiles.fire(enemy.actor.id, socket,
          { ...this.cfg.arrows[0]!, baseDamage: spec.arrowBaseDamage, speedMps: spec.speedMps });
        if (shot !== null) { this.enemyShots += 1; this.onSound('shot'); }
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
      if (enemy.deadAt !== null && this.elapsed - enemy.deadAt >= this.cfg.arcade.cleanupSec) this.remove(enemy);
    }
    const corpses = this.enemies.filter(e => e.deadAt !== null);
    while (corpses.length > this.cfg.limits.maxCorpses) this.remove(corpses.shift()!);
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i]!.until <= this.elapsed) {
      P.retire(this.drops[i]!.node); this.drops.splice(i, 1);
    }
    if (player.hp > 0 && !this.current && this.elapsed >= this.spawnRetryAt &&
      (this.initialSpawnPending || this.cycle.canSpawn(true))) this.spawn();
  }
  public hit(state: ActorCombatState, part: string): void {
    if (state.hp <= 0 && part === 'head') this.fatalHeads.add(state.id);
    let marked = this.injuries.get(state.id);
    if (!marked) { marked = new Set(); this.injuries.set(state.id, marked); }
    marked.add(part);
    const enemy = this.enemies.find(e => e.actor.id === state.id);
    const hit = state.lastHit;
    if (enemy && state.hp > 0 && hit && enemy.bow.hit(hit.shotId, part, hit.result.zoneDamage)) this.dropBow(enemy);

    const actor = this.actors.find(a => a.id === state.id);
    const skin = actor?.bodyNodes.get(part as RigBodyId)?.getChildByName(`Skin_${part}`)?.getComponent(Sprite);
    if (skin) skin.color = new Color(255, 95, 95, 255);
  }
  public reset(): void {
    for (const enemy of [...this.enemies]) this.remove(enemy);
    for (const drop of this.drops) P.retire(drop.node); this.drops.length = 0;
    this.injuries.clear(); this.fatalHeads.clear(); this.enemyShots = this.rejectedShots = 0;
    this.cycle.reset(); this.spawnRetryAt = 0; this.initialSpawnPending = true;
    this.clearPickups(); this.pickupRules = new PickupRules(this.cfg.pickups, Math.random);
    for (const node of this.player.bodyNodes.values()) {
      const sprite = node.getChildByName(`Skin_${node.name}`)?.getComponent(Sprite);
      if (sprite) sprite.color = Color.WHITE;
    }
    this.spawn();
  }
  public dispose(): void {
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
    const g = node.addComponent(Graphics); g.fillColor = new Color().fromHEX(pickup.kind === 'red' ? '#F27979' : '#7AD49D');
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
    const heavy = Math.random() < this.cfg.arcade.heavyChance;
    const rocking = Math.random() < this.cfg.arcade.rockingChance;
    const platform = new Node(`EnemyPlatform_${++this.serial}`); platform.layer = this.world.layer; platform.parent = this.world;
    P.place(platform, x, y - 0.3);
    const body = platform.addComponent(RigidBody2D); body.type = rocking ? ERigidBody2DType.Kinematic : ERigidBody2DType.Static; body.group = this.cfg.rig.collisionGroups.platform;
    const collider = platform.addComponent(BoxCollider2D); collider.group = body.group;
    collider.size.set(P.units(width), P.units(0.6)); collider.friction = 0.9; collider.apply();
    const g = platform.addComponent(Graphics); g.fillColor = new Color(76, 100, 112, 255);
    g.rect(-P.units(width / 2), -P.units(0.3), P.units(width), P.units(0.6)); g.fill();
    const actor = this.factory.spawn(this.world, `Enemy_${this.serial}`, [x, y + 0.41], heavy ? '#C99BDE' : '#E98575', heavy ? this.cfg.arcade.heavyMassMultiplier : 1, -1);
    const aim = new AimController(actor, new PoseController(actor, actor.definition, this.cfg.bowControl)); aim.setWorldAim(Math.PI - 0.2);
    const skin = new CharacterSkin(actor, actor.definition); void skin.load('enemy').then(() => {
      if (!this.enemies.some(e => e.actor === actor)) return;
      if (heavy) for (const node of actor.bodyNodes.values()) {
        const sprite = node.getChildByName(`Skin_${node.name}`)?.getComponent(Sprite);
        if (sprite) sprite.color = new Color(205, 175, 240, 255);
      }
    }).catch(e => console.warn('[Arcade skin]', e));
    const spec = this.cfg.enemies[heavy ? 1 : 0]!;
    const hpMax = spec.hp;
    this.states.set(actor.id, { id: actor.id, hp: hpMax, armor: 0, hits: 0, lastHit: null });
    this.actors.push(actor); this.projectiles.registerActor(actor);
    this.enemies.push({ actor, aim, skin, platform, hpMax, heavy, rocking, bornAt: this.elapsed,
      bow: new BowState(this.cfg.reaction.enemyArmTraumaToDisarm), deadAt: null, telegraph: false,
      spec, attack: new EnemyAttack(spec, this.cfg.run, new AttackSlots(this.cfg.run.enemyAttackStartSeparationSec), Math.random) });
    this.nextSpawn = Infinity; this.initialSpawnPending = false; this.cycle.spawned(); this.onSpawn(aim);
  }
  private kill(enemy: Enemy): void {
    enemy.deadAt = this.elapsed; enemy.telegraph = false; enemy.aim.setAlive(false);
    if (this.fatalHeads.delete(enemy.actor.id)) enemy.actor.severHead();
    const body = enemy.platform.getComponent(RigidBody2D)!;
    body.type = ERigidBody2DType.Dynamic;
    P.setVelocity(body, (Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 1.5); body.wakeUp();
    if (enemy.bow.drop()) this.dropBow(enemy);
    const generation = Number(enemy.actor.id.slice('Enemy_'.length));
    this.cycle.defeated(generation); this.nextSpawn = this.elapsed + this.cfg.arcade.respawnSec;
  }
  private dropBow(enemy: Enemy): void {
    enemy.telegraph = false; enemy.aim.setDraw(false, 0); enemy.aim.setArmed(false);
    // Cancel the attack state immediately in the same after-step as disarm/death.
    enemy.attack.step(0, { active: false, alive: enemy.deadAt === null, armed: false, hpRatio: 0 }, () => null);
    this.onSound('drop');
    // A detached bow carries the real hand's position and velocity; no live limb is teleported.
    const socket = enemy.aim.bowSocket(), node = new Node('DroppedBow'); node.layer = this.world.layer; node.parent = this.world;
    P.place(node, socket.x, socket.y);
    const bow = node.addComponent(RigidBody2D); bow.type = ERigidBody2DType.Dynamic; bow.group = this.cfg.rig.collisionGroups.ragdoll;
    const collider = node.addComponent(BoxCollider2D); collider.group = bow.group; collider.size.set(P.units(0.12), P.units(0.7)); collider.apply();
    const g = node.addComponent(Graphics); g.strokeColor = new Color(230, 170, 85, 255); g.lineWidth = P.units(0.05);
    g.moveTo(0, P.units(-0.35)); g.quadraticCurveTo(P.units(0.35), 0, 0, P.units(0.35)); g.stroke();
    const v = enemy.actor.bodies.get('rightForearm')!.linearVelocity; P.setVelocity(bow, v.x, v.y, 2);
    while (this.drops.length >= this.cfg.limits.maxPhysicalEquipmentDrops) P.retire(this.drops.shift()!.node);
    this.drops.push({ node, until: this.elapsed + this.cfg.arcade.cleanupSec });

  }
  private remove(enemy: Enemy): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    this.projectiles.unregisterActor(enemy.actor); enemy.skin.dispose(); this.factory.remove(enemy.actor); P.retire(enemy.platform);
    this.states.delete(enemy.actor.id); this.injuries.delete(enemy.actor.id); this.fatalHeads.delete(enemy.actor.id);
    const i = this.actors.indexOf(enemy.actor); if (i >= 0) this.actors.splice(i, 1);
    if (!this.current) this.onSpawn(null);
  }
  public draw(): void {
    const g = this.graphics; g.clear();
    for (const actor of this.actors) {
      const state = this.states.get(actor.id); if (!state) continue;
      for (const part of this.injuries.get(actor.id) ?? []) {
        const sprite = actor.bodyNodes.get(part as RigBodyId)?.getChildByName(`Skin_${part}`)?.getComponent(Sprite);
        if (sprite) sprite.color = new Color(255, 95, 95, 255);
        for (const joint of actor.definition.jointDefinitions.filter(j => j.childId === part || j.parentId === part)) {
          if (!actor.joints.has(joint.id)) continue;
          const p = actor.worldPointM(joint.parentId, joint.parentAnchorM);
          g.fillColor = new Color(255, 65, 65, 230); g.circle(P.units(p.x), P.units(p.y), P.units(0.085)); g.fill();
        }
      }
      if (state.hp <= 0) continue;
      const head = actor.worldPointM('head', [0, 0]), enemy = this.enemies.find(e => e.actor === actor);
      const max = enemy?.hpMax ?? this.cfg.player.hp;
      g.fillColor = new Color(38, 32, 43, 255); g.rect(P.units(head.x - 0.36), P.units(head.y + 0.37), P.units(0.72), P.units(0.08)); g.fill();
      g.fillColor = new Color(240, 74, 90, 255); g.rect(P.units(head.x - 0.35), P.units(head.y + 0.38), P.units(0.7 * Math.max(0, state.hp / max)), P.units(0.06)); g.fill();
      if (!enemy || !enemy.bow.armed) continue;
      const s = enemy.aim.bowSocket(), dx = Math.cos(s.angleRad), dy = Math.sin(s.angleRad);
      const p = (f: number, a: number) => ({ x: P.units(s.x + dx * f - dy * a), y: P.units(s.y + dy * f + dx * a) });
      const top = p(-0.25, 0.4), bottom = p(-0.25, -0.4), middle = p(0.25, 0);
      g.strokeColor = new Color(230, 170, 85, 255); g.lineWidth = P.units(0.05); g.moveTo(top.x, top.y); g.quadraticCurveTo(middle.x, middle.y, bottom.x, bottom.y); g.stroke();
      const hand = enemy.aim.handsSnapshot.stringGrip;
      g.strokeColor = enemy.telegraph ? new Color(255, 80, 70, 255) : Color.WHITE;
      g.lineWidth = P.units(0.02); g.moveTo(top.x, top.y); g.lineTo(P.units(hand.x), P.units(hand.y)); g.lineTo(bottom.x, bottom.y); g.stroke();
    }
  }
}
