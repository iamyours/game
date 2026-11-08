import type { BootManifest } from '../core/BootManifest.js';

export type RigBodyId =
  | 'head'
  | 'chest'
  | 'pelvis'
  | 'leftUpperArm'
  | 'leftForearm'
  | 'rightUpperArm'
  | 'rightForearm'
  | 'leftThigh'
  | 'leftShin'
  | 'rightThigh'
  | 'rightShin';

export type RigJointId =
  | 'neck'
  | 'waist'
  | 'leftShoulder'
  | 'leftElbow'
  | 'rightShoulder'
  | 'rightElbow'
  | 'leftHip'
  | 'leftKnee'
  | 'rightHip'
  | 'rightKnee';

export interface RigBodyDefinition {
  readonly id: RigBodyId;
  readonly shape: 'box' | 'circle';
  /** Local position relative to the actor root, in metres. */
  readonly positionM: readonly [number, number];
  /** Box width/height, or circle diameter, in metres. */
  readonly sizeM: readonly [number, number];
  readonly massKg: number;
}

export interface RigJointDefinition {
  readonly id: RigJointId;
  readonly parentId: RigBodyId;
  readonly childId: RigBodyId;
  /** Anchor in the parent body local space, in metres. */
  readonly parentAnchorM: readonly [number, number];
  /** Anchor in the child body local space, in metres. */
  readonly childAnchorM: readonly [number, number];
  readonly limitsDeg: readonly [number, number];
}

export interface RigDefinition {
  readonly configVersion: 2;
  readonly heightM: number;
  readonly massKg: number;
  readonly bodyCount: 11;
  readonly jointCount: 10;
  readonly bodyDefinitions: readonly RigBodyDefinition[];
  readonly jointDefinitions: readonly RigJointDefinition[];
  readonly neutralMotorTorqueNm: number;
  readonly collisionGroups: {
    readonly platform: number;
    readonly ragdoll: number;
    readonly projectile: number;
  };
  readonly adjacentSelfCollision: false;
  readonly otherSelfCollisionInitially: false;
  readonly downedAliveCanAim: true;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('RigDefinition 必须是对象');
  return value as Record<string, unknown>;
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`RigDefinition.${name} 必须是有限数字`);
  return value;
}
function positive(value: unknown, name: string): number {
  const result = finite(value, name);
  if (result <= 0) throw new Error(`RigDefinition.${name} 必须大于 0`);
  return result;
}
function pair(value: unknown, name: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`RigDefinition.${name} 必须是二元组`);
  return [finite(value[0], `${name}[0]`), finite(value[1], `${name}[1]`)] as const;
}
function positivePair(value: unknown, name: string): readonly [number, number] {
  const result = pair(value, name);
  if (result[0] <= 0 || result[1] <= 0) throw new Error(`RigDefinition.${name} 必须为正数二元组`);
  return result;
}
function id<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`RigDefinition.${name} 包含未知部位`);
  return value as T;
}

const bodyIds: readonly RigBodyId[] = ['head', 'chest', 'pelvis', 'leftUpperArm', 'leftForearm',
  'rightUpperArm', 'rightForearm', 'leftThigh', 'leftShin', 'rightThigh', 'rightShin'];
const jointIds: readonly RigJointId[] = ['neck', 'waist', 'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow',
  'leftHip', 'leftKnee', 'rightHip', 'rightKnee'];

/** Converts the generated rig resource into the immutable runtime contract used by RagdollFactory. */
export function readRigDefinition(raw: unknown, manifest: BootManifest): RigDefinition {
  const asset = raw as { seedHash?: unknown; data?: unknown } | null;
  if (!asset || asset.seedHash !== manifest.seedHash) throw new Error('RigDefinition 与启动清单不一致；请重新生成配置');
  const data = object(asset.data);
  if (data.configVersion !== manifest.configVersion || data.bodyCount !== 11 || data.jointCount !== 10) {
    throw new Error('RigDefinition 版本或刚体/关节数量不支持');
  }
  const rawBodies = data.bodyDefinitions;
  const rawJoints = data.jointDefinitions;
  if (!Array.isArray(rawBodies) || rawBodies.length !== 11 || !Array.isArray(rawJoints) || rawJoints.length !== 10) {
    throw new Error('RigDefinition 缺少 11 刚体或 10 关节定义');
  }
  const bodies = rawBodies.map((rawBody, index) => {
    const body = object(rawBody);
    return {
      id: id(body.id, bodyIds, `bodyDefinitions[${index}].id`),
      shape: body.shape === 'circle' || body.shape === 'box' ? body.shape : (() => { throw new Error('RigDefinition.shape 无效'); })(),
      positionM: pair(body.positionM, `bodyDefinitions[${index}].positionM`),
      sizeM: positivePair(body.sizeM, `bodyDefinitions[${index}].sizeM`),
      massKg: positive(body.massKg, `bodyDefinitions[${index}].massKg`),
    } as const;
  });
  const joints = rawJoints.map((rawJoint, index) => {
    const joint = object(rawJoint);
    const limits = pair(joint.limitsDeg, `jointDefinitions[${index}].limitsDeg`);
    if (limits[0] > limits[1]) throw new Error(`RigDefinition.jointDefinitions[${index}] 限位顺序无效`);
    return {
      id: id(joint.id, jointIds, `jointDefinitions[${index}].id`),
      parentId: id(joint.parentId, bodyIds, `jointDefinitions[${index}].parentId`),
      childId: id(joint.childId, bodyIds, `jointDefinitions[${index}].childId`),
      parentAnchorM: pair(joint.parentAnchorM, `jointDefinitions[${index}].parentAnchorM`),
      childAnchorM: pair(joint.childAnchorM, `jointDefinitions[${index}].childAnchorM`),
      limitsDeg: limits,
    } as const;
  });
  const collisionGroups = object(data.collisionGroups);
  const platform = positive(collisionGroups.platform, 'collisionGroups.platform');
  const ragdoll = positive(collisionGroups.ragdoll, 'collisionGroups.ragdoll');
  const projectile = positive(collisionGroups.projectile, 'collisionGroups.projectile');
  if (new Set([platform, ragdoll, projectile]).size !== 3 || (platform & (platform - 1)) !== 0 ||
      (ragdoll & (ragdoll - 1)) !== 0 || (projectile & (projectile - 1)) !== 0) {
    throw new Error('RigDefinition 碰撞组必须是不同的单 bit mask');
  }
  const bodySet = new Set(bodies.map((body) => body.id));
  const jointSet = new Set(joints.map((joint) => joint.id));
  if (bodySet.size !== 11 || jointSet.size !== 10) throw new Error('RigDefinition 部位或关节 ID 重复');
  for (const joint of joints) {
    if (joint.parentId === joint.childId) throw new Error(`RigDefinition.${joint.id} 不能连接同一刚体`);
  }
  const totalMass = bodies.reduce((sum, body) => sum + body.massKg, 0);
  if (Math.abs(totalMass - finite(data.massKg, 'massKg')) > 1e-6) throw new Error('RigDefinition 刚体质量总和不匹配');
  return {
    configVersion: 2,
    heightM: positive(data.heightM, 'heightM'),
    massKg: totalMass,
    bodyCount: 11,
    jointCount: 10,
    bodyDefinitions: bodies,
    jointDefinitions: joints,
    neutralMotorTorqueNm: positive(data.neutralMotorTorqueNm, 'neutralMotorTorqueNm'),
    collisionGroups: { platform, ragdoll, projectile },
    adjacentSelfCollision: false,
    otherSelfCollisionInitially: false,
    downedAliveCanAim: true,
  };
}
