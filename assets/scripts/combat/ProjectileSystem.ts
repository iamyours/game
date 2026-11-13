import { CircleCollider2D, Color, Contact2DType, ERigidBody2DType, Graphics, Node, RigidBody2D, UIOpacity, isValid, type Collider2D, type IPhysics2DContact } from 'cc';
import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import type { BowSocketSnapshot } from '../physics/AimController';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import type { RagdollInstance } from '../physics/RagdollFactory';
import { eventCallbackCount } from '../domain/RuntimeDiagnostics';
import { drawWeaponArrow } from '../presentation/WeaponVisual';
import { ThunderArrowSkin, thunderArrowLength, type ThunderWeaponAssets } from '../presentation/ThunderWeaponSkin';
import { ArrowResidues, shortFlightTrail, embeddedArrowPose } from '../domain/ProjectilePresentation';
import type { SkillKind } from '../domain/BattleLoadout';

type Point = { x: number; y: number };
export type ProjectileArrowConfig = PhysicsLabConfig['arrows'][number] & { skill?: SkillKind };
export const TIP_OFFSET_M = 0.31;
export interface HitCandidate {
  shotId: number; stepId: number; attackerId: string; targetId: string; partId: string;
  pointM: Point; normal: Point; incomingVelocityMps: Point; arrow: ProjectileArrowConfig;
  source: 'contact' | 'sweep'; fraction: number;
}
interface Flight {
  id: number; slot: Slot; arrow: ProjectileArrowConfig; shooter: string;
  previous: Point; velocity: Point; born: number; angle: number; trail: Point[];
}
type ContactCallback = (self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) => void;
interface Slot { node: Node; body: RigidBody2D; collider: Collider2D; graphics: Graphics; skin: ThunderArrowSkin | null; onContact: ContactCallback | null; flight?: Flight }
function drawArrow(g: Graphics, id: string): void {
  g.clear();
  drawWeaponArrow(g, id, { x: 0, y: 0 }, 0);
}

/** Only the tip is physical; shaft orientation and embedded arrows are visual children. */
export class ProjectileSystem {
  private readonly flying = new Map<number, Flight>();
  private readonly spare: Slot[] = [];
  private readonly embedded: ArrowResidues<{ node: Node; shaft: Node; opacity: UIOpacity; born: number; impulseNs: number; terrain: boolean }>;
  private readonly trails: Graphics;
  private readonly queue: HitCandidate[] = [];
  private readonly targets = new Map<Node, { targetId: string; partId: string; body: RigidBody2D }>();
  private readonly pickups = new Map<string, { node: Node; collect: () => void }>();
  private nextId = 1;
  private stepId = 0;
  private disposed = false;
  private bounds = { left: -2, right: 26, bottom: -3, top: 16 };

  public constructor(private readonly world: Node, private readonly config: PhysicsLabConfig,
    actors: readonly RagdollInstance[], private readonly onHit: (candidate: HitCandidate, target: RigidBody2D) => void, private readonly weaponAssets?: ThunderWeaponAssets) {
    this.embedded = new ArrowResidues(config.limits, ({ node }) => { if (isValid(node, true)) Physics.retire(node); });
    const trailNode = new Node('FlightTrails'); trailNode.layer = world.layer; trailNode.parent = world;
    this.trails = trailNode.addComponent(Graphics);
    for (const actor of actors) for (const [partId, body] of actor.bodies) {
      this.targets.set(body.node, { targetId: actor.id, partId, body });
    }
  }
  public get count(): number { return this.flying.size; }
  public get embeddedCount(): number { return this.embedded.count; }
  public setViewBounds(bounds: { left: number; right: number; bottom: number; top: number }): void { this.bounds = bounds; }
  public get poolSize(): number { return this.flying.size + this.spare.length; }
  public get contactListenerCount(): number | null {
    let total = 0;
    for (const slot of [...this.spare, ...Array.from(this.flying.values(), flight => flight.slot)]) {
      const count = eventCallbackCount(slot.collider, { callback: slot.onContact });
      if (count === null) return null;
      total += count;
    }
    return total;
  }
  public registerPickup(node: Node, collect: () => void): void { this.pickups.set(node.name, { node, collect }); }
  public unregisterPickup(node: Node): void { this.pickups.delete(node.name); }
  public registerActor(actor: RagdollInstance): void {
    for (const [partId, body] of actor.bodies) this.targets.set(body.node, { targetId: actor.id, partId, body });
  }
  public unregisterActor(actor: RagdollInstance): void {
    for (const body of actor.bodies.values()) this.targets.delete(body.node);
    this.embedded.removeTarget(actor.id);
  }

