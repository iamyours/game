import { BoxCollider2D, CircleCollider2D, Color, ERigidBody2DType, Graphics, HingeJoint2D, Node, PhysicsSystem2D, RigidBody2D, Vec2 } from 'cc';
import { PhysicsAdapter as Physics } from './PhysicsAdapter';
import type { RigBodyDefinition, RigDefinition, RigBodyId } from './RigDefinition';

export interface RagdollInstanceSnapshot {
  readonly id: string;
  readonly bodyCount: number;
  readonly jointCount: number;
  readonly bodyIds: readonly string[];
  readonly jointIds: readonly string[];
  readonly positionsM: Readonly<Record<string, { x: number; y: number }>>;
  readonly massesKg: Readonly<Record<string, number>>;
  readonly maxJointErrorM: number;
  readonly finite: boolean;
}

export interface RagdollInstance {
  readonly id: string;
  readonly root: Node;
  readonly bodyNodes: ReadonlyMap<RigBodyId, Node>;
  readonly bodies: ReadonlyMap<RigBodyId, RigidBody2D>;
  readonly joints: ReadonlyMap<string, HingeJoint2D>;
  /** Applies a motor target; callers must use this instead of writing body transforms. */
  setJointMotor(jointId: string, targetAngleDeg: number, torqueNm: number, maxSpeedDegPerSec: number): void;
  relativeAngleDeg(jointId: string): number;
  worldAngleDeg(bodyId: RigBodyId): number;
  worldPointM(bodyId: RigBodyId, localPointM: readonly [number, number]): { x: number; y: number };
  reset(): void;
  snapshot(): RagdollInstanceSnapshot;
  destroy(): void;
}

type CollisionMatrix = { readonly [key: string]: number };

function tint(hex: string): Color { return new Color().fromHEX(hex); }
function areaM2(body: RigBodyDefinition): number {
  return body.shape === 'circle' ? Math.PI * (body.sizeM[0] / 2) ** 2 : body.sizeM[0] * body.sizeM[1];
}
function configureGraphics(graphics: Graphics, body: RigBodyDefinition, hex: string): void {
  graphics.fillColor = tint(hex);
  if (body.shape === 'circle') {
    graphics.circle(0, 0, Physics.units(body.sizeM[0] / 2));
  } else {
    graphics.rect(Physics.units(-body.sizeM[0] / 2), Physics.units(-body.sizeM[1] / 2),
      Physics.units(body.sizeM[0]), Physics.units(body.sizeM[1]));
  }
  graphics.fill();
  graphics.strokeColor = tint('#19313C');
  graphics.lineWidth = Physics.units(0.025);
  if (body.shape === 'circle') graphics.circle(0, 0, Physics.units(body.sizeM[0] / 2));
  else graphics.rect(Physics.units(-body.sizeM[0] / 2), Physics.units(-body.sizeM[1] / 2), Physics.units(body.sizeM[0]), Physics.units(body.sizeM[1]));
  graphics.stroke();
}

class RagdollInstanceImpl implements RagdollInstance {
  private destroyed = false;
  public constructor(
    public readonly id: string,
    public readonly root: Node,
    public readonly bodyNodes: ReadonlyMap<RigBodyId, Node>,
    public readonly bodies: ReadonlyMap<RigBodyId, RigidBody2D>,
    public readonly joints: ReadonlyMap<string, HingeJoint2D>,
    private readonly definition: RigDefinition,
    private readonly initialPositionM: readonly [number, number],
  ) {}

  public reset(): void {
    if (this.destroyed) return;
    // An explicit post-step reset must discard old platform contacts and solver warm-start impulses.
    // Keep the scene components and bodies; only refresh the native joint constraints.
    for (const body of this.bodies.values()) body.enabled = false;
    this.root.setWorldPosition(Physics.units(this.initialPositionM[0]), Physics.units(this.initialPositionM[1]), 0);
    for (const bodyDefinition of this.definition.bodyDefinitions) {
      const node = this.bodyNodes.get(bodyDefinition.id);
      const body = this.bodies.get(bodyDefinition.id);
      if (!node || !body) continue;
      node.setPosition(Physics.units(bodyDefinition.positionM[0]), Physics.units(bodyDefinition.positionM[1]), 0);
      node.setRotationFromEuler(0, 0, 0);
      Physics.syncResetPose(body);
      Physics.setVelocity(body, 0, 0, 0);
      body.gravityScale = 1;
    }
    for (const body of this.bodies.values()) { body.enabled = true; body.wakeUp(); }
    for (const joint of this.joints.values()) {
      joint.maxMotorTorque = this.definition.neutralMotorTorqueNm;
      Physics.setMotorSpeed(joint, 0);
      joint.apply();
    }
  }

