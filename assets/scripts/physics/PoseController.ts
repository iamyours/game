import { PhysicsAdapter as Physics } from './PhysicsAdapter';
import type { RagdollInstance } from './RagdollFactory';
import type { RigJointId, RigDefinition } from './RigDefinition';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { armGeometry, solveArm, postureMotorAuthority, type ArmGeometry, type PhysicalPose } from '../domain/archery';
import { ReactionWeights, type JointReaction } from '../domain/reaction';

export type PoseName = PhysicalPose;

export interface PoseControllerSnapshot {
  readonly pose: PoseName;
  readonly aimRad: number;
  readonly armControlWeight: number;
  readonly drawing: boolean;
  readonly drawAmount: number;
  readonly alive: boolean;
  readonly jointControlWeights: Readonly<Record<string, number>>;
}

const JOINTS: readonly RigJointId[] = ['neck', 'waist', 'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow',
  'leftHip', 'leftKnee', 'rightHip', 'rightKnee'];

// Opposite hip angles widen the support base; bending both knees the same way drifts sideways.
const POSES: Readonly<Record<PoseName, Readonly<Record<RigJointId, number>>>> = {
  standing: { neck: 0, waist: 0, leftShoulder: 8, leftElbow: 24, rightShoulder: -8, rightElbow: 24,
    leftHip: -12, leftKnee: 0, rightHip: 12, rightKnee: 0 },
  staggered: { neck: 10, waist: -16, leftShoulder: 18, leftElbow: 38, rightShoulder: -22, rightElbow: 42,
    leftHip: -8, leftKnee: 24, rightHip: 10, rightKnee: 30 },
  // Non-arm targets have zero authority in downed; arms are replaced by world-space IK.
  downed: { neck: 0, waist: 0, leftShoulder: 0, leftElbow: 0, rightShoulder: 0, rightElbow: 0,
    leftHip: 0, leftKnee: 0, rightHip: 0, rightKnee: 0 },
};

/**
 * Drives the authored rig through constrained hinge motors. It never writes a
 * rigid body's transform; Box2D remains responsible for the actual pose.
 */
export class PoseController {
  private pose: PoseName = 'standing';
  private aimRad = Math.PI / 10;
  private armTraumaUntil = 0;
  private armControlWeight = 1;
  private elapsed = 0;
  private warmupRemaining = 0.5;
  private alive = true;
  private readonly reactions = new ReactionWeights();

  private drawing = false;
  private requestedDraw = 0;
  private drawAmount = 0;
  private readonly rightArm: ArmGeometry;
  private readonly leftArm: ArmGeometry;
  private readonly baseTorqueNm: number;

  public constructor(private readonly ragdoll: RagdollInstance, rig: RigDefinition,
    private readonly bow: PhysicsLabConfig['bowControl']) {
    this.baseTorqueNm = rig.neutralMotorTorqueNm;
    this.rightArm = armGeometry(rig, 'right');
    this.leftArm = armGeometry(rig, 'left');
  }

  public setDraw(drawing: boolean, progress: number): void {
    this.drawing = drawing && this.alive;
    this.requestedDraw = this.drawing ? Math.max(0, Math.min(1, progress)) : 0;
  }

  public get handsSnapshot() {
    const bowGrip = this.ragdoll.worldPointM('rightForearm', this.rightArm.gripLocalM);
    const stringGrip = this.ragdoll.worldPointM('leftForearm', this.leftArm.gripLocalM);
    const shoulder = this.ragdoll.worldPointM('chest', this.rightArm.shoulderAnchorM);
    const dx = Math.cos(this.aimRad), dy = Math.sin(this.aimRad);
    const bowTarget = { x: shoulder.x + dx * this.bow.bowArmReachM, y: shoulder.y + dy * this.bow.bowArmReachM };
    const depth = this.bow.braceDepthM + this.bow.drawTravelM * this.drawAmount;
    const stringTarget = { x: bowGrip.x - dx * depth, y: bowGrip.y - dy * depth };
    const bowErrorM = Math.hypot(bowGrip.x - bowTarget.x, bowGrip.y - bowTarget.y);
    const stringErrorM = Math.hypot(stringGrip.x - stringTarget.x, stringGrip.y - stringTarget.y);
    return { bowGrip, stringGrip, bowTarget, stringTarget, bowErrorM, stringErrorM,
      ready: this.alive && this.warmupRemaining <= 0 && Math.max(bowErrorM, stringErrorM) <= this.bow.gripReadyToleranceM };
  }

  public get snapshot(): PoseControllerSnapshot {
    return { pose: this.pose, aimRad: this.aimRad, armControlWeight: this.armControlWeight,
      drawing: this.drawing, drawAmount: this.drawAmount, alive: this.alive,
      jointControlWeights: Object.fromEntries(JOINTS.map(joint => [joint, this.controlWeight(joint)])) };
  }

