import { z } from 'zod';

const finite = z.number().finite();
const positive = finite.positive();
const nonnegative = finite.nonnegative();
const count = z.number().int().positive();
const ratio = finite.min(0).max(1);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const vec2 = z.tuple([finite, finite]);
const ordered = (item: z.ZodNumber) => z.tuple([item, item]).refine(([a, b]) => a <= b, '下限不能大于上限');
const version = z.literal(2);
const arrowId = z.enum(['normal', 'impact', 'piercing']);
const enemyId = z.enum(['archer', 'armored', 'boss']);
const normalized = finite.min(0).max(1);
const normalizedRect = z.tuple([normalized, normalized, normalized, normalized])
  .refine(([x1, y1, x2, y2]) => x1 < x2 && y1 < y2, '热区必须有正面积');

const arrow = z.object({
  id: arrowId, baseDamage: positive, intervalSec: positive, speedMps: positive,
  staminaCost: nonnegative, impulseNs: positive, armorDamageFactor: positive,
  armorOverflow: z.boolean(), multiActorPenetration: z.literal(false),
}).strict();
const enemy = z.object({
  id: enemyId, hp: positive, helmetDurability: nonnegative,
  attackIntervalRangeSec: ordered(positive), telegraphSec: positive,
  aimErrorDeg: nonnegative, arrowBaseDamage: positive, speedMps: positive,
  exclusiveWave: z.boolean().optional(), sizeMultiplier: positive.optional(),
  massMultiplier: positive.optional(), phaseTwoHpRatio: ratio.optional(),
  phaseTwoIntervalMultiplier: positive.max(1).optional(),
  rigRequiresSeparateCalibration: z.boolean().optional(),
}).strict();
const reactionProfile = z.object({
  localWeight: ratio, neighborWeight: ratio, recoverySec: positive.max(2), neighborRecoverySec: positive.max(2),
}).strict();

