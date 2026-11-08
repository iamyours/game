import { BoxCollider2D, Color, ERigidBody2DType, Graphics, Node, RigidBody2D, Sprite } from 'cc';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { ArcadeCycle, chooseArcadeSpawn } from '../domain/ArcadeRules';
import { AttackSlots, EnemyAttack, predictAim } from '../domain/BattleRules';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import { RagdollFactory, type RagdollInstance } from '../physics/RagdollFactory';
import { AimController } from '../physics/AimController';
import { PoseController } from '../physics/PoseController';
import { CharacterSkin } from '../presentation/CharacterSkin';
import type { RigBodyId } from '../physics/RigDefinition';
import type { ActorCombatState } from './HitResolver';
import { ProjectileSystem } from './ProjectileSystem';

type Enemy = { actor: RagdollInstance; aim: AimController; skin: CharacterSkin; platform: Node;
  attack: EnemyAttack; spec: PhysicsLabConfig['enemies'][number]; hpMax: number; deadAt: number | null; telegraph: boolean };
/** Owns only the endless battle loop; called from the existing single fixed step. */
export class ArcadeBattle {
  private readonly cycle: ArcadeCycle;
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
  public get current() { return this.enemies.find(e => e.deadAt === null); }
  public get snapshot() { return { score: this.score, enemyShots: this.enemyShots, enemyId: this.current?.actor.id ?? null,
    telegraph: this.current?.telegraph ?? false, bodiesRetained: this.enemies.length, platformCount: this.enemies.length, dropCount: this.drops.length, nextSpawnSec: Number.isFinite(this.nextSpawn) ? Math.max(0, this.nextSpawn - this.elapsed) : null }; }
  public constructor(private readonly world: Node, private readonly cfg: PhysicsLabConfig,
    private readonly factory: RagdollFactory, private readonly actors: RagdollInstance[],
    private readonly states: Map<string, ActorCombatState>, private readonly projectiles: ProjectileSystem,
    private readonly onSpawn: (aim: AimController | null) => void) {
    this.cycle = new ArcadeCycle(cfg.arcade.respawnSec);
    const overlay = new Node('BattleFeedback'); overlay.layer = world.layer; overlay.parent = world;
    this.graphics = overlay.addComponent(Graphics);
    this.spawn();
  }
  private get player() { return this.actors[0]!; }
  public beforeStep(dt: number): void {
    this.cycle.step(dt);
    const enemy = this.current;
    if (!enemy) return;
    const state = this.states.get(enemy.actor.id)!;
    const player = this.states.get(this.player.id)!;
    const spec = enemy.spec;
    const events = enemy.attack.step(dt, { active: player.hp > 0, alive: state.hp > 0, armed: true, hpRatio: state.hp / enemy.hpMax }, () => {
      const socket = enemy.aim.bowSocket(), target = this.player.worldPointM('chest', [0, 0]);
      const velocity = this.player.bodies.get('chest')!.linearVelocity;
      return predictAim({ x: target.x - socket.x, y: target.y - socket.y }, velocity,
        spec.speedMps, Math.abs(this.cfg.physics.gravityMps2[1]), spec.telegraphSec);
    });
    for (const event of events) {
      if (event.aimRad !== null) enemy.aim.setWorldAim(event.aimRad);
      enemy.telegraph = event.kind === 'telegraph';
      if (event.kind === 'release') {
        const shot = this.projectiles.fire(enemy.actor.id, enemy.aim.bowSocket(),
          { ...this.cfg.arrows[0]!, baseDamage: spec.arrowBaseDamage, speedMps: spec.speedMps });
        if (shot !== null) this.enemyShots += 1;
      }
    }
    enemy.aim.setDraw(enemy.telegraph, enemy.telegraph ? 1 : 0);
    enemy.aim.step(dt);
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
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.drops[i]!.until <= this.elapsed) {
      this.drops[i]!.node.destroy(); this.drops.splice(i, 1);
    }
    if (this.cycle.canSpawn(player.hp > 0) && !this.current) this.spawn();
  }
  public hit(state: ActorCombatState, part: string): void {
    if (state.hp <= 0 && part === 'head') this.fatalHeads.add(state.id);
    let marked = this.injuries.get(state.id);
    if (!marked) { marked = new Set(); this.injuries.set(state.id, marked); }
    marked.add(part);
    const actor = this.actors.find(a => a.id === state.id);
    const skin = actor?.bodyNodes.get(part as RigBodyId)?.getChildByName(`Skin_${part}`)?.getComponent(Sprite);
    if (skin) skin.color = new Color(255, 95, 95, 255);
  }
  public reset(): void {
    for (const enemy of [...this.enemies]) this.remove(enemy);
    for (const drop of this.drops) drop.node.destroy(); this.drops.length = 0;
    this.injuries.clear(); this.fatalHeads.clear(); this.enemyShots = 0; this.cycle.reset();
    for (const node of this.player.bodyNodes.values()) {
      const sprite = node.getChildByName(`Skin_${node.name}`)?.getComponent(Sprite);
      if (sprite) sprite.color = Color.WHITE;
    }
    this.spawn();
  }
  public dispose(): void {
    for (const enemy of [...this.enemies]) this.remove(enemy);
    for (const drop of this.drops) drop.node.destroy(); this.drops.length = 0;
    this.graphics.node.destroy();
  }
  private spawn(): void {
    const { x, y, width } = chooseArcadeSpawn(this.cfg, Math.random);
    const platform = new Node(`EnemyPlatform_${++this.serial}`); platform.layer = this.world.layer; platform.parent = this.world;
    P.place(platform, x, y - 0.3);
    const body = platform.addComponent(RigidBody2D); body.type = ERigidBody2DType.Static; body.group = this.cfg.rig.collisionGroups.platform;
    const collider = platform.addComponent(BoxCollider2D); collider.group = body.group;
    collider.size.set(P.units(width), P.units(0.6)); collider.friction = 0.9; collider.apply();
    const g = platform.addComponent(Graphics); g.fillColor = new Color(76, 100, 112, 255);
    g.rect(-P.units(width / 2), -P.units(0.3), P.units(width), P.units(0.6)); g.fill();
    const actor = this.factory.spawn(this.world, `Enemy_${this.serial}`, [x, y + 0.41], '#E98575');
    const aim = new AimController(actor, new PoseController(actor, this.cfg.rig, this.cfg.bowControl)); aim.setWorldAim(Math.PI - 0.2);
    const skin = new CharacterSkin(actor, this.cfg.rig); void skin.load('enemy').catch(e => console.warn('[Arcade skin]', e));
    const spec = this.cfg.enemies[Math.random() < 0.5 ? 0 : 1]!;
    const hpMax = spec.hp;
    this.states.set(actor.id, { id: actor.id, hp: hpMax, armor: 0, hits: 0, lastHit: null });
    this.actors.push(actor); this.projectiles.registerActor(actor);
    this.enemies.push({ actor, aim, skin, platform, hpMax, deadAt: null, telegraph: false,
      spec, attack: new EnemyAttack(spec, this.cfg.run, new AttackSlots(this.cfg.run.enemyAttackStartSeparationSec), Math.random) });
    this.nextSpawn = Infinity; this.cycle.spawned(); this.onSpawn(aim);
  }
  private kill(enemy: Enemy): void {
    enemy.deadAt = this.elapsed; enemy.telegraph = false; enemy.aim.setAlive(false);
    const state = this.states.get(enemy.actor.id)!;
    if (this.fatalHeads.delete(enemy.actor.id)) enemy.actor.severHead();
    const body = enemy.platform.getComponent(RigidBody2D)!;
    body.type = ERigidBody2DType.Dynamic;
    P.setVelocity(body, (Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 1.5); body.wakeUp();
    // A detached bow carries the real hand's position and velocity; no live limb is teleported.
    const socket = enemy.aim.bowSocket(), node = new Node('DroppedBow'); node.layer = this.world.layer; node.parent = this.world;
    P.place(node, socket.x, socket.y);
    const bow = node.addComponent(RigidBody2D); bow.type = ERigidBody2DType.Dynamic; bow.group = this.cfg.rig.collisionGroups.ragdoll;
    const collider = node.addComponent(BoxCollider2D); collider.group = bow.group; collider.size.set(P.units(0.12), P.units(0.7)); collider.apply();
    const g = node.addComponent(Graphics); g.strokeColor = new Color(230, 170, 85, 255); g.lineWidth = P.units(0.05);
    g.moveTo(0, P.units(-0.35)); g.quadraticCurveTo(P.units(0.35), 0, 0, P.units(0.35)); g.stroke();
    const v = enemy.actor.bodies.get('rightForearm')!.linearVelocity; P.setVelocity(bow, v.x, v.y, 2);
    this.drops.push({ node, until: this.elapsed + this.cfg.arcade.cleanupSec });
    this.cycle.defeated(this.serial); this.nextSpawn = this.elapsed + this.cfg.arcade.respawnSec;
  }
  private remove(enemy: Enemy): void {
    this.projectiles.unregisterActor(enemy.actor); enemy.skin.dispose(); this.factory.remove(enemy.actor); enemy.platform.destroy();
    this.states.delete(enemy.actor.id); this.injuries.delete(enemy.actor.id); this.fatalHeads.delete(enemy.actor.id);
    const i = this.actors.indexOf(enemy.actor); if (i >= 0) this.actors.splice(i, 1);
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    if (!this.current) this.onSpawn(null);
  }
  public draw(): void {
    const g = this.graphics; g.clear();
    for (const actor of this.actors) {
      const state = this.states.get(actor.id); if (!state) continue;
      for (const part of this.injuries.get(actor.id) ?? []) {
        for (const joint of this.cfg.rig.jointDefinitions.filter(j => j.childId === part || j.parentId === part)) {
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
      if (!enemy) continue;
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