  public setJointMotor(jointId: string, targetAngleDeg: number, torqueNm: number, maxSpeedDegPerSec: number): void {
    const joint = this.joints.get(jointId);
    const definition = this.definition.jointDefinitions.find((value) => value.id === jointId);
    if (!joint || !definition) return;
    const target = Math.max(definition.limitsDeg[0], Math.min(definition.limitsDeg[1], targetAngleDeg));
    const error = normalizeDegrees(target - this.relativeAngleDeg(jointId));
    joint.enableMotor = true;
    joint.maxMotorTorque = Math.max(0, torqueNm);
    Physics.setMotorSpeed(joint, Math.max(-maxSpeedDegPerSec, Math.min(maxSpeedDegPerSec, error * 7)));
  }

  public relativeAngleDeg(jointId: string): number {
    const definition = this.definition.jointDefinitions.find((value) => value.id === jointId);
    if (!definition) return 0;
    const parent = this.bodies.get(definition.parentId);
    const child = this.bodies.get(definition.childId);
    if (!parent || !child) return 0;
    return normalizeDegrees(this.worldAngleDeg(definition.childId) - this.worldAngleDeg(definition.parentId));
  }

  public worldAngleDeg(bodyId: RigBodyId): number {
    const body = this.bodies.get(bodyId);
    return body ? Physics.worldAngleDeg(body.node) : 0;
  }

  public worldPointM(bodyId: RigBodyId, localPointM: readonly [number, number]): { x: number; y: number } {
    const body = this.bodies.get(bodyId);
    if (!body) return { x: 0, y: 0 };
    const point = new Vec2();
    body.getWorldPoint(new Vec2(Physics.units(localPointM[0]), Physics.units(localPointM[1])), point);
    return { x: Physics.meters(point.x), y: Physics.meters(point.y) };
  }

  public snapshot(): RagdollInstanceSnapshot {
    const positionsM: Record<string, { x: number; y: number }> = {};
    const massesKg: Record<string, number> = {};
    let finite = true;
    for (const [id, body] of this.bodies) {
      const position = Physics.positionM(body.node);
      positionsM[id] = { x: position.x, y: position.y };
      massesKg[id] = body.getMass();
      finite = finite && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(body.getMass());
    }
    let maxJointErrorM = 0;
    for (const joint of this.definition.jointDefinitions) {
      const parent = this.bodies.get(joint.parentId);
      const child = this.bodies.get(joint.childId);
      if (!parent || !child) { finite = false; continue; }
      const parentAnchor = new Vec2();
      const childAnchor = new Vec2();
      parent.getWorldPoint(new Vec2(Physics.units(joint.parentAnchorM[0]), Physics.units(joint.parentAnchorM[1])), parentAnchor);
      child.getWorldPoint(new Vec2(Physics.units(joint.childAnchorM[0]), Physics.units(joint.childAnchorM[1])), childAnchor);
      const errorM = Physics.meters(Math.hypot(parentAnchor.x - childAnchor.x, parentAnchor.y - childAnchor.y));
      maxJointErrorM = Math.max(maxJointErrorM, errorM);
      finite = finite && Number.isFinite(errorM);
    }
    return { id: this.id, bodyCount: this.bodies.size, jointCount: this.joints.size,
      bodyIds: this.definition.bodyDefinitions.map((body) => body.id),
      jointIds: this.definition.jointDefinitions.map((joint) => joint.id), positionsM, massesKg, maxJointErrorM, finite };
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy();
  }
}