export const combatSchema = z.object({
  configVersion: version,
  status: z.literal('seed_requires_runtime_calibration'),
  project: z.literal('storm_archers'),
  engine: z.object({
    family: z.literal('Cocos Creator 3.8 LTS'),
    patch: z.literal('discover_and_lock_in_T001'), physics: z.literal('Box2D 2D'),
  }).strict(),
  orientation: z.literal('landscape'),
  units: z.object({
    length: z.literal('m'), time: z.literal('s'), mass: z.literal('kg'),
    angleAuthoring: z.literal('deg'), angleLogic: z.literal('rad'),
    coordinateSystem: z.literal('x_right_y_up'), conversionOwner: z.literal('PhysicsAdapter'),
  }).strict(),
  viewport: z.object({
    designWidth: count, designHeight: count, worldWidthM: positive, worldHeightM: positive,
    worldCenterM: vec2, preserveCoreView: z.literal(true), followEachArrow: z.literal(false),
  }).strict(),
  input: z.object({
    aimZoneNormalized: normalizedRect,
    switchCenterNormalized: z.tuple([normalized, normalized]),
    joystickRadiusDesign: positive, deadzoneDesign: nonnegative, fullDrawDistanceDesign: positive,
    firstShotDelaySec: nonnegative, initialAimDeg: finite, minAimDeg: finite, maxAimDeg: finite,
    holdToFire: z.literal(false), pullBackToAim: z.literal(true), releaseStopsNewShots: z.literal(false),
    releaseToFire: z.literal(true), cancelNeverFires: z.literal(true),
    clearOnCancelPauseBackground: z.literal(true), switchResetsCooldown: z.literal(false),
    hideSwitchWhenOneArrow: z.literal(true), jumpEnabled: z.literal(false),
  }).strict(),
  bowControl: z.object({
    minPowerRatio: positive.max(1),
    bowArmReachM: positive.max(0.6), braceDepthM: positive.max(0.6),
    drawTravelM: positive.max(0.4), bowHalfHeightM: positive.max(0.8),
    drawFollowPerSec: positive.max(20), releaseFollowPerSec: positive.max(30),
    armMaxSpeedDegPerSec: positive.max(720), gripReadyToleranceM: positive.max(0.3),
  }).strict(),
  physics: z.object({
    fixedTimeStepSec: positive.max(1 / 30), gravityMps2: vec2,
    velocityIterations: count, positionIterations: count,
    bulletProjectiles: z.literal(true), sweptTipSupplement: z.literal(true),
    safeMutationAfterPhysics: z.literal(true), customSecondStepper: z.literal(false),
    steppingOwner: z.literal('PhysicsAdapter'), engineAutoSimulation: z.literal(false), maxStepsPerFrame: z.literal(5),
  }).strict(),
  player: z.object({
    hp: positive, stamina: positive, staminaRegenHeldPerSec: nonnegative,
    staminaRegenReleasedPerSec: nonnegative, permanentDisarm: z.literal(false),
    armRecoveryRangeSec: ordered(positive),
  }).strict(),
  damage: z.object({
    zoneMultipliers: z.object({ head: positive, torso: positive, limb: positive }).strict(),
    rounding: z.literal('ceil_zone_damage_then_ceil_hp_after_armor'),
    sameStepMutualDeath: z.literal('lose'), deadBodyTakesDamage: z.literal(false),
  }).strict(),
  arrows: z.array(arrow).length(3),
  reaction: z.object({
    impulseCalibrationRequired: z.literal(true), maxSingleImpulseNs: positive,
    playerMaxIncomingImpulseNs: positive, enemyArmTraumaToDisarm: positive,
    armTraumaSource: z.literal('ceil_zone_damage_before_armor'), armTraumaDecayPerSec: nonnegative,
    repeatDisarmAllowed: z.literal(false), liveLimbSevering: z.literal(false),
    jointWeights: z.literal('tune_in_T004_T008'),
    profiles: z.object({ normal: reactionProfile, impact: reactionProfile, piercing: reactionProfile }).strict(),
  }).strict(),
  enemies: z.array(enemy).length(3),
  run: z.object({
    waveTransitionSec: nonnegative, clearFlyingArrowsAtTransition: z.literal(true),
    fireDuringTransition: z.literal(false), firstEnemyShotMinSec: nonnegative,
    enemyAttackStartSeparationSec: nonnegative, fallKillY_M: finite,
    disarmedCountsAsDead: z.literal(false),
  }).strict(),
  pickups: z.object({
    ids: z.tuple([z.literal('red'), z.literal('green')]), spawnIntervalRangeSec: ordered(positive),
    maxAlive: count, ttlSec: positive, redHp: positive, greenStamina: positive,
    playerArrowConsumed: z.literal(true), enemyCollects: z.literal(false),
    requireReachabilityValidation: z.literal(true),
  }).strict(),
  limits: z.object({
    maxLiveEnemies: count.max(2), maxFlyingArrows: count.max(24), maxEmbeddedVisuals: count.max(24),
    maxEmbeddedPerActor: count.max(6), maxCorpses: count.max(2), maxPhysicalEquipmentDrops: count.max(6),
    corpseTtlSec: positive, equipmentTtlSec: positive, projectileTtlSec: positive,
    normalBodiesTarget: count.max(80), peakBodiesBudget: count.max(110),
  }).strict(),
  save: z.object({
    schemaVersion: z.literal(1), persistMidRunPhysics: z.literal(false),
    progression: z.literal('level_and_arrow_unlocks_only'),
  }).strict(),
  feelTargets: z.object({
    normalMidrangeDistanceM: ordered(positive), normalMidrangeFlightSec: ordered(positive),
    validated: z.literal(false), requiresProductPlaytest: z.literal(true),
  }).strict(),
}).strict();

