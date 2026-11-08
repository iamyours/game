import { PhysicsAdapter as Physics } from './PhysicsAdapter';
import type { RagdollInstance } from './RagdollFactory';
import { PoseController, type PoseControllerSnapshot } from './PoseController';
import type { JointReaction } from '../domain/reaction';

export interface BowSocketSnapshot {
  readonly x: number;
  readonly y: number;
  readonly angleRad: number;
}

/** World-space aim façade. The socket is sampled from the real forearm body. */
export class AimController {
  public constructor(private readonly ragdoll: RagdollInstance, private readonly pose: PoseController) {}

  public reset(): void { this.pose.reset(); }
  public setWorldAim(angleRad: number): void { this.pose.setAimRad(angleRad); }
  public setPose(pose: Parameters<PoseController['setPose']>[0]): void { this.pose.setPose(pose); }
  public registerArmTrauma(durationSec?: number, controlWeight?: number): void {
    this.pose.registerArmTrauma(durationSec, controlWeight);
  }
  public setDraw(drawing: boolean, progress: number): void { this.pose.setDraw(drawing, progress); }
  public registerHit(reactions: readonly JointReaction[]): void { this.pose.registerHit(reactions); }
  public setAlive(alive: boolean): void { this.pose.setAlive(alive); }
  public setArmed(armed: boolean): void { this.pose.setArmed(armed); }
  public get handsSnapshot() { return this.pose.handsSnapshot; }
  public step(dt: number): void { this.pose.step(dt); }
  public get poseSnapshot(): PoseControllerSnapshot { return this.pose.snapshot; }

  public bowSocket(): BowSocketSnapshot {
    const point = this.ragdoll.worldPointM('rightForearm', [0.12 * (this.ragdoll.definition.facing ?? 1), -0.07]);
    return { x: point.x, y: point.y, angleRad: this.pose.snapshot.aimRad };
  }
}