function normalizeDegrees(value: number): number {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

/** Programmatic 11-body ragdoll builder. It owns no gameplay listeners and can be reset without reallocation. */
export class RagdollFactory {
  private readonly instances: RagdollInstanceImpl[] = [];
  private readonly previousCollision: { platform: number; ragdoll: number; projectile: number };
  private disposed = false;

  public constructor(private readonly definition: RigDefinition) {
    const matrix = PhysicsSystem2D.instance.collisionMatrix as CollisionMatrix & Record<string, number>;
    this.previousCollision = { platform: matrix[String(definition.collisionGroups.platform)] ?? 0,
      ragdoll: matrix[String(definition.collisionGroups.ragdoll)] ?? 0,
      projectile: matrix[String(definition.collisionGroups.projectile)] ?? 0 };
    // Ragdolls collide with platforms but not with one another or with non-adjacent self parts.
    matrix[String(definition.collisionGroups.platform)] = definition.collisionGroups.platform | definition.collisionGroups.ragdoll | definition.collisionGroups.projectile;
    matrix[String(definition.collisionGroups.ragdoll)] = definition.collisionGroups.platform | definition.collisionGroups.projectile;
    matrix[String(definition.collisionGroups.projectile)] = definition.collisionGroups.platform | definition.collisionGroups.ragdoll;
  }

  public spawn(parent: Node, id: string, positionM: readonly [number, number], hex: string): RagdollInstance {
    if (this.disposed) throw new Error('RagdollFactory 已释放');
    if (this.instances.some((instance) => instance.id === id)) throw new Error(`重复的 ragdoll ID：${id}`);
    const root = new Node(id);
    root.layer = parent.layer;
    root.parent = parent;
    Physics.place(root, positionM[0], positionM[1]);
    const bodyNodes = new Map<RigBodyId, Node>();
    const bodies = new Map<RigBodyId, RigidBody2D>();
    for (const bodyDefinition of this.definition.bodyDefinitions) {
      const node = new Node(bodyDefinition.id);
      node.layer = parent.layer;
      node.parent = root;
      node.setPosition(Physics.units(bodyDefinition.positionM[0]), Physics.units(bodyDefinition.positionM[1]), 0);
      const body = node.addComponent(RigidBody2D);
      body.type = ERigidBody2DType.Dynamic;
      body.group = this.definition.collisionGroups.ragdoll;
      body.linearDamping = 0.45;
      body.angularDamping = 0.65;
      body.allowSleep = true;
      const collider = bodyDefinition.shape === 'circle' ? node.addComponent(CircleCollider2D) : node.addComponent(BoxCollider2D);
      collider.group = this.definition.collisionGroups.ragdoll;
      collider.density = bodyDefinition.massKg / areaM2(bodyDefinition);
      collider.friction = 0.8;
      collider.restitution = 0;
      if (bodyDefinition.shape === 'circle') {
        (collider as CircleCollider2D).radius = Physics.units(bodyDefinition.sizeM[0] / 2);
      } else {
        (collider as BoxCollider2D).size.set(Physics.units(bodyDefinition.sizeM[0]), Physics.units(bodyDefinition.sizeM[1]));
      }
      collider.apply();
      configureGraphics(node.addComponent(Graphics), bodyDefinition, hex);
      bodyNodes.set(bodyDefinition.id, node);
      bodies.set(bodyDefinition.id, body);
    }
    const joints = new Map<string, HingeJoint2D>();
    for (const jointDefinition of this.definition.jointDefinitions) {
      const parentBody = bodies.get(jointDefinition.parentId);
      const childBody = bodies.get(jointDefinition.childId);
      if (!parentBody || !childBody) throw new Error(`关节 ${jointDefinition.id} 引用不存在的刚体`);
      const joint = parentBody.node.addComponent(HingeJoint2D);
      joint.anchor = new Vec2(Physics.units(jointDefinition.parentAnchorM[0]), Physics.units(jointDefinition.parentAnchorM[1]));
      joint.connectedAnchor = new Vec2(Physics.units(jointDefinition.childAnchorM[0]), Physics.units(jointDefinition.childAnchorM[1]));
      joint.connectedBody = childBody;
      joint.collideConnected = false;
      joint.enableLimit = true;
      joint.lowerAngle = jointDefinition.limitsDeg[0];
      joint.upperAngle = jointDefinition.limitsDeg[1];
      // T003 holds the neutral authored pose; T004 will replace this with active posture control.
      joint.enableMotor = true;
      joint.maxMotorTorque = this.definition.neutralMotorTorqueNm;
      joint.motorSpeed = 0;
      joint.apply();
      joints.set(jointDefinition.id, joint);
    }
    const instance = new RagdollInstanceImpl(id, root, bodyNodes, bodies, joints, this.definition, positionM);
    this.instances.push(instance);
    return instance;
  }

  public get activeInstances(): readonly RagdollInstance[] { return this.instances; }
  public resetAll(): void { for (const instance of this.instances) instance.reset(); }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const instance of this.instances) instance.destroy();
    const matrix = PhysicsSystem2D.instance.collisionMatrix as CollisionMatrix & Record<string, number>;
    matrix[String(this.definition.collisionGroups.platform)] = this.previousCollision.platform;
    matrix[String(this.definition.collisionGroups.ragdoll)] = this.previousCollision.ragdoll;
    matrix[String(this.definition.collisionGroups.projectile)] = this.previousCollision.projectile;
    this.instances.length = 0;
  }
}
