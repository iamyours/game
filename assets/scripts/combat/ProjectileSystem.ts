import { CircleCollider2D, Color, Contact2DType, ERigidBody2DType, Graphics, Node, RigidBody2D, type Collider2D, type IPhysics2DContact } from 'cc';
import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import type { BowSocketSnapshot } from '../physics/AimController';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import type { RagdollInstance } from '../physics/RagdollFactory';
import { eventCallbackCount } from '../domain/RuntimeDiagnostics';

type Point = { x: number; y: number };
export type ProjectileArrowConfig = PhysicsLabConfig['arrows'][number];
export const TIP_OFFSET_M = 0.31;
export interface HitCandidate {
  shotId: number; stepId: number; attackerId: string; targetId: string; partId: string;
  pointM: Point; normal: Point; incomingVelocityMps: Point; arrow: ProjectileArrowConfig;
  source: 'contact' | 'sweep'; fraction: number;
}
interface Flight {
  id: number; slot: Slot; arrow: ProjectileArrowConfig; shooter: string;
  previous: Point; velocity: Point; born: number; angle: number;
}
type ContactCallback = (self: Collider2D, other: Collider2D, contact: IPhysics2DContact | null) => void;
interface Slot { node: Node; body: RigidBody2D; collider: Collider2D; graphics: Graphics; onContact: ContactCallback | null; flight?: Flight }
const palette: Record<string, string> = { normal: '#F7C66F', impact: '#F29983', piercing: '#BCAEF6' };
function drawArrow(g: Graphics, id: string): void {
  g.clear(); g.strokeColor = new Color().fromHEX(palette[id] ?? '#F7C66F'); g.lineWidth = Physics.units(0.035);
  g.moveTo(Physics.units(-0.52), 0); g.lineTo(0, 0); g.stroke();
  g.fillColor = g.strokeColor;
  g.moveTo(0, 0); g.lineTo(Physics.units(-0.13), Physics.units(0.065));
  g.lineTo(Physics.units(-0.13), Physics.units(-0.065)); g.close(); g.fill();
}

/** Only the tip is physical; shaft orientation and embedded arrows are visual children. */
export class ProjectileSystem {
  private readonly flying = new Map<number, Flight>();
  private readonly spare: Slot[] = [];
  private readonly embedded: { target: string; node: Node }[] = [];
  private readonly queue: HitCandidate[] = [];
  private readonly targets = new Map<Node, { targetId: string; partId: string; body: RigidBody2D }>();
  private readonly pickups = new Map<string, { node: Node; collect: () => void }>();
  private nextId = 1;
  private stepId = 0;