  public beginStep(id: number): void {
    this.stepId = id;
    for (const shot of this.flying.values()) this.sample(shot);
  }

  public muzzleClear(shooter: string, socket: BowSocketSnapshot, launchTip?: Point): boolean {
    const tip = launchTip ?? this.tip(socket, TIP_OFFSET_M);
    if (![tip.x, tip.y].every(Number.isFinite) || (tip.x - socket.x) * Math.cos(socket.angleRad) +
      (tip.y - socket.y) * Math.sin(socket.angleRad) < 0) return false;
    const end = { x: tip.x + Math.cos(socket.angleRad) * 0.06, y: tip.y + Math.sin(socket.angleRad) * 0.06 };
    const blocks = (collider: Collider2D): boolean => {
      const target = this.targets.get(collider.node);
      return collider.group === this.config.rig.collisionGroups.platform ||
        (target !== undefined && !(target.targetId === shooter && target.partId === 'rightForearm'));
    };
    return !Physics.testPointM(socket).some(blocks) && !Physics.testPointM(end).some(blocks) &&
      !Physics.raycastM(socket, end, this.mask).some(hit => blocks(hit.collider));
  }

  public launchBlockReason(shooter: string, socket: BowSocketSnapshot, launchTip?: Point): 'arrow-limit' | 'muzzle-blocked' | null {
    if (this.count >= this.config.limits.maxFlyingArrows) return 'arrow-limit';
    return this.muzzleClear(shooter, socket, launchTip) ? null : 'muzzle-blocked';
  }

  public fire(shooter: string, socket: BowSocketSnapshot, arrow: ProjectileArrowConfig, launchTip?: Point): number | null {
    if (this.disposed) return null;
    if (this.launchBlockReason(shooter, socket, launchTip) !== null) return null;
    const slot = this.spare.pop() ?? this.createSlot();
    const point = launchTip ?? this.tip(socket, TIP_OFFSET_M);
    Physics.place(slot.node, point.x, point.y);
    slot.node.active = true;
    slot.graphics.node.setRotationFromEuler(0, 0, Physics.degrees(socket.angleRad));
    const skinned = shooter === 'PlayerRagdoll' && slot.skin?.show(arrow.id);
    if (shooter !== 'PlayerRagdoll') slot.skin?.hide();
    slot.graphics.enabled = !skinned;
    if (!skinned) drawArrow(slot.graphics, arrow.id);
    const tail = { x: point.x - Math.cos(socket.angleRad) * thunderArrowLength(arrow.id),
      y: point.y - Math.sin(socket.angleRad) * thunderArrowLength(arrow.id) };
    const shot = { id: this.nextId++, slot, shooter, arrow, previous: point, born: this.stepId, angle: socket.angleRad, trail: [tail],
      velocity: { x: Math.cos(socket.angleRad) * arrow.speedMps, y: Math.sin(socket.angleRad) * arrow.speedMps } };
    slot.flight = shot;
    // Pooled tips must never inherit a stopped arrow's gravity, damping or spin.
    slot.body.gravityScale = 1; slot.body.linearDamping = slot.body.angularDamping = 0;
    Physics.setVelocity(slot.body, shot.velocity.x, shot.velocity.y);
    this.flying.set(shot.id, shot);
    return shot.id;
  }