const rigBodyId = z.enum(['head', 'chest', 'pelvis', 'leftUpperArm', 'leftForearm', 'rightUpperArm',
  'rightForearm', 'leftThigh', 'leftShin', 'rightThigh', 'rightShin']);
const rigJointId = z.enum(['neck', 'waist', 'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow',
  'leftHip', 'leftKnee', 'rightHip', 'rightKnee']);
const rigPair = z.tuple([finite, finite]);
const rigPositivePair = z.tuple([positive, positive]);
export const rigSchema = z.object({
  configVersion: version, status: z.literal('runtime_spec_ready_requires_stability'),
  heightM: positive, massKg: positive, bodyCount: z.literal(11), jointCount: z.literal(10),
  partGroups: z.array(z.object({
    id: z.enum(['head', 'chest', 'pelvis', 'arms', 'legs']), count,
    massFractionTotal: positive.max(1),
  }).strict()).length(5),
  logicalJointLimitsDeg: z.object({
    neck: ordered(finite), waist: ordered(finite), shoulder: ordered(finite),
    elbow: ordered(finite), hip: ordered(finite), knee: ordered(finite),
  }).strict(),
  bodyDefinitions: z.array(z.object({
    id: rigBodyId, shape: z.enum(['box', 'circle']), positionM: rigPair, sizeM: rigPositivePair, massKg: positive,
  }).strict()).length(11),
  jointDefinitions: z.array(z.object({
    id: rigJointId, parentId: rigBodyId, childId: rigBodyId,
    parentAnchorM: rigPair, childAnchorM: rigPair, limitsDeg: ordered(finite),
  }).strict()).length(10),
  collisionGroups: z.object({ platform: z.number().int().positive(), ragdoll: z.number().int().positive(), projectile: z.number().int().positive() }).strict(),
  neutralMotorTorqueNm: positive,
  anchors: z.literal('calibrate_and_write_in_T003'),
  motorGains: z.literal('calibrate_and_write_in_T004'),
  relativeReferenceAngles: z.literal('calibrate_separately_for_left_and_right'),
  noNegativePhysicsScale: z.literal(true), adjacentSelfCollision: z.literal(false),
  otherSelfCollisionInitially: z.literal(false), downedAliveCanAim: z.literal(true),
}).strict();

export const levelsSchema = z.object({
  configVersion: version, status: z.literal('seed_requires_reachability_and_runtime_test'),
  coordinateSystem: z.literal('metres_x_right_y_up_platform_surface'),
  platforms: z.array(z.object({
    id, centerX_M: finite, surfaceY_M: finite, widthM: positive, thicknessM: positive,
    breakable: z.literal(false),
  }).strict()).min(2),
  playerPlatformId: id,
  levels: z.array(z.object({
    id, name: z.string().min(1), sceneId: id,
    waves: z.array(z.array(z.object({
      enemyId, platformId: id, spawnDelaySec: nonnegative,
    }).strict()).min(1).max(2)).length(3),
    unlockArrow: arrowId.nullable(), unlockLevel: id.nullable(),
  }).strict()).length(3),
}).strict();

export const platformSchema = z.object({
  configVersion: version, orientation: z.literal('landscape'),
  web: z.object({ purpose: z.literal('development_baseline'), verified: z.literal(false) }).strict(),
  wechat: z.object({ target: z.literal('minigame'), appId: z.literal('set_locally'), verified: z.literal(false) }).strict(),
  taptap: z.object({
    selectedPath: z.literal('android_apk'),
    alternativePaths: z.tuple([z.literal('ordinary_minigame'), z.literal('h5_minigame')]),
    pathDecisionRequiredBeforeT016: z.literal(true), verified: z.literal(false),
  }).strict(),
  commercialFeaturesEnabled: z.literal(false),
}).strict();

export const seedPackSchema = z.object({
  combat: combatSchema, rig: rigSchema, levels: levelsSchema, platform: platformSchema,
}).strict();
export type SeedPack = z.infer<typeof seedPackSchema>;