  public reset(): void {
    this.pose = 'standing';
    this.drawing = false; this.requestedDraw = this.drawAmount = 0;
    this.elapsed = this.armTraumaUntil = 0;
    this.armControlWeight = 1;
    this.warmupRemaining = 0.5;
    this.alive = true; this.reactions.clear();
  }

  public setPose(pose: PoseName): void {
    this.pose = pose;
    if (pose === 'downed') {
      // Do not retain the factory's high-torque warmup or last frame's leg targets.
      this.warmupRemaining = 0;
      for (const joint of JOINTS) if (postureMotorAuthority(joint, pose, this.alive) === 0) {
        this.ragdoll.setJointMotor(joint, 0, 0, 0);
      }
    }
  }
  public setAimRad(aimRad: number): void { this.aimRad = aimRad; }
  public registerHit(reactions: readonly JointReaction[]): void {
    this.reactions.register(reactions);
    if (reactions.length) this.warmupRemaining = 0;
  }
  public setAlive(alive: boolean): void {
    this.alive = alive;
    if (!alive) {
      this.drawing = false; this.drawAmount = this.requestedDraw = 0;
      for (const joint of JOINTS) this.ragdoll.setJointMotor(joint, 0, 0, 0);
    }
  }

  /** Temporarily lowers only the arm motor authority after a local hit. */
  public registerArmTrauma(durationSec = 0.35, controlWeight = 0.35): void {
    this.armTraumaUntil = Math.max(this.armTraumaUntil, this.elapsed + durationSec);
    this.armControlWeight = Math.min(this.armControlWeight, Math.max(0, Math.min(1, controlWeight)));
  }

  public step(dt: number): void {
    if (!this.alive) return;
    this.reactions.step(dt);
    this.elapsed += dt;
    const change = this.requestedDraw - this.drawAmount;
    const rate = change < 0 ? this.bow.releaseFollowPerSec : this.bow.drawFollowPerSec;
    this.drawAmount += Math.max(-rate * dt, Math.min(rate * dt, change));
    if (this.pose === 'standing') this.balanceStandingChest();
    // Let the authored neutral motors absorb the first contact correction after spawn.
    // This keeps T003's stability baseline intact while the active controller takes over.
    if (this.warmupRemaining > 0) {
      this.warmupRemaining = Math.max(0, this.warmupRemaining - dt);
      return;
    }
    if (this.elapsed >= this.armTraumaUntil) this.armControlWeight = 1;
    const targets = { ...POSES[this.pose] };
    const chestRad = Physics.radians(this.ragdoll.worldAngleDeg('chest'));
    const hands = this.handsSnapshot;
    const rightShoulder = this.ragdoll.worldPointM('chest', this.rightArm.shoulderAnchorM);
    const leftShoulder = this.ragdoll.worldPointM('chest', this.leftArm.shoulderAnchorM);
    const hold = solveArm(this.rightArm, rightShoulder, hands.bowTarget, chestRad);
    const pull = solveArm(this.leftArm, leftShoulder, hands.stringTarget, chestRad);
    targets.rightShoulder = Physics.degrees(hold.shoulderRad);
    targets.rightElbow = Physics.degrees(hold.elbowRad);
    targets.leftShoulder = Physics.degrees(pull.shoulderRad);
    targets.leftElbow = Physics.degrees(pull.elbowRad);
    const controlTorque = Math.min(12, this.baseTorqueNm * 0.1);
    for (const jointId of JOINTS) {
      const arm = jointId.endsWith('Shoulder') || jointId.endsWith('Elbow');
      const weight = this.controlWeight(jointId);
      this.ragdoll.setJointMotor(jointId, targets[jointId], controlTorque * weight,
        weight === 0 ? 0 : arm ? this.bow.armMaxSpeedDegPerSec : 135);
    }
  }

  private controlWeight(joint: RigJointId): number {
    const arm = joint.endsWith('Shoulder') || joint.endsWith('Elbow');
    return postureMotorAuthority(joint, this.pose, this.alive) * this.reactions.weight(joint) * (arm ? this.armControlWeight : 1);
  }

  private balanceStandingChest(): void {
    // Hinge targets control relative angles, not the whole rig's world tilt.
    // Fade out outside the standing envelope so this cannot pull a fallen actor upright.
    const chest = this.ragdoll.bodies.get('chest');
    if (!chest) return;
    const tilt = Physics.radians(this.ragdoll.worldAngleDeg('chest'));
    const weight = Math.max(0, Math.min(1, (Physics.radians(35) - Math.abs(tilt)) / Physics.radians(15)));
    if (weight === 0) return;
    const torqueNm = -65 * tilt - 8 * chest.angularVelocity;
    const limitNm = Math.min(18, this.baseTorqueNm * 0.15);
    chest.applyTorque(Math.max(-limitNm, Math.min(limitNm, torqueNm)) * weight * this.reactions.weight('waist'), false);
  }
}
