import { BoxCollider2D, Color, ERigidBody2DType, Graphics, Node, RigidBody2D } from 'cc';
import { PhysicsAdapter as Units, type PhysicsSettings } from './PhysicsAdapter';

export const PROBE = { x: 2, y: 8.5, dropX: 21, speed: 10, omega: Math.PI / 2, seconds: 1, tolerance: 0.02 };
function sampleBody(body: RigidBody2D) {
  const { x, y } = Units.positionM(body.node);
  const velocity = body.linearVelocity;
  return { positionM: { x, y }, angleRad: Units.radians(Units.worldAngleDeg(body.node)),
    angularVelocityRadps: body.angularVelocity, velocityMps: { x: velocity.x, y: velocity.y } };
}

/** Two real dynamic bodies, no contacts, one sampled simulated second. */
export class CalibrationProbe {
  private readonly glide: RigidBody2D;
  private readonly drop: RigidBody2D;
  private readonly count: number;
  private readonly start;
  public result: ReturnType<CalibrationProbe['measure']> | null = null;

  public constructor(world: Node, private readonly config: PhysicsSettings) {
    this.count = Math.round(PROBE.seconds / config.fixedTimeStepSec);
    if (Math.abs(this.count * config.fixedTimeStepSec - PROBE.seconds) > 1e-6) throw new Error('标定需要整步覆盖 1 秒');
    this.glide = this.body(world, 'GlideBody', PROBE.x, 0, '#F7C66F');
    this.drop = this.body(world, 'DropBody', PROBE.dropX, 1, '#7FE7DF');
    Units.setVelocity(this.glide, PROBE.speed, 0, PROBE.omega);
    this.start = { glide: sampleBody(this.glide), drop: sampleBody(this.drop) };
  }

  public afterStep(stepId: number): void {
    if (stepId !== this.count || this.result) return;
    this.result = this.measure(stepId);
    for (const body of [this.glide, this.drop]) {
      body.gravityScale = 0;
      Units.setVelocity(body, 0, 0);
    }
    console.info('[PhysicsLab AC01]', JSON.stringify(this.result));
  }

  private measure(steps: number) {
    const end = { glide: sampleBody(this.glide), drop: sampleBody(this.drop) };
    const seconds = steps * this.config.fixedTimeStepSec;
    const compare = (actual: number, expected: number) => {
      const error = Math.abs(actual - expected);
      return { actual, expected, error, passed: error <= PROBE.tolerance * Math.abs(expected) + 1e-6 };
    };
    const checks = {
      glideXM: compare(end.glide.positionM.x - this.start.glide.positionM.x, PROBE.speed * seconds),
      glideYM: compare(end.glide.positionM.y - this.start.glide.positionM.y, 0),
      angleRad: compare(end.glide.angleRad - this.start.glide.angleRad, PROBE.omega * seconds),
      angularVelocityRadps: compare(end.glide.angularVelocityRadps, PROBE.omega),
      dropYM: compare(end.drop.positionM.y - this.start.drop.positionM.y, this.config.gravityMps2[1] * seconds ** 2 / 2),
      dropVelocityMps: compare(end.drop.velocityMps.y, this.config.gravityMps2[1] * seconds),
    };
    return { steps, seconds, start: this.start, end, tolerance: PROBE.tolerance, checks,
      passed: Object.values(checks).every(({ passed }) => passed) };
  }

  private body(world: Node, name: string, x: number, gravityScale: number, tint: string): RigidBody2D {
    const node = new Node(name);
    node.layer = world.layer;
    node.parent = world;
    Units.place(node, x, PROBE.y);
    const body = node.addComponent(RigidBody2D);
    body.type = ERigidBody2DType.Dynamic;
    // Group 8 is reserved for calibration; group 4 is now the projectile group.
    body.group = 8;
    body.gravityScale = gravityScale;
    body.linearDamping = body.angularDamping = 0;
    const collider = node.addComponent(BoxCollider2D);
    collider.group = 8;
    collider.size.set(Units.units(0.85), Units.units(0.45));
    collider.apply();
    const g = node.addComponent(Graphics);
    g.fillColor = new Color().fromHEX(tint);
    g.rect(Units.units(-0.425), Units.units(-0.225), Units.units(0.85), Units.units(0.45));
    g.fill();
    g.fillColor = new Color().fromHEX('#163140');
    g.circle(Units.units(0.26), 0, Units.units(0.08));
    g.fill();
    return body;
  }
}
