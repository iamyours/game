import { ERaycast2DType, type HingeJoint2D, PHYSICS_2D_PTM_RATIO, PhysicsSystem2D, RigidBody2D, Vec2, Vec3, Node } from 'cc';
import { FixedStepClock } from '../domain/FixedStepClock';

export interface PhysicsSettings {
  fixedTimeStepSec: number;
  gravityMps2: readonly [number, number];
  velocityIterations: number;
  positionIterations: number;
  maxStepsPerFrame: number;
}

/** All Cocos/Box2D unit differences and the sole runtime stepping path live here. */
export class PhysicsAdapter {
  private static owner: PhysicsAdapter | null = null;
  private readonly system = PhysicsSystem2D.instance;
  private readonly clock: FixedStepClock;
  private readonly previous: PhysicsSettings & { autoSimulation: boolean; enable: boolean };
  private paused = false;
  private discardFrame = false;
  private disposed = false;
  private stepId = 0;

  public constructor(settings: PhysicsSettings) {
    if (PhysicsAdapter.owner) throw new Error('PhysicsAdapter 已有步进所有者');
    if (!PhysicsSystem2D.PHYSICS_BOX2D) throw new Error('PhysicsLab 需要锁定的 Box2D 2D 后端');
    this.clock = new FixedStepClock(settings.fixedTimeStepSec, settings.maxStepsPerFrame);
    const s = this.system;
    this.previous = { autoSimulation: s.autoSimulation, enable: s.enable, fixedTimeStepSec: s.fixedTimeStep,
      gravityMps2: [PhysicsAdapter.meters(s.gravity.x), PhysicsAdapter.meters(s.gravity.y)],
      velocityIterations: s.velocityIterations, positionIterations: s.positionIterations, maxStepsPerFrame: settings.maxStepsPerFrame };
    s.autoSimulation = false; // Never run Cocos auto and explicit fixed steps together.
    s.enable = true;
    this.configure(settings);
    s.resetAccumulator();
    PhysicsAdapter.owner = this;
  }