  public afterStep(): void {
    if (this.disposed) return;
    for (const shot of this.flying.values()) {
      const point = Physics.positionM(shot.slot.node);
      for (const hit of Physics.raycastM(shot.previous, point, this.mask)) {
        this.enqueue(shot, hit.collider, hit.pointM, hit.normal, 'sweep', hit.fraction);
      }
    }
    this.queue.sort((a, b) => a.shotId - b.shotId || a.fraction - b.fraction || Number(a.source === 'sweep') - Number(b.source === 'sweep'));
    for (const hit of this.queue) {
      const shot = this.flying.get(hit.shotId);
      if (!shot) continue; // First valid candidate consumes the shot, including terrain hits.
      const pickup = this.pickups.get(hit.targetId);
      if (pickup) { pickup.collect(); this.recycle(shot); continue; }
      const target = this.targets.get(this.world.getChildByName(hit.targetId)?.getChildByName(hit.partId) as Node)?.body;
      if (target) this.onHit(hit, target);
      const parent = target?.node ?? this.world.getChildByName(hit.targetId);
      if (parent) this.embed(hit, parent);
      this.recycle(shot);
    }
    this.queue.length = 0;
    for (const shot of this.flying.values()) {
      const { x, y } = Physics.positionM(shot.slot.node);
      if ((this.stepId - shot.born) * this.config.physics.fixedTimeStepSec >= this.config.limits.projectileTtlSec || !this.inView({ x, y }, 2)) {
        this.recycle(shot);
      } else {
        const velocity = shot.slot.body.linearVelocity;
        if (Math.hypot(velocity.x, velocity.y) > 0.1) shot.angle = Math.atan2(velocity.y, velocity.x);
        shot.slot.graphics.node.setRotationFromEuler(0, 0, Physics.degrees(shot.angle));
        const length = thunderArrowLength(shot.arrow.id);
        shot.trail.push({ x: x - Math.cos(shot.angle) * length, y: y - Math.sin(shot.angle) * length });
        if (shot.trail.length > 6) shot.trail.shift();
      }
    }
    const now = this.stepId * this.config.physics.fixedTimeStepSec;
    this.embedded.prune(now, ({ node }) => isValid(node, true) && isValid(node.parent, true) && this.inView(Physics.positionM(node), 1.6));
    for (const entry of this.embedded.items) {
      const visual = entry.visual, pose = embeddedArrowPose(now - visual.born, visual.impulseNs, visual.terrain);
      visual.shaft.setPosition(Physics.units(pose.penetrationM), 0, 0);
      visual.shaft.setRotationFromEuler(0, 0, Physics.degrees(pose.angleRad));
      visual.opacity.opacity = Math.round(255 * this.embedded.opacity(entry, now));
    }
    this.drawTrails();
  }