  public constructor(private readonly world: Node, private readonly config: PhysicsLabConfig,
    actors: readonly RagdollInstance[], private readonly onHit: (candidate: HitCandidate, target: RigidBody2D) => void) {
    for (const actor of actors) for (const [partId, body] of actor.bodies) {
      this.targets.set(body.node, { targetId: actor.id, partId, body });
    }
  }
  public get count(): number { return this.flying.size; }
  public get embeddedCount(): number { return this.embedded.length; }
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
    for (let i = this.embedded.length - 1; i >= 0; i--) if (this.embedded[i]!.target === actor.id) {
      this.embedded[i]!.node.destroy(); this.embedded.splice(i, 1);
    }
  }

  public beginStep(id: number): void {
    this.stepId = id;
    for (const shot of this.flying.values()) this.sample(shot);
  }

  public muzzleClear(shooter: string, socket: BowSocketSnapshot): boolean {
    const end = this.tip(socket, TIP_OFFSET_M + 0.06);
    const blocks = (collider: Collider2D): boolean => {
      const target = this.targets.get(collider.node);
      return collider.group === this.config.rig.collisionGroups.platform ||
        (target !== undefined && !(target.targetId === shooter && target.partId === 'rightForearm'));
    };
    return !Physics.testPointM(socket).some(blocks) && !Physics.testPointM(end).some(blocks) &&
      !Physics.raycastM(socket, end, this.mask).some(hit => blocks(hit.collider));
  }

  public launchBlockReason(shooter: string, socket: BowSocketSnapshot): 'arrow-limit' | 'muzzle-blocked' | null {
    if (this.count >= this.config.limits.maxFlyingArrows) return 'arrow-limit';
    return this.muzzleClear(shooter, socket) ? null : 'muzzle-blocked';
  }

  public fire(shooter: string, socket: BowSocketSnapshot, arrow: ProjectileArrowConfig): number | null {
    if (this.launchBlockReason(shooter, socket) !== null) return null;
    const slot = this.spare.pop() ?? this.createSlot();
    const point = this.tip(socket, TIP_OFFSET_M);
    Physics.place(slot.node, point.x, point.y);
    slot.node.active = true;
    slot.graphics.node.setRotationFromEuler(0, 0, Physics.degrees(socket.angleRad));
    drawArrow(slot.graphics, arrow.id);
    const shot = { id: this.nextId++, slot, shooter, arrow, previous: point, born: this.stepId, angle: socket.angleRad,
      velocity: { x: Math.cos(socket.angleRad) * arrow.speedMps, y: Math.sin(socket.angleRad) * arrow.speedMps } };
    slot.flight = shot;
    Physics.setVelocity(slot.body, shot.velocity.x, shot.velocity.y);
    this.flying.set(shot.id, shot);
    return shot.id;
  }

  public afterStep(): void {
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
      if ((this.stepId - shot.born) * this.config.physics.fixedTimeStepSec >= this.config.limits.projectileTtlSec || x < -2 || x > 26 || y < -3 || y > 16) {
        this.recycle(shot);
      } else {
        const velocity = shot.slot.body.linearVelocity;
        if (Math.hypot(velocity.x, velocity.y) > 0.1) shot.angle = Math.atan2(velocity.y, velocity.x);
        shot.slot.graphics.node.setRotationFromEuler(0, 0, Physics.degrees(shot.angle));
      }
    }
  }

  public clear(): void {
    for (const shot of this.flying.values()) this.recycle(shot);
    for (const mark of this.embedded) mark.node.destroy();
    this.embedded.length = this.queue.length = 0;
  }

  public dispose(): void {
    this.clear();
    for (const slot of this.spare) {
      if (slot.onContact) slot.collider.off(Contact2DType.BEGIN_CONTACT, slot.onContact);
      Physics.retire(slot.node);
    }
    this.spare.length = 0; this.targets.clear(); this.pickups.clear();
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
    const collider = node.addComponent(CircleCollider2D);
    collider.group = body.group; collider.radius = Physics.units(0.035); collider.density = 0.5; collider.friction = 0;
    const visual = new Node('Shaft'); visual.layer = node.layer; visual.parent = node;
    const slot: Slot = { node, body, collider, graphics: visual.addComponent(Graphics), onContact: null };
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
    this.flying.delete(shot.id);
    shot.slot.flight = undefined;
    shot.slot.node.active = false;
    this.spare.push(shot.slot);
  }
  private embed(hit: HitCandidate, parent: Node): void {
    const perActor = this.embedded.filter(mark => mark.target === hit.targetId);
    const oldest = perActor.length >= this.config.limits.maxEmbeddedPerActor ? perActor[0]
      : this.embedded.length >= this.config.limits.maxEmbeddedVisuals ? this.embedded[0] : undefined;
    if (oldest) { oldest.node.destroy(); this.embedded.splice(this.embedded.indexOf(oldest), 1); }
    const node = new Node('EmbeddedArrow'); node.layer = parent.layer; node.parent = this.world;
    Physics.place(node, hit.pointM.x, hit.pointM.y);
    node.setRotationFromEuler(0, 0, Physics.degrees(Math.atan2(hit.incomingVelocityMps.y, hit.incomingVelocityMps.x)));
    node.setParent(parent, true);
    drawArrow(node.addComponent(Graphics), hit.arrow.id);
    this.embedded.push({ target: hit.targetId, node });
  }
}