  public static units(meters: number): number { return meters * PHYSICS_2D_PTM_RATIO; }
  public static meters(units: number): number { return units / PHYSICS_2D_PTM_RATIO; }
  public static radians(degrees: number): number { return degrees * Math.PI / 180; }
  public static degrees(radians: number): number { return radians * 180 / Math.PI; }
  /** Euler XYZ decomposes rotations beyond 90° into X/Y flips; use signed planar yaw. */
  public static worldAngleDeg(node: Node): number {
    const q = node.worldRotation;
    return this.degrees(Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z)));
  }
  public static positionM(node: Node): Vec3 {
    const p = node.worldPosition;
    return new Vec3(this.meters(p.x), this.meters(p.y), this.meters(p.z));
  }
  public static place(node: Node, xM: number, yM: number, zM = 0): void {
    node.setWorldPosition(this.units(xM), this.units(yM), this.units(zM));
  }

  // Creator 3.8.8 Box2D RigidBody2D forwards velocity (m/s, rad/s) and impulses (N·s) as-is.
  public static setVelocity(body: RigidBody2D, xMps: number, yMps: number, radiansPerSec = 0): void {
    body.linearVelocity = new Vec2(xMps, yMps);
    body.angularVelocity = radiansPerSec;
  }
  /** Called only outside a native step. Stop colliders now; Node.destroy itself is frame-deferred. */
  public static retire(node: Node): void {
    if (!node.isValid) return;
    node.active = false;
    node.destroy();
  }

  public static applyImpulse(body: RigidBody2D, xNs: number, yNs: number, worldXM: number, worldYM: number): void {
    body.applyLinearImpulse(new Vec2(xNs, yNs), new Vec2(this.units(worldXM), this.units(worldYM)), true);
  }

  /** Explicit reset only: sync the teleported pose before the next step can restore the old native pose. */
  public static syncResetPose(body: RigidBody2D): void {
    // Creator 3.8.8 Box2D-JS's body bridge; these two methods are absent from the public declarations.
    const { impl } = body as unknown as { impl: {
      syncPositionToPhysics(animated: boolean): void; syncRotationToPhysics(animated: boolean): void;
    } };
    impl.syncPositionToPhysics(false);
    impl.syncRotationToPhysics(false);
  }

  // Creator 3.8.8 Box2D-JS live setter forwards radians/s; initial joint creation converts degrees.
  public static setMotorSpeed(joint: HingeJoint2D, degreesPerSec: number): void {
    joint.motorSpeed = this.radians(degreesPerSec);
  }

  public static raycastM(start: { x: number; y: number }, end: { x: number; y: number }, mask: number) {
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-7) return [];
    return PhysicsSystem2D.instance.raycast(new Vec2(this.units(start.x), this.units(start.y)),
      new Vec2(this.units(end.x), this.units(end.y)), ERaycast2DType.AllClosest, mask)
      .map(({ collider, point, normal, fraction }) => ({ collider, pointM: this.pointM(point), normal: { x: normal.x, y: normal.y }, fraction }));
  }

  public static pointM(point: { x: number; y: number }) { return { x: this.meters(point.x), y: this.meters(point.y) }; }
  public static testPointM(point: { x: number; y: number }) {
    return PhysicsSystem2D.instance.testPoint(new Vec2(this.units(point.x), this.units(point.y)));
  }

  public get steps(): number { return this.stepId; }

  /** Locked 3.8.8 Box2D-JS instrumentation; unsupported backends report unknown. */
  public nativeCounts(): { bodies: number; joints: number } | null {
    const world = (this.system.physicsWorld as unknown as { _world?: {
      GetBodyCount?: () => number; GetJointCount?: () => number;
    } })._world;
    if (typeof world?.GetBodyCount !== 'function' || typeof world?.GetJointCount !== 'function') return null;
    return { bodies: world.GetBodyCount(), joints: world.GetJointCount() };
  }

  public setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.clock.reset();
    this.discardFrame = !paused;
  }

  public advance(frameSec: number, before: (dt: number, stepId: number) => void,
    after: (dt: number, stepId: number) => void): void {
    if (this.disposed || this.paused) return;
    if (this.discardFrame) { this.discardFrame = false; return; }
    this.clock.advance(frameSec, (dt) => {
      const id = ++this.stepId;
      before(dt, id);
      this.system.physicsWorld.syncSceneToPhysics();
      // Manual step doesn't run Cocos's auto path's delayed operations or BEFORE/AFTER events.
      // All gameplay contact callbacks must only queue immutable data; mutate from `after`.
      this.stepNativeAndPublish(dt);
      after(dt, id);
    });
  }

  /**
   * Mirror 3.8.8's auto-path feedback guard. Manual step() alone never sets it.
   * Otherwise publishing a body angle to a node immediately writes its wrapped
   * Euler angle back to Box2D, breaking hinge limits as a forearm crosses ±180°.
   */
  private stepNativeAndPublish(dt: number): void {
    const internal = this.system as unknown as { _steping: boolean;
      _delayEvents: { target: object; func: (this: object) => void }[] };
    const world = this.system.physicsWorld as unknown as { _bodies: { rigidBody: RigidBody2D }[] };
    internal._steping = true;
    try {
      this.system.step(dt);
      const events = internal._delayEvents;
      for (let i = 0; i < events.length; i++) events[i]!.func.call(events[i]!.target);
      events.length = 0;
      this.system.physicsWorld.syncPhysicsToScene();
      // These flags were produced by the physics publish, not by gameplay.
      // Consume them so a second fixed substep in the SAME render frame cannot
      // feed wrapped node angles back to native bodies. New external edits mark fresh flags.
      for (const { rigidBody } of world._bodies) {
        rigidBody.node.hasChangedFlags &= ~(Node.TransformBit.POSITION | Node.TransformBit.ROTATION);
      }
    } finally { internal._steping = false; }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.configure(this.previous);
    this.system.resetAccumulator();
    this.system.enable = this.previous.enable;
    this.system.autoSimulation = this.previous.autoSimulation;
    PhysicsAdapter.owner = null;
  }

  private configure(settings: PhysicsSettings): void {
    const s = this.system;
    s.fixedTimeStep = settings.fixedTimeStepSec;
    s.velocityIterations = settings.velocityIterations;
    s.positionIterations = settings.positionIterations;
    // Unlike velocity, PhysicsSystem2D.gravity expects scene units/s².
    const [gx, gy] = settings.gravityMps2;
    s.gravity = new Vec2(PhysicsAdapter.units(gx), PhysicsAdapter.units(gy));
  }
}