  public clear(): void {
    for (const shot of this.flying.values()) this.recycle(shot);
    this.embedded.clear(); this.queue.length = 0;
    if (isValid(this.trails, true)) this.trails.clear();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const slot of this.spare) {
      if (slot.onContact) slot.collider.off(Contact2DType.BEGIN_CONTACT, slot.onContact);
      Physics.retire(slot.node);
    }
    this.spare.length = 0; this.targets.clear(); this.pickups.clear();
    if (isValid(this.trails.node, true)) Physics.retire(this.trails.node);
  }

  private get mask(): number { return this.config.rig.collisionGroups.platform | this.config.rig.collisionGroups.ragdoll; }
  private tip(socket: BowSocketSnapshot, length: number): Point {
    return { x: socket.x + Math.cos(socket.angleRad) * length, y: socket.y + Math.sin(socket.angleRad) * length };
  }
  private sample(shot: Flight): void {
    shot.previous = Physics.positionM(shot.slot.node);
    const { x, y } = shot.slot.body.linearVelocity;
    shot.velocity = { x, y };
  }
  private createSlot(): Slot {
    const node = new Node('ArrowTip'); node.layer = this.world.layer; node.parent = this.world; node.active = false;
    const body = node.addComponent(RigidBody2D);
    body.type = ERigidBody2DType.Dynamic; body.group = this.config.rig.collisionGroups.projectile;
    body.bullet = true; body.fixedRotation = true; body.enabledContactListener = true; body.allowSleep = false;
    body.gravityScale = 1; body.linearDamping = body.angularDamping = 0;
    const collider = node.addComponent(CircleCollider2D);
    collider.group = body.group; collider.radius = Physics.units(0.035); collider.density = 0.5; collider.friction = 0;
    const visual = new Node('Shaft'); visual.layer = node.layer; visual.parent = node;
    const slot: Slot = { node, body, collider, graphics: visual.addComponent(Graphics), skin: this.weaponAssets ? new ThunderArrowSkin(visual, this.weaponAssets) : null, onContact: null };
    slot.onContact = (self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) => {
      const shot = slot.flight;
      if (!shot || !contact) return;
      const { points, normal } = contact.getWorldManifold();
      if (!points[0]) return;
      const point = Physics.pointM(points[0]);
      const sign = contact.colliderA === self ? -1 : 1;
      const travel = Math.hypot(shot.velocity.x, shot.velocity.y) * this.config.physics.fixedTimeStepSec;
      const fraction = Math.min(1, Math.hypot(point.x - shot.previous.x, point.y - shot.previous.y) / Math.max(1e-6, travel));
      this.enqueue(shot, other, point, { x: normal.x * sign, y: normal.y * sign }, 'contact', fraction);
    };
    collider.on(Contact2DType.BEGIN_CONTACT, slot.onContact);
    return slot;
  }
  private enqueue(shot: Flight, collider: Collider2D, pointM: Point, normal: Point, source: HitCandidate['source'], fraction: number): void {
    const target = this.targets.get(collider.node);
    if (this.pickups.has(collider.node.name) && shot.shooter !== 'PlayerRagdoll') return;
    if (target?.targetId === shot.shooter || (!target && collider.group !== this.config.rig.collisionGroups.platform)) return;
    this.queue.push({ shotId: shot.id, stepId: this.stepId, attackerId: shot.shooter, targetId: target?.targetId ?? collider.node.name,
      partId: target?.partId ?? 'platform', pointM, normal, source, fraction, incomingVelocityMps: shot.velocity, arrow: shot.arrow });
  }
  private recycle(shot: Flight): void {
    if (!this.flying.delete(shot.id)) return;
    shot.slot.flight = undefined;
    shot.trail.length = 0;
    if (isValid(shot.slot.node, true)) {
      if (isValid(shot.slot.body, true) && shot.slot.node.activeInHierarchy) Physics.setVelocity(shot.slot.body, 0, 0);
      shot.slot.node.active = false;
    }
    this.spare.push(shot.slot);
  }
  private embed(hit: HitCandidate, parent: Node): void {
    if (!isValid(parent, true)) return;
    const node = new Node('EmbeddedArrow'); node.layer = parent.layer; node.parent = this.world;
    Physics.place(node, hit.pointM.x, hit.pointM.y);
    node.setRotationFromEuler(0, 0, Physics.degrees(Math.atan2(hit.incomingVelocityMps.y, hit.incomingVelocityMps.x)));
    node.setParent(parent, true);
    // The body's opaque artwork covers the buried tip; only visual children animate.
    if (hit.partId !== 'platform') node.setSiblingIndex(0);
    const shaft = new Node('SettlingShaft'); shaft.layer = node.layer; shaft.parent = node;
    const skin = hit.attackerId === 'PlayerRagdoll' && this.weaponAssets ? new ThunderArrowSkin(shaft, this.weaponAssets) : null;
    if (!skin?.show(hit.arrow.id)) drawArrow(shaft.addComponent(Graphics), hit.arrow.id);
    const born = this.stepId * this.config.physics.fixedTimeStepSec;
    this.embedded.add(hit.targetId, hit.partId === 'platform', { node, shaft, opacity: node.addComponent(UIOpacity),
      born, impulseNs: hit.arrow.impulseNs, terrain: hit.partId === 'platform' }, born);
  }

  private inView(point: Point, margin: number): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= this.bounds.left - margin &&
      point.x <= this.bounds.right + margin && point.y >= this.bounds.bottom - margin && point.y <= this.bounds.top + margin;
  }
  private drawTrails(): void {
    const g = this.trails; g.clear();
    for (const shot of this.flying.values()) {
      const points = shortFlightTrail(shot.trail);
      for (let i = points.length - 1; i > 0; i--) {
        const a = points[i]!, b = points[i - 1]!, t = 1 - i / points.length;
        const glow = shot.arrow.skill === 'moon' ? [203, 182, 255] : shot.arrow.skill === 'gale' ? [165, 230, 181] : shot.arrow.skill === 'rune' ? [255, 218, 120] : [147, 229, 255];
        g.strokeColor = shot.arrow.skill ? new Color(glow[0]!, glow[1]!, glow[2]!, Math.round(220 * t)) : shot.shooter === 'PlayerRagdoll' ? new Color(155, 227, 244, Math.round(125 * t)) : new Color(255, 192, 142, Math.round(125 * t));
        g.lineWidth = Physics.units((shot.arrow.skill ? 0.05 : 0.025) + 0.035 * t);
        g.moveTo(Physics.units(a.x), Physics.units(a.y)); g.lineTo(Physics.units(b.x), Physics.units(b.y)); g.stroke();
      }
      if (shot.arrow.skill === 'thunder' && points.length > 1) {
        g.strokeColor = new Color(190, 240, 255, 210); g.lineWidth = Physics.units(0.025);
        for (let i = 0; i < points.length; i++) {
          const point = points[i]!, y = point.y + (i % 2 === 0 ? 0.05 : -0.05);
          if (i === 0) g.moveTo(Physics.units(point.x), Physics.units(y)); else g.lineTo(Physics.units(point.x), Physics.units(y));
        }
        g.stroke();
      }
    }
  }
}
