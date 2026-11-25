import * as THREE from 'three';
import { initRenderer } from './renderer/setup';
import { PhysicsEngine, type RigidBodyReadbackState } from './physics/PhysicsEngine';
import type { AvbdBodySolveMode } from './physics/types';
import { AVBD_FRICTION_STATIC } from './physics/avbdParams';
import { applyReferenceAvbdConfig } from './app/avbdReferenceConfig';
import { createTrackedBodyVisualSet } from './scene/trackedBodyVisuals';
import { createTrackedSpringVisualSet } from './scene/trackedSpringVisuals';

type ScenarioStatus = 'pending' | 'running' | 'pass' | 'fail';

type ScenarioResult = {
  status: Exclude<ScenarioStatus, 'pending' | 'running'>;
  metrics: string[];
  notes: string;
};

type ScenarioDefinition = {
  id: string;
  label: string;
  reference: string;
  description: string;
  run: (context: ScenarioRunContext) => Promise<ScenarioResult>;
};

type ScenarioRunContext = {
  renderer: any;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  device: GPUDevice;
  bodySolveMode: AvbdBodySolveMode;
  frameBatchSize: number;
  setActiveWorld: (world: ScenarioWorld | null) => void;
  clearActiveWorld: (world: ScenarioWorld) => void;
  retainWorld: (dispose: () => void) => void;
  releaseRetainedWorld: () => void;
  setRenderedFrame: (label: string | null, frame: number) => void;
  updateProgress: (message: string, progressFraction?: number) => void;
};

type BodyMetricSummary = {
  maxLateralDisplacement: number;
  maxLateralSpeed: number;
  maxHeight: number;
  minHeight: number;
};

type JointScenarioMetrics = BodyMetricSummary & {
  maxJointError: number;
  maxActiveContacts: number;
  maxAbsHeight: number;
};

type SpringMetricDescriptor = {
  bodyA: number | null;
  bodyB: number;
  anchorA: [number, number, number];
  anchorB: [number, number, number];
  restLength: number;
  stiffness: number;
};

type BridgeScenarioMetrics = JointScenarioMetrics & {
  maxCenterSag: number;
};

type CollisionFilterOptions = {
  collisionGroup?: number;
  collisionMask?: number;
};

type ScenarioWorld = {
  physics: PhysicsEngine;
  addStaticFloor: (filter?: CollisionFilterOptions) => number;
  addDynamicBox: (
    position: [number, number, number],
    friction?: number,
    linearVelocity?: [number, number, number],
    mass?: number,
    halfExtents?: [number, number, number],
    filter?: CollisionFilterOptions,
  ) => number;
  addDynamicSphere: (
    position: [number, number, number],
    radius?: number,
    friction?: number,
    linearVelocity?: [number, number, number],
    mass?: number,
    filter?: CollisionFilterOptions,
  ) => number;
  addSphericalJoint: (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness?: number,
  ) => number;
  addFixedJoint: (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness?: number,
  ) => number;
  addSpring: (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness?: number,
    restLength?: number,
  ) => number;
  addVerticalStack: (count: number, friction?: number) => number[];
  ignoreCollisionPair: (bodyA: number, bodyB: number, ignored?: boolean) => void;
  getSpawnPosition: (body: number) => [number, number, number] | undefined;
  syncVisuals: () => void;
  dispose: () => void;
};

type ScenarioView = {
  position: [number, number, number];
  target: [number, number, number];
};

const HALF_EXTENTS: [number, number, number] = [0.3, 0.3, 0.3];
const FLOOR_HALF_EXTENTS: [number, number, number] = [100.0, 0.5, 100.0];
const DEFAULT_SPHERE_RADIUS = 0.75;
const FIXED_DT = 1 / 60;
const FRAMES_PER_TICK = 12;
const DEFAULT_BODY_SOLVE_MODE: AvbdBodySolveMode = 'colored';
const REFERENCE_CHAIN_BODY_MASS = 500.0 * 8.0 * HALF_EXTENTS[0] * HALF_EXTENTS[1] * HALF_EXTENTS[2];
const COLLISION_GROUP_WORLD = 0x01;
const COLLISION_GROUP_PLANK = 0x02;
const COLLISION_GROUP_LOAD = 0x04;

const DEFAULT_SCENARIO_VIEW: ScenarioView = {
  position: [6.5, 5.4, 8.0],
  target: [0.0, 1.6, 0.0],
};

const SCENARIO_VIEWS: Record<string, ScenarioView> = {
  'single-box-resting': DEFAULT_SCENARIO_VIEW,
  'two-box-stack': DEFAULT_SCENARIO_VIEW,
  'ten-box-tower': {
    position: [6.5, 7.0, 10.5],
    target: [0.0, 3.0, 0.0],
  },
  'friction-holds': {
    position: [7.0, 4.6, 10.5],
    target: [0.0, 1.4, 0.0],
  },
  'sphere-resting': DEFAULT_SCENARIO_VIEW,
  'two-sphere-stack': DEFAULT_SCENARIO_VIEW,
  'single-spring': {
    position: [5.5, 8.5, 13.5],
    target: [0.0, 4.8, 0.0],
  },
  'spring-ratio': {
    position: [0.0, 11.5, 28.0],
    target: [0.0, 9.0, 0.0],
  },
  'spherical-joint-chain': {
    position: [7.5, 7.2, 11.5],
    target: [0.0, 4.8, 0.0],
  },
  'fixed-joint-chain': {
    position: [7.5, 7.2, 11.5],
    target: [0.0, 4.8, 0.0],
  },
  'bridge-sag': {
    position: [0.0, 15.0, 38.0],
    target: [0.0, 9.5, 0.0],
  },
};

function boxMassFromDensity(
  halfExtents: [number, number, number],
  density: number,
): number {
  const volume = halfExtents[0] * 2.0 * halfExtents[1] * 2.0 * halfExtents[2] * 2.0;
  return volume * density;
}

function sphereMassFromDensity(radius: number, density: number): number {
  const volume = (4.0 / 3.0) * Math.PI * radius * radius * radius;
  return volume * density;
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
    return value.toExponential(3);
  }
  return value.toFixed(5);
}

function applyScenarioView(camera: THREE.PerspectiveCamera, scenarioId: string): void {
  const view = SCENARIO_VIEWS[scenarioId] ?? DEFAULT_SCENARIO_VIEW;
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.lookAt(view.target[0], view.target[1], view.target[2]);
  camera.updateProjectionMatrix();
}

function lateralDisplacement(
  state: RigidBodyReadbackState,
  getSpawnPosition?: (body: number) => [number, number, number] | undefined,
): number {
  const spawn = getSpawnPosition?.(state.body);
  const origin = spawn ?? state.initialPosition;
  const dx = state.position[0] - origin[0];
  const dz = state.position[2] - origin[2];
  return Math.hypot(dx, dz);
}

function lateralSpeed(state: RigidBodyReadbackState): number {
  return Math.hypot(state.velocity[0], state.velocity[2]);
}

function rotateLocalPoint(
  localPoint: [number, number, number],
  quaternion: [number, number, number, number],
): [number, number, number] {
  const qx = quaternion[0];
  const qy = quaternion[1];
  const qz = quaternion[2];
  const qw = quaternion[3];
  const vx = localPoint[0];
  const vy = localPoint[1];
  const vz = localPoint[2];

  const ix =  qw * vx + qy * vz - qz * vy;
  const iy =  qw * vy + qz * vx - qx * vz;
  const iz =  qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

type JointMetricDescriptor = {
  bodyA: number | null;
  bodyB: number;
  anchorA: [number, number, number];
  anchorB: [number, number, number];
};

function computeJointAnchorError(
  statesByBody: Map<number, RigidBodyReadbackState>,
  joint: JointMetricDescriptor,
): number {
  const stateB = statesByBody.get(joint.bodyB);
  if (!stateB) return Infinity;
  const anchorBOffset = rotateLocalPoint(joint.anchorB, stateB.quaternion);
  const worldAnchorB: [number, number, number] = [
    stateB.position[0] + anchorBOffset[0],
    stateB.position[1] + anchorBOffset[1],
    stateB.position[2] + anchorBOffset[2],
  ];

  let worldAnchorA: [number, number, number];
  if (joint.bodyA === null) {
    worldAnchorA = joint.anchorA;
  } else {
    const stateA = statesByBody.get(joint.bodyA);
    if (!stateA) return Infinity;
    const anchorAOffset = rotateLocalPoint(joint.anchorA, stateA.quaternion);
    worldAnchorA = [
      stateA.position[0] + anchorAOffset[0],
      stateA.position[1] + anchorAOffset[1],
      stateA.position[2] + anchorAOffset[2],
    ];
  }

  return Math.hypot(
    worldAnchorA[0] - worldAnchorB[0],
    worldAnchorA[1] - worldAnchorB[1],
    worldAnchorA[2] - worldAnchorB[2],
  );
}

function computeWorldAnchor(
  statesByBody: Map<number, RigidBodyReadbackState>,
  body: number | null,
  anchor: [number, number, number],
): [number, number, number] | null {
  if (body === null) return anchor;
  const state = statesByBody.get(body);
  if (!state) return null;
  const offset = rotateLocalPoint(anchor, state.quaternion);
  return [
    state.position[0] + offset[0],
    state.position[1] + offset[1],
    state.position[2] + offset[2],
  ];
}

function computeSpringLength(
  statesByBody: Map<number, RigidBodyReadbackState>,
  spring: SpringMetricDescriptor,
): number {
  const worldAnchorA = computeWorldAnchor(statesByBody, spring.bodyA, spring.anchorA);
  const worldAnchorB = computeWorldAnchor(statesByBody, spring.bodyB, spring.anchorB);
  if (!worldAnchorA || !worldAnchorB) return Infinity;
  return Math.hypot(
    worldAnchorA[0] - worldAnchorB[0],
    worldAnchorA[1] - worldAnchorB[1],
    worldAnchorA[2] - worldAnchorB[2],
  );
}

function centerSag(
  statesByBody: Map<number, RigidBodyReadbackState>,
  bodyIds: number[],
  getSpawnPosition?: (body: number) => [number, number, number] | undefined,
): number {
  if (bodyIds.length === 0) return 0.0;
  let sumInitialY = 0.0;
  let sumCurrentY = 0.0;
  let count = 0;
  for (const bodyId of bodyIds) {
    const state = statesByBody.get(bodyId);
    if (!state) continue;
    const spawn = getSpawnPosition?.(bodyId);
    sumInitialY += spawn?.[1] ?? state.initialPosition[1];
    sumCurrentY += state.position[1];
    count += 1;
  }
  if (count === 0) return 0.0;
  return (sumInitialY - sumCurrentY) / count;
}

function summarizeBodies(
  states: RigidBodyReadbackState[],
  getSpawnPosition?: (body: number) => [number, number, number] | undefined,
): BodyMetricSummary {
  let maxLateralDisplacement = 0.0;
  let maxLateralSpeed = 0.0;
  let maxHeight = -Infinity;
  let minHeight = Infinity;

  for (const state of states) {
    maxLateralDisplacement = Math.max(maxLateralDisplacement, lateralDisplacement(state, getSpawnPosition));
    maxLateralSpeed = Math.max(maxLateralSpeed, lateralSpeed(state));
    maxHeight = Math.max(maxHeight, state.position[1]);
    minHeight = Math.min(minHeight, state.position[1]);
  }

  return {
    maxLateralDisplacement,
    maxLateralSpeed,
    maxHeight,
    minHeight,
  };
}

function accumulateJointScenarioMetrics(
  metrics: JointScenarioMetrics,
  states: RigidBodyReadbackState[],
  ids: number[],
  joints: JointMetricDescriptor[],
  activeContactCount: number,
  getSpawnPosition?: (body: number) => [number, number, number] | undefined,
): void {
  const statesByBody = new Map(states.map((state) => [state.body, state] as const));
  const trackedStates = ids
    .map((bodyId) => statesByBody.get(bodyId))
    .filter((state): state is RigidBodyReadbackState => state !== undefined);
  const summary = summarizeBodies(trackedStates, getSpawnPosition);
  metrics.maxLateralDisplacement = Math.max(metrics.maxLateralDisplacement, summary.maxLateralDisplacement);
  metrics.maxLateralSpeed = Math.max(metrics.maxLateralSpeed, summary.maxLateralSpeed);
  metrics.maxHeight = Math.max(metrics.maxHeight, summary.maxHeight);
  metrics.minHeight = Math.min(metrics.minHeight, summary.minHeight);
  metrics.maxAbsHeight = Math.max(
    metrics.maxAbsHeight,
    ...trackedStates.map((state) => Math.abs(state.position[1])),
  );
  metrics.maxActiveContacts = Math.max(metrics.maxActiveContacts, activeContactCount);
  for (const joint of joints) {
    metrics.maxJointError = Math.max(metrics.maxJointError, computeJointAnchorError(statesByBody, joint));
  }
}

function createReferencePhysics(device: GPUDevice, maxBodies: number, bodySolveMode: AvbdBodySolveMode): PhysicsEngine {
  const physics = new PhysicsEngine(device, {
    maxBodies,
    gravity: [0, -9.81, 0],
    substeps: 4,
    deltaTime: FIXED_DT,
    pairManifoldSlots: 8,
    solverIterations: 4,
    pairSolveColorCount: 8,
    maxPairsPerBodyBroadphase: 16,
    maxContactsPerBodySolver: 128,
    maxFixedStepsPerFrame: 2,
    enableBvhBuild: true,
    bvhBuildOnce: false,
    bvhRebuildIntervalFrames: 1,
    bvhWaitForGpuCompletion: false,
    avbdFriction: AVBD_FRICTION_STATIC,
    avbdBodySolveMode: bodySolveMode,
  });

  applyReferenceAvbdConfig(physics);
  physics.setAvbdBodySolveMode(bodySolveMode);
  physics.setDebugEnabled(false);
  physics.setDebugLogEveryFrame(false);
  return physics;
}

function createScenarioWorld(
  context: ScenarioRunContext,
  maxBodies: number,
  bodySolveMode: AvbdBodySolveMode,
  retainOnDispose = false,
): ScenarioWorld {
  const physics = createReferencePhysics(context.device, maxBodies, bodySolveMode);
  const root = new THREE.Group();
  root.name = 'avbd-regression-world';
  context.scene.add(root);

  const dynamicMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0a448,
    roughness: 0.72,
    metalness: 0.08,
  });
  const staticMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d5968,
    roughness: 0.9,
    metalness: 0.03,
  });
  const geometryCache = new Map<string, THREE.BoxGeometry>();
  const sphereGeometryCache = new Map<string, THREE.SphereGeometry>();
  const spawnPositions = new Map<number, [number, number, number]>();
  const trackedBodySets = new Map<string, ReturnType<typeof createTrackedBodyVisualSet>>();
  let trackedSpringSet: ReturnType<typeof createTrackedSpringVisualSet> | null = null;

  const getBoxGeometry = (halfExtents: [number, number, number]): THREE.BoxGeometry => {
    const key = halfExtents.join(',');
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(
        halfExtents[0] * 2,
        halfExtents[1] * 2,
        halfExtents[2] * 2,
      );
      geometryCache.set(key, geometry);
    }
    return geometry;
  };

  const getSphereGeometry = (radius: number): THREE.SphereGeometry => {
    const key = radius.toFixed(4);
    let geometry = sphereGeometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.SphereGeometry(radius, 24, 18);
      sphereGeometryCache.set(key, geometry);
    }
    return geometry;
  };

  const registerStaticMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    quaternion?: [number, number, number, number],
  ): void => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(position[0], position[1], position[2]);
    if (quaternion) {
      mesh.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }
    root.add(mesh);
  };

  const getTrackedBoxSet = (
    halfExtents: [number, number, number],
  ): ReturnType<typeof createTrackedBodyVisualSet> => {
    const key = `box:${halfExtents.join(',')}`;
    let set = trackedBodySets.get(key);
    if (!set) {
      set = createTrackedBodyVisualSet(context.scene, physics, {
        capacity: maxBodies,
        geometry: getBoxGeometry(halfExtents),
        color: 0xe0a448,
        roughness: 0.72,
        metalness: 0.08,
      });
      trackedBodySets.set(key, set);
    }
    return set;
  };

  const getTrackedSphereSet = (
    radius: number,
  ): ReturnType<typeof createTrackedBodyVisualSet> => {
    const key = `sphere:${radius.toFixed(4)}`;
    let set = trackedBodySets.get(key);
    if (!set) {
      set = createTrackedBodyVisualSet(context.scene, physics, {
        capacity: maxBodies,
        geometry: getSphereGeometry(radius),
        color: 0xe0a448,
        roughness: 0.72,
        metalness: 0.08,
      });
      trackedBodySets.set(key, set);
    }
    return set;
  };

  const registerTrackedBody = (
    body: number,
    position: [number, number, number],
    trackedSet: ReturnType<typeof createTrackedBodyVisualSet>,
  ): void => {
    trackedSet.addBody(body);
    spawnPositions.set(body, [position[0], position[1], position[2]]);
  };

  const addStaticFloor = (filter?: CollisionFilterOptions): number => {
    const position: [number, number, number] = [0.0, -FLOOR_HALF_EXTENTS[1], 0.0];
    const body = physics.addBody({
      position,
      mass: 0.0,
      halfExtents: FLOOR_HALF_EXTENTS,
      lockRotation: true,
      collisionGroup: filter?.collisionGroup,
      collisionMask: filter?.collisionMask,
    });
    registerStaticMesh(getBoxGeometry(FLOOR_HALF_EXTENTS), staticMaterial, position);
    spawnPositions.set(body, [position[0], position[1], position[2]]);
    return body;
  };

  const addDynamicBox = (
    position: [number, number, number],
    friction = AVBD_FRICTION_STATIC,
    linearVelocity?: [number, number, number],
    mass = 1.0,
    halfExtents: [number, number, number] = HALF_EXTENTS,
    filter?: CollisionFilterOptions,
  ): number => {
    const body = physics.addBody({
      position,
      mass,
      halfExtents,
      friction,
      linearVelocity,
      collisionGroup: filter?.collisionGroup,
      collisionMask: filter?.collisionMask,
    });
    if (mass <= 0.0) {
      registerStaticMesh(getBoxGeometry(halfExtents), staticMaterial, position);
      spawnPositions.set(body, [position[0], position[1], position[2]]);
    } else {
      registerTrackedBody(body, position, getTrackedBoxSet(halfExtents));
    }
    return body;
  };

  const addDynamicSphere = (
    position: [number, number, number],
    radius = DEFAULT_SPHERE_RADIUS,
    friction = AVBD_FRICTION_STATIC,
    linearVelocity?: [number, number, number],
    mass = 1.0,
    filter?: CollisionFilterOptions,
  ): number => {
    const body = physics.addBody({
      position,
      shapeType: 'sphere',
      radius,
      mass,
      friction,
      linearVelocity,
      collisionGroup: filter?.collisionGroup,
      collisionMask: filter?.collisionMask,
    });
    if (mass <= 0.0) {
      registerStaticMesh(getSphereGeometry(radius), staticMaterial, position);
      spawnPositions.set(body, [position[0], position[1], position[2]]);
    } else {
      registerTrackedBody(body, position, getTrackedSphereSet(radius));
    }
    return body;
  };

  const addVerticalStack = (count: number, friction = AVBD_FRICTION_STATIC): number[] => {
    const ids: number[] = [];
    const stepY = HALF_EXTENTS[1] * 2 + 0.01;
    for (let index = 0; index < count; index++) {
      ids.push(addDynamicBox(
        [0.0, HALF_EXTENTS[1] + index * stepY, 0.0],
        friction,
      ));
    }
    addStaticFloor();
    return ids;
  };

  const addSphericalJoint = (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness = 1.0e6,
  ): number => physics.addSphericalJoint(bodyA, bodyB, anchorA, anchorB, stiffness);

  const addFixedJoint = (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness = 1.0e6,
  ): number => physics.addFixedJoint(bodyA, bodyB, anchorA, anchorB, stiffness);

  const addSpring = (
    bodyA: number | null,
    bodyB: number,
    anchorA: [number, number, number],
    anchorB: [number, number, number],
    stiffness = 100.0,
    restLength?: number,
  ): number => {
    const spring = physics.addSpring(bodyA, bodyB, anchorA, anchorB, stiffness, restLength);
    if (!trackedSpringSet) {
      trackedSpringSet = createTrackedSpringVisualSet(context.scene, {
        capacity: maxBodies,
      });
    }
    trackedSpringSet.addSpring(spring);
    return spring;
  };

  const ignoreCollisionPair = (bodyA: number, bodyB: number, ignored = true): void => {
    physics.setBodyPairCollisionIgnored(bodyA, bodyB, ignored);
  };

  const syncVisuals = (): void => {
    for (const trackedSet of trackedBodySets.values()) {
      trackedSet.syncVisuals(physics);
    }
    trackedSpringSet?.syncVisuals(physics);
  };

  let world: ScenarioWorld;

  const disposeNow = (): void => {
    context.clearActiveWorld(world);
    context.scene.remove(root);
    root.clear();
    for (const trackedSet of trackedBodySets.values()) {
      trackedSet.dispose();
    }
    trackedBodySets.clear();
    trackedSpringSet?.dispose();
    trackedSpringSet = null;
    for (const geometry of geometryCache.values()) {
      geometry.dispose();
    }
    geometryCache.clear();
    for (const geometry of sphereGeometryCache.values()) {
      geometry.dispose();
    }
    sphereGeometryCache.clear();
    dynamicMaterial.dispose();
    staticMaterial.dispose();
  };

  const dispose = (): void => {
    if (retainOnDispose) {
      context.retainWorld(disposeNow);
      return;
    }
    disposeNow();
  };

  world = {
    physics,
    addStaticFloor,
    addDynamicBox,
    addDynamicSphere,
    addSphericalJoint,
    addFixedJoint,
    addSpring,
    addVerticalStack,
    ignoreCollisionPair,
    getSpawnPosition: (body: number) => spawnPositions.get(body),
    syncVisuals,
    dispose,
  };

  context.setActiveWorld(world);
  return world;
}

async function advanceFrames(
  context: ScenarioRunContext,
  world: ScenarioWorld,
  totalFrames: number,
  label: string,
  setRenderedFrame: (label: string, frame: number) => void,
  onBatchComplete?: (completed: number, states: RigidBodyReadbackState[] | null) => Promise<void> | void,
): Promise<void> {
  let states: RigidBodyReadbackState[] | null = null;
  try {
    world.syncVisuals();
  } catch (error) {
    throw new Error(`${label}: initial visual bind failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  setRenderedFrame(label, 0);
  if (onBatchComplete) {
    try {
      states = await world.physics.readRigidBodyStatesAsync(context.renderer);
      await onBatchComplete(0, states);
    } catch (error) {
      throw new Error(`${label}: initial metrics failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let completed = 0;
  while (completed < totalFrames) {
    const batch = Math.min(Math.max(1, context.frameBatchSize), totalFrames - completed);
    for (let step = 0; step < batch; step++) {
      try {
        world.physics.step(FIXED_DT, context.renderer);
      } catch (error) {
        throw new Error(`${label}: physics step failed at frame ${completed + step + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    completed += batch;
    try {
      world.syncVisuals();
    } catch (error) {
      throw new Error(`${label}: visual bind failed at frame ${completed}: ${error instanceof Error ? error.message : String(error)}`);
    }
    setRenderedFrame(label, completed);
    context.updateProgress(`${label}: ${completed}/${totalFrames} frames`, completed / totalFrames);
    if (onBatchComplete) {
      try {
        states = await world.physics.readRigidBodyStatesAsync(context.renderer);
        await onBatchComplete(completed, states);
      } catch (error) {
        throw new Error(`${label}: metrics failed at frame ${completed}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  try {
    await context.device.queue.onSubmittedWorkDone();
  } catch (error) {
    throw new Error(`${label}: queue drain failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readBodies(
  physics: PhysicsEngine,
  renderer: any,
  bodyIds: number[],
): Promise<RigidBodyReadbackState[]> {
  const states = await physics.readRigidBodyStatesAsync(renderer);
  if (!states) {
    throw new Error('Unable to read back rigid body states.');
  }
  const byBody = new Map(states.map((state) => [state.body, state] as const));
  return bodyIds.map((bodyId) => {
    const state = byBody.get(bodyId);
    if (!state) {
      throw new Error(`Body ${bodyId} missing from readback.`);
    }
    return state;
  });
}

async function runSingleBoxNoDrift(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 8, context.bodySolveMode, true);
  try {
    const [box] = world.addVerticalStack(1);

    await advanceFrames(context, world, 600, 'Single box resting', context.setRenderedFrame);
    const [state] = await readBodies(world.physics, context.renderer, [box]);
    const drift = lateralDisplacement(state, world.getSpawnPosition);
    const speed = lateralSpeed(state);

    return {
      status: drift < 1e-3 && speed < 1e-4 ? 'pass' : 'fail',
      metrics: [
        `frames=600`,
        `lateral drift=${formatMetric(drift)}`,
        `lateral speed=${formatMetric(speed)}`,
      ],
      notes: 'Modeled on avbd_standalone test1_singleBoxOnGround and test69_restingContactNoDrift.',
    };
  } finally {
    world.dispose();
  }
}

async function runTwoBoxStack(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 16, context.bodySolveMode, true);
  try {
    const ids = world.addVerticalStack(2);

    await advanceFrames(context, world, 900, 'Two-box stack', context.setRenderedFrame);
    const states = await readBodies(world.physics, context.renderer, ids);
    const summary = summarizeBodies(states, world.getSpawnPosition);

    return {
      status: summary.maxLateralDisplacement < 5e-3 && summary.maxLateralSpeed < 1e-3 ? 'pass' : 'fail',
      metrics: [
        `frames=900`,
        `max lateral=${formatMetric(summary.maxLateralDisplacement)}`,
        `max lateral speed=${formatMetric(summary.maxLateralSpeed)}`,
      ],
      notes: 'Modeled on avbd_standalone test2_twoBoxStack. This is the current stack-slide repro scenario.',
    };
  } finally {
    world.dispose();
  }
}

async function runTenBoxTower(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 32, context.bodySolveMode, true);
  try {
    const ids = world.addVerticalStack(10);

    await advanceFrames(context, world, 900, 'Ten-box tower', context.setRenderedFrame);
    const states = await readBodies(world.physics, context.renderer, ids);
    const summary = summarizeBodies(states, world.getSpawnPosition);

    return {
      status: summary.maxLateralDisplacement < 2e-2 && summary.maxHeight > 5.0 ? 'pass' : 'fail',
      metrics: [
        `frames=900`,
        `max lateral=${formatMetric(summary.maxLateralDisplacement)}`,
        `tower top y=${formatMetric(summary.maxHeight)}`,
        `lowest dynamic y=${formatMetric(summary.minHeight)}`,
      ],
      notes: 'Modeled on avbd_standalone tower stability tests such as test9_10BoxTower.',
    };
  } finally {
    world.dispose();
  }
}

async function runFrictionHoldComparison(context: ScenarioRunContext): Promise<ScenarioResult> {
  const runVariant = async (friction: number, label: string): Promise<number> => {
    const world = createScenarioWorld(context, 12, context.bodySolveMode);
    try {
      world.physics.setAvbdFriction(friction);
      const bottom = world.addDynamicBox([0.0, HALF_EXTENTS[1], 0.0], friction, undefined, 1.0);
      const top = world.addDynamicBox(
        [0.0, HALF_EXTENTS[1] * 3 + 0.01, 0.0],
        friction,
        [3.0, 0.0, 0.0],
        1.0,
      );
      void bottom;
      world.addStaticFloor();

      await advanceFrames(context, world, 300, label, context.setRenderedFrame);
      const [topState] = await readBodies(world.physics, context.renderer, [top]);
      const spawn = world.getSpawnPosition(top) ?? topState.initialPosition;
      return Math.abs(topState.position[0] - spawn[0]);
    } finally {
      world.dispose();
    }
  };

  const withFriction = await runVariant(0.8, 'Friction hold (mu=0.8)');
  const withoutFriction = await runVariant(0.0, 'Friction hold (mu=0.0)');

  return {
    status: withFriction < withoutFriction ? 'pass' : 'fail',
    metrics: [
      `frames=300`,
      `top slide, mu=0.8: ${formatMetric(withFriction)}`,
      `top slide, mu=0.0: ${formatMetric(withoutFriction)}`,
    ],
    notes: 'Modeled on avbd_standalone test62_stackedBoxOffset_frictionHolds.',
  };
}

async function runSphereResting(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 8, context.bodySolveMode, true);
  try {
    const radius = DEFAULT_SPHERE_RADIUS;
    const sphere = world.addDynamicSphere([0.0, radius + 2.0, 0.0], radius, 0.6, undefined, sphereMassFromDensity(radius, 1.0));
    world.addStaticFloor();

    await advanceFrames(context, world, 600, 'Sphere resting', context.setRenderedFrame);
    const [state] = await readBodies(world.physics, context.renderer, [sphere]);
    const drift = lateralDisplacement(state, world.getSpawnPosition);
    const speed = lateralSpeed(state);
    const centerHeight = state.position[1];
    const heightError = Math.abs(centerHeight - radius);

    return {
      status: drift < 2e-3 && speed < 2e-4 && heightError < 5e-2 ? 'pass' : 'fail',
      metrics: [
        'frames=600',
        `lateral drift=${formatMetric(drift)}`,
        `lateral speed=${formatMetric(speed)}`,
        `center y=${formatMetric(centerHeight)}`,
        `height error=${formatMetric(heightError)}`,
      ],
      notes: 'Covers sphere-vs-box resting contact on the floor.',
    };
  } finally {
    world.dispose();
  }
}

async function runTwoSphereStack(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 10, context.bodySolveMode, true);
  try {
    const radius = DEFAULT_SPHERE_RADIUS;
    const bottom = world.addDynamicSphere([0.0, radius, 0.0], radius, 0.6, undefined, sphereMassFromDensity(radius, 1.0));
    const top = world.addDynamicSphere([0.0, radius * 3.0 + 0.01, 0.0], radius, 0.6, undefined, sphereMassFromDensity(radius, 1.0));
    world.addStaticFloor();

    await advanceFrames(context, world, 600, 'Two-sphere stack', context.setRenderedFrame);
    const states = await readBodies(world.physics, context.renderer, [bottom, top]);
    const summary = summarizeBodies(states, world.getSpawnPosition);
    const topY = states[1]?.position[1] ?? 0.0;
    const bottomY = states[0]?.position[1] ?? 0.0;

    return {
      status: summary.maxLateralDisplacement < 1e-2 && summary.maxLateralSpeed < 1e-3 && topY > bottomY ? 'pass' : 'fail',
      metrics: [
        'frames=600',
        `max lateral=${formatMetric(summary.maxLateralDisplacement)}`,
        `max lateral speed=${formatMetric(summary.maxLateralSpeed)}`,
        `bottom y=${formatMetric(bottomY)}`,
        `top y=${formatMetric(topY)}`,
      ],
      notes: 'Covers sphere-vs-sphere stacking on top of sphere-vs-box floor contact.',
    };
  } finally {
    world.dispose();
  }
}

async function runSingleSpring(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 8, context.bodySolveMode, true);
  try {
    const anchor = world.addDynamicBox([0.0, 8.0, 0.0], 0.5, undefined, 0.0, [0.5, 0.5, 0.5]);
    const block = world.addDynamicBox([0.0, 2.0, 0.0], 0.5, undefined, 1.0, [1.0, 1.0, 1.0]);
    const spring: SpringMetricDescriptor = {
      bodyA: anchor,
      bodyB: block,
      anchorA: [0.0, 0.0, 0.0],
      anchorB: [0.0, 0.0, 0.0],
      stiffness: 100.0,
      restLength: 4.0,
    };
    world.addSpring(anchor, block, spring.anchorA, spring.anchorB, spring.stiffness, spring.restLength);

    await advanceFrames(context, world, 600, 'Single spring', context.setRenderedFrame);
    const states = await readBodies(world.physics, context.renderer, [anchor, block]);
    const statesByBody = new Map(states.map((state) => [state.body, state] as const));
    const springLength = computeSpringLength(statesByBody, spring);
    const extension = springLength - spring.restLength;
    const blockState = statesByBody.get(block)!;
    const drift = lateralDisplacement(blockState, world.getSpawnPosition);
    const speed = lateralSpeed(blockState);

    return {
      status: Number.isFinite(springLength) && extension > 0.02 && extension < 0.4 && drift < 5e-3 && speed < 2e-2 ? 'pass' : 'fail',
      metrics: [
        'frames=600',
        `spring length=${formatMetric(springLength)}`,
        `extension=${formatMetric(extension)}`,
        `block drift=${formatMetric(drift)}`,
        `block speed=${formatMetric(speed)}`,
      ],
      notes: 'Modeled on avbd-demo3d Spring: a single hanging box should stretch the spring by a small, finite amount.',
    };
  } finally {
    world.dispose();
  }
}

async function runSpringRatio(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 20, context.bodySolveMode, true);
  try {
    const bodies: number[] = [];
    const springs: SpringMetricDescriptor[] = [];
    const springCount = 8;
    for (let i = 0; i < springCount; i++) {
      const x = (i - (springCount - 1) * 0.5) * 3.0;
      bodies.push(world.addDynamicBox(
        [x, 12.0, 0.0],
        0.5,
        undefined,
        (i === 0 || i === springCount - 1) ? 0.0 : 1.0,
        [0.5, 0.375, 0.375],
      ));
      if (i > 0) {
        const stiffness = i % 2 === 0 ? 10.0 : 10000.0;
        const spring: SpringMetricDescriptor = {
          bodyA: bodies[i - 1]!,
          bodyB: bodies[i]!,
          anchorA: [0.5, 0.0, 0.0],
          anchorB: [-0.5, 0.0, 0.0],
          stiffness,
          restLength: 3.0,
        };
        springs.push(spring);
        world.addSpring(spring.bodyA, spring.bodyB, spring.anchorA, spring.anchorB, spring.stiffness, spring.restLength);
      }
    }

    await advanceFrames(context, world, 600, 'Spring ratio', context.setRenderedFrame);
    const states = await readBodies(world.physics, context.renderer, bodies);
    const statesByBody = new Map(states.map((state) => [state.body, state] as const));
    let softExtension = 0.0;
    let stiffExtension = 0.0;
    let softCount = 0;
    let stiffCount = 0;
    for (const spring of springs) {
      const extension = computeSpringLength(statesByBody, spring) - spring.restLength;
      if (spring.stiffness < 100.0) {
        softExtension += extension;
        softCount += 1;
      } else {
        stiffExtension += extension;
        stiffCount += 1;
      }
    }
    const avgSoftExtension = softCount > 0 ? softExtension / softCount : Infinity;
    const avgStiffExtension = stiffCount > 0 ? stiffExtension / stiffCount : Infinity;
    const summary = summarizeBodies(states, world.getSpawnPosition);

    return {
      status: avgSoftExtension > avgStiffExtension + 5e-2 && summary.maxLateralDisplacement < 2.0 ? 'pass' : 'fail',
      metrics: [
        'frames=600',
        `avg soft extension=${formatMetric(avgSoftExtension)}`,
        `avg stiff extension=${formatMetric(avgStiffExtension)}`,
        `extension ratio=${formatMetric(avgSoftExtension / Math.max(avgStiffExtension, 1e-6))}`,
        `max lateral=${formatMetric(summary.maxLateralDisplacement)}`,
      ],
      notes: 'Modeled on avbd-demo3d Spring Ratio: soft springs should stretch more than stiff springs under the same load path.',
    };
  } finally {
    world.dispose();
  }
}

async function runSphericalJointChain(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 12, context.bodySolveMode, true);
  try {
    const count = 5;
    const stepY = HALF_EXTENTS[1] * 2;
    const startY = 6.0;
    const ids: number[] = [];
    const joints: JointMetricDescriptor[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(world.addDynamicBox([0.0, startY - i * stepY, 0.0], 0.5, undefined, REFERENCE_CHAIN_BODY_MASS));
    }
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        world.ignoreCollisionPair(ids[i]!, ids[j]!, true);
      }
    }

    world.addSphericalJoint(
      null,
      ids[0],
      [0.0, startY + HALF_EXTENTS[1], 0.0],
      [0.0, HALF_EXTENTS[1], 0.0],
      Number.POSITIVE_INFINITY,
    );
    joints.push({
      bodyA: null,
      bodyB: ids[0],
      anchorA: [0.0, startY + HALF_EXTENTS[1], 0.0],
      anchorB: [0.0, HALF_EXTENTS[1], 0.0],
    });
    for (let i = 0; i < count - 1; i++) {
      world.addSphericalJoint(
        ids[i],
        ids[i + 1],
        [0.0, -HALF_EXTENTS[1], 0.0],
        [0.0, HALF_EXTENTS[1], 0.0],
        Number.POSITIVE_INFINITY,
      );
      joints.push({
        bodyA: ids[i],
        bodyB: ids[i + 1],
        anchorA: [0.0, -HALF_EXTENTS[1], 0.0],
        anchorB: [0.0, HALF_EXTENTS[1], 0.0],
      });
    }

    const metrics: JointScenarioMetrics = {
      maxLateralDisplacement: 0.0,
      maxLateralSpeed: 0.0,
      maxHeight: -Infinity,
      minHeight: Infinity,
      maxJointError: 0.0,
      maxActiveContacts: 0,
      maxAbsHeight: 0.0,
    };
    await advanceFrames(context, world, 300, 'Spherical joint chain', context.setRenderedFrame, async (_completed, states) => {
      if (!states) return;
      const activeContacts = await world.physics.readActiveContactPointsAsync(context.renderer);
      accumulateJointScenarioMetrics(metrics, states, ids, joints, activeContacts?.length ?? 0, world.getSpawnPosition);
    });
    const states = await readBodies(world.physics, context.renderer, ids);
    const topY = states[0]?.position[1] ?? 0.0;
    const bottomY = states[count - 1]?.position[1] ?? 0.0;
    const stable =
      metrics.maxAbsHeight < 20.0 &&
      metrics.maxJointError < 0.05 &&
      metrics.maxLateralDisplacement < 0.25 &&
      metrics.maxLateralSpeed < 5.0 &&
      metrics.maxActiveContacts === 0 &&
      topY > bottomY;

    return {
      status: stable ? 'pass' : 'fail',
      metrics: [
        'frames=300',
        `top y=${formatMetric(topY)}`,
        `bottom y=${formatMetric(bottomY)}`,
        `span=${formatMetric(topY - bottomY)}`,
        `max joint error=${formatMetric(metrics.maxJointError)}`,
        `max lateral=${formatMetric(metrics.maxLateralDisplacement)}`,
        `max lateral speed=${formatMetric(metrics.maxLateralSpeed)}`,
        `max active contacts=${metrics.maxActiveContacts}`,
      ],
      notes: 'Modeled on avbd_standalone test17_sphericalJointChain.',
    };
  } finally {
    world.dispose();
  }
}

async function runFixedJointChain(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 12, context.bodySolveMode, true);
  try {
    const count = 5;
    const stepY = HALF_EXTENTS[1] * 2;
    const startY = 6.0;
    const ids: number[] = [];
    const joints: JointMetricDescriptor[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(world.addDynamicBox([0.0, startY - i * stepY, 0.0], 0.5, undefined, REFERENCE_CHAIN_BODY_MASS));
    }
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        world.ignoreCollisionPair(ids[i]!, ids[j]!, true);
      }
    }

    world.addFixedJoint(
      null,
      ids[0],
      [0.0, startY + HALF_EXTENTS[1], 0.0],
      [0.0, HALF_EXTENTS[1], 0.0],
      Number.POSITIVE_INFINITY,
    );
    joints.push({
      bodyA: null,
      bodyB: ids[0],
      anchorA: [0.0, startY + HALF_EXTENTS[1], 0.0],
      anchorB: [0.0, HALF_EXTENTS[1], 0.0],
    });
    for (let i = 0; i < count - 1; i++) {
      world.addFixedJoint(
        ids[i],
        ids[i + 1],
        [0.0, -HALF_EXTENTS[1], 0.0],
        [0.0, HALF_EXTENTS[1], 0.0],
        Number.POSITIVE_INFINITY,
      );
      joints.push({
        bodyA: ids[i],
        bodyB: ids[i + 1],
        anchorA: [0.0, -HALF_EXTENTS[1], 0.0],
        anchorB: [0.0, HALF_EXTENTS[1], 0.0],
      });
    }

    const metrics: JointScenarioMetrics = {
      maxLateralDisplacement: 0.0,
      maxLateralSpeed: 0.0,
      maxHeight: -Infinity,
      minHeight: Infinity,
      maxJointError: 0.0,
      maxActiveContacts: 0,
      maxAbsHeight: 0.0,
    };
    await advanceFrames(context, world, 300, 'Fixed joint chain', context.setRenderedFrame, async (_completed, states) => {
      if (!states) return;
      const activeContacts = await world.physics.readActiveContactPointsAsync(context.renderer);
      accumulateJointScenarioMetrics(metrics, states, ids, joints, activeContacts?.length ?? 0, world.getSpawnPosition);
    });
    const states = await readBodies(world.physics, context.renderer, ids);
    const topY = states[0]?.position[1] ?? 0.0;
    const bottomY = states[count - 1]?.position[1] ?? 0.0;
    const stable =
      metrics.maxAbsHeight < 20.0 &&
      metrics.maxJointError < 0.05 &&
      metrics.maxLateralDisplacement < 0.25 &&
      metrics.maxLateralSpeed < 5.0 &&
      metrics.maxActiveContacts === 0 &&
      topY > bottomY;

    return {
      status: stable ? 'pass' : 'fail',
      metrics: [
        'frames=300',
        `top y=${formatMetric(topY)}`,
        `bottom y=${formatMetric(bottomY)}`,
        `span=${formatMetric(topY - bottomY)}`,
        `max joint error=${formatMetric(metrics.maxJointError)}`,
        `max lateral=${formatMetric(metrics.maxLateralDisplacement)}`,
        `max lateral speed=${formatMetric(metrics.maxLateralSpeed)}`,
        `max active contacts=${metrics.maxActiveContacts}`,
      ],
      notes: 'Modeled on avbd_standalone test18_fixedJointChain.',
    };
  } finally {
    world.dispose();
  }
}

async function runBridgeSag(context: ScenarioRunContext): Promise<ScenarioResult> {
  const world = createScenarioWorld(context, 160, context.bodySolveMode, true);
  try {
    const rigidJointStiffness = Number.POSITIVE_INFINITY;
    const plankCount = 40;
    const plankHalfExtents: [number, number, number] = [0.5, 0.25, 2.0];
    const plankHalfLength = plankHalfExtents[0];
    const plankHalfWidth = plankHalfExtents[2];
    const bridgeY = 10.0;
    const plankDensity = 1.0;
    const loadHalfExtents: [number, number, number] = [0.5, 0.5, 0.5];
    const loadMass = boxMassFromDensity(loadHalfExtents, 1.0);
    const plankMass = boxMassFromDensity(plankHalfExtents, plankDensity);
    const worldFilter: CollisionFilterOptions = {
      collisionGroup: COLLISION_GROUP_WORLD,
      collisionMask: COLLISION_GROUP_PLANK | COLLISION_GROUP_LOAD,
    };
    const plankFilter: CollisionFilterOptions = {
      collisionGroup: COLLISION_GROUP_PLANK,
      collisionMask: COLLISION_GROUP_WORLD | COLLISION_GROUP_PLANK | COLLISION_GROUP_LOAD,
    };
    const loadFilter: CollisionFilterOptions = {
      collisionGroup: COLLISION_GROUP_LOAD,
      collisionMask: COLLISION_GROUP_WORLD | COLLISION_GROUP_PLANK | COLLISION_GROUP_LOAD,
    };
    const plankIds: number[] = [];
    const joints: JointMetricDescriptor[] = [];

    world.addStaticFloor(worldFilter);

    for (let i = 0; i < plankCount; i++) {
      const mass = i === 0 || i === plankCount - 1 ? 0.0 : plankMass;
      plankIds.push(world.addDynamicBox(
        [i - plankCount * 0.5, bridgeY, 0.0],
        0.5,
        undefined,
        mass,
        plankHalfExtents,
        plankFilter,
      ));
    }
    for (let i = 1; i < plankCount; i++) {
      world.ignoreCollisionPair(plankIds[i - 1]!, plankIds[i]!, true);
      world.addSphericalJoint(
        plankIds[i - 1] ?? null,
        plankIds[i] ?? -1,
        [plankHalfLength, 0.0, plankHalfWidth],
        [-plankHalfLength, 0.0, plankHalfWidth],
        rigidJointStiffness,
      );
      joints.push({
        bodyA: plankIds[i - 1] ?? null,
        bodyB: plankIds[i] ?? -1,
        anchorA: [plankHalfLength, 0.0, plankHalfWidth],
        anchorB: [-plankHalfLength, 0.0, plankHalfWidth],
      });
      world.addSphericalJoint(
        plankIds[i - 1] ?? null,
        plankIds[i] ?? -1,
        [plankHalfLength, 0.0, -plankHalfWidth],
        [-plankHalfLength, 0.0, -plankHalfWidth],
        rigidJointStiffness,
      );
      joints.push({
        bodyA: plankIds[i - 1] ?? null,
        bodyB: plankIds[i] ?? -1,
        anchorA: [plankHalfLength, 0.0, -plankHalfWidth],
        anchorB: [-plankHalfLength, 0.0, -plankHalfWidth],
      });
    }

    const loadCols = Math.max(1, Math.floor(plankCount / 4));
    const loadRows = Math.max(1, Math.floor(plankCount / 8));
    for (let x = 0; x < loadCols; x++) {
      for (let y = 0; y < loadRows; y++) {
        world.addDynamicBox(
          [
            x - plankCount / 8.0,
            y + 12.0,
            0.0,
          ],
          0.5,
          undefined,
          loadMass,
          loadHalfExtents,
          loadFilter,
        );
      }
    }

    const centerIds = plankCount % 2 === 0
      ? [plankIds[plankCount / 2 - 1], plankIds[plankCount / 2]]
      : [plankIds[Math.floor(plankCount / 2)]];
    const metrics: BridgeScenarioMetrics = {
      maxLateralDisplacement: 0.0,
      maxLateralSpeed: 0.0,
      maxHeight: -Infinity,
      minHeight: Infinity,
      maxJointError: 0.0,
      maxActiveContacts: 0,
      maxAbsHeight: 0.0,
      maxCenterSag: 0.0,
    };

    await advanceFrames(context, world, 600, 'Bridge sag', context.setRenderedFrame, async (_completed, states) => {
      if (!states) return;
      let activeContactCount = metrics.maxActiveContacts;
      if (_completed === 0 || _completed % 60 === 0) {
        try {
          const activeContacts = await world.physics.readActiveContactPointsAsync(context.renderer);
          activeContactCount = activeContacts?.length ?? 0;
        } catch {
          activeContactCount = metrics.maxActiveContacts;
        }
      }
      const statesByBody = new Map(states.map((state) => [state.body, state] as const));
      accumulateJointScenarioMetrics(metrics, states, plankIds, joints, activeContactCount, world.getSpawnPosition);
      metrics.maxCenterSag = Math.max(metrics.maxCenterSag, centerSag(statesByBody, centerIds as number[], world.getSpawnPosition));
    });

    const states = await readBodies(world.physics, context.renderer, plankIds);
    const statesByBody = new Map(states.map((state) => [state.body, state] as const));
    const finalCenterSag = centerSag(statesByBody, centerIds as number[], world.getSpawnPosition);
    const leftSupportDrift = lateralDisplacement(statesByBody.get(plankIds[0]!)!, world.getSpawnPosition);
    const rightSupportDrift = lateralDisplacement(statesByBody.get(plankIds[plankCount - 1]!)!, world.getSpawnPosition);
    const stable =
      finalCenterSag > 0.05 &&
      finalCenterSag < 3.0 &&
      metrics.maxCenterSag < 3.5 &&
      metrics.maxJointError < 0.25 &&
      metrics.maxLateralDisplacement < 1.0 &&
      leftSupportDrift < 1e-5 &&
      rightSupportDrift < 1e-5;

    return {
      status: stable ? 'pass' : 'fail',
      metrics: [
        'frames=600',
        `final center sag=${formatMetric(finalCenterSag)}`,
        `max center sag=${formatMetric(metrics.maxCenterSag)}`,
        `max joint error=${formatMetric(metrics.maxJointError)}`,
        `max lateral=${formatMetric(metrics.maxLateralDisplacement)}`,
        `support drift L=${formatMetric(leftSupportDrift)}`,
        `support drift R=${formatMetric(rightSupportDrift)}`,
        `max active contacts=${metrics.maxActiveContacts}`,
      ],
      notes: 'Modeled on avbd-demo3d sceneBridge with two spherical joints per plank pair and static end planks.',
    };
  } finally {
    world.dispose();
  }
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'single-box-resting',
    label: 'Single Box Resting',
    reference: 'Standalone test1 / test69',
    description: 'Resting contact should not accumulate visible lateral drift.',
    run: runSingleBoxNoDrift,
  },
  {
    id: 'two-box-stack',
    label: 'Two Box Stack',
    reference: 'Standalone test2',
    description: 'Two-box stack should remain laterally quiet over a long run.',
    run: runTwoBoxStack,
  },
  {
    id: 'ten-box-tower',
    label: 'Ten Box Tower',
    reference: 'Standalone tower stability',
    description: 'Tall stack should not tip or accumulate excessive lateral creep.',
    run: runTenBoxTower,
  },
  {
    id: 'friction-holds',
    label: 'Friction Holds Top Box',
    reference: 'Standalone test62',
    description: 'High friction should reduce top-box slide relative to zero friction.',
    run: runFrictionHoldComparison,
  },
  {
    id: 'sphere-resting',
    label: 'Sphere Resting',
    reference: 'Sphere primitive',
    description: 'A single sphere should rest stably on the floor without lateral creep.',
    run: runSphereResting,
  },
  {
    id: 'two-sphere-stack',
    label: 'Two Sphere Stack',
    reference: 'Sphere primitive',
    description: 'Sphere-sphere stacking should remain stable on a floor contact.',
    run: runTwoSphereStack,
  },
  {
    id: 'single-spring',
    label: 'Single Spring',
    reference: 'avbd-demo3d Spring',
    description: 'A hanging mass on one spring should stretch by a small finite amount and remain bounded.',
    run: runSingleSpring,
  },
  {
    id: 'spring-ratio',
    label: 'Spring Ratio',
    reference: 'avbd-demo3d Spring Ratio',
    description: 'Soft springs should stretch more than stiff springs in the alternating chain.',
    run: runSpringRatio,
  },
  {
    id: 'spherical-joint-chain',
    label: 'Spherical Joint Chain',
    reference: 'Standalone test17',
    description: 'Anchored 5-body spherical-joint chain should hang without exploding.',
    run: runSphericalJointChain,
  },
  {
    id: 'fixed-joint-chain',
    label: 'Fixed Joint Chain',
    reference: 'Standalone test18',
    description: 'Anchored 5-body fixed-joint chain should remain stable.',
    run: runFixedJointChain,
  },
  {
    id: 'bridge-sag',
    label: 'Bridge Sag',
    reference: 'avbd-demo3d Bridge',
    description: 'A jointed plank bridge should sag under load without collapsing or exploding.',
    run: runBridgeSag,
  },
];

type ScenarioRowRefs = {
  row: HTMLDivElement;
  statusButton: HTMLButtonElement;
  labelSpan: HTMLSpanElement;
  displayLabel: string;
  lastStatus: ScenarioStatus;
  lastProgress: number;
  lastMetrics: string[];
  lastNotes: string;
  lastResult: ScenarioResult | null;
};

async function main(): Promise<void> {
  const runAllButton = document.getElementById('run-all') as HTMLButtonElement | null;
  const resultsBody = document.getElementById('results-body') as HTMLDivElement | null;
  const hoverCard = document.getElementById('hover-card') as HTMLDivElement | null;
  const liveStatus = document.getElementById('live-status') as HTMLDivElement | null;

  if (
    !runAllButton
    || !resultsBody
    || !hoverCard
    || !liveStatus
  ) {
    throw new Error('Regression page shell is incomplete.');
  }

  const ctx = await initRenderer({ enableInspector: false });
  ctx.controls.enabled = false;
  ctx.camera.position.set(6.5, 5.4, 8.0);
  ctx.camera.lookAt(0.0, 1.6, 0.0);
  ctx.camera.updateProjectionMatrix();
  ctx.scene.add(new THREE.GridHelper(12, 12, 0x7b8796, 0x36414d));
  const renderState: { label: string | null; frame: number } = { label: null, frame: 0 };
  let activeWorld: ScenarioWorld | null = null;
  let retainedWorldDispose: (() => void) | null = null;
  const releaseRetainedWorld = (): void => {
    if (!retainedWorldDispose) return;
    const dispose = retainedWorldDispose;
    retainedWorldDispose = null;
    dispose();
  };
  ctx.renderer.setAnimationLoop(() => {
    if (activeWorld) {
      activeWorld.syncVisuals();
    }
    ctx.renderer.render(ctx.scene, ctx.camera);
  });

  const rowRefs = new Map<string, ScenarioRowRefs>();
  for (const [scenarioIndex, scenario] of SCENARIOS.entries()) {
    const row = document.createElement('div');
    row.className = 'scenario-row';
    const displayLabel = String(scenarioIndex + 1);

    const statusButton = document.createElement('button');
    statusButton.className = 'scenario-status pending';
    statusButton.type = 'button';

    const svgNs = 'http://www.w3.org/2000/svg';
    const progressSvg = document.createElementNS(svgNs, 'svg');
    progressSvg.setAttribute('class', 'scenario-progress');
    progressSvg.setAttribute('viewBox', '0 0 40 40');
    progressSvg.setAttribute('aria-hidden', 'true');

    const trackCircle = document.createElementNS(svgNs, 'circle');
    trackCircle.setAttribute('class', 'scenario-progress-track');
    trackCircle.setAttribute('cx', '20');
    trackCircle.setAttribute('cy', '20');
    trackCircle.setAttribute('r', '17');
    trackCircle.setAttribute('pathLength', '100');

    const valueCircle = document.createElementNS(svgNs, 'circle');
    valueCircle.setAttribute('class', 'scenario-progress-value');
    valueCircle.setAttribute('cx', '20');
    valueCircle.setAttribute('cy', '20');
    valueCircle.setAttribute('r', '17');
    valueCircle.setAttribute('pathLength', '100');

    progressSvg.append(trackCircle, valueCircle);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'scenario-label';
    labelSpan.textContent = displayLabel;

    statusButton.append(progressSvg, labelSpan);
    statusButton.title = `${scenario.label}: no results yet`;
    statusButton.addEventListener('click', () => {
      void runScenarios([scenario.id]);
    });
    row.append(statusButton);
    resultsBody.appendChild(row);

    rowRefs.set(scenario.id, {
      row,
      statusButton,
      labelSpan,
      displayLabel,
      lastStatus: 'pending',
      lastProgress: 0.0,
      lastMetrics: [],
      lastNotes: scenario.description,
      lastResult: null,
    });
  }

  let running = false;
  let lastRunMode: AvbdBodySolveMode = DEFAULT_BODY_SOLVE_MODE;
  let activeTooltipButton: HTMLButtonElement | null = null;

  const buildTooltipLines = (scenario: ScenarioDefinition, refs: ScenarioRowRefs): string[] => {
    const lines = [`Status: ${refs.lastStatus}`];
    if (refs.lastStatus === 'pending') {
      lines.push(scenario.description);
      return lines;
    }
    if (refs.lastStatus === 'running') {
      if (refs.lastMetrics.length > 0) lines.push(...refs.lastMetrics);
      return lines;
    }
    lines.push(refs.lastNotes);
    if (refs.lastMetrics.length > 0) lines.push(...refs.lastMetrics);
    return lines;
  };

  const renderHoverCard = (scenario: ScenarioDefinition, refs: ScenarioRowRefs): void => {
    hoverCard.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'hover-title';
    title.textContent = scenario.label;
    const ref = document.createElement('span');
    ref.className = 'hover-ref';
    ref.textContent = scenario.reference;
    const body = document.createElement('div');
    body.textContent = buildTooltipLines(scenario, refs).join('\n');
    hoverCard.append(title, ref, body);
  };

  const positionHoverCard = (button: HTMLButtonElement): void => {
    const rect = button.getBoundingClientRect();
    const gap = 12;
    hoverCard.hidden = false;
    const { offsetWidth, offsetHeight } = hoverCard;
    const maxLeft = Math.max(16, window.innerWidth - offsetWidth - 16);
    const maxTop = Math.max(16, window.innerHeight - offsetHeight - 16);
    const left = Math.min(maxLeft, rect.right + gap);
    const top = Math.min(maxTop, Math.max(16, rect.top + rect.height * 0.5 - offsetHeight * 0.5));
    hoverCard.style.left = `${left}px`;
    hoverCard.style.top = `${top}px`;
  };

  const showScenarioTooltip = (scenario: ScenarioDefinition, button: HTMLButtonElement): void => {
    const refs = rowRefs.get(scenario.id);
    if (!refs) return;
    activeTooltipButton = button;
    renderHoverCard(scenario, refs);
    positionHoverCard(button);
  };

  const hideScenarioTooltip = (button: HTMLButtonElement): void => {
    if (activeTooltipButton !== button) return;
    activeTooltipButton = null;
    hoverCard.hidden = true;
  };

  const setRunState = (enabled: boolean, label: string): void => {
    runAllButton.disabled = !enabled;
    runAllButton.textContent = enabled ? '▶' : '…';
    liveStatus.textContent = label;
    for (const refs of rowRefs.values()) {
      refs.statusButton.disabled = !enabled;
    }
  };

  const logScenarioDetails = (scenario: ScenarioDefinition): void => {
    const refs = rowRefs.get(scenario.id);
    if (!refs?.lastResult) return;
    const payload = {
      id: scenario.id,
      label: scenario.label,
      reference: scenario.reference,
      description: scenario.description,
      bodySolveMode: lastRunMode,
      status: refs.lastResult.status,
      metrics: refs.lastResult.metrics,
      notes: refs.lastResult.notes,
    };
    console.groupCollapsed(`[AVBD Regression] ${scenario.label} ${refs.lastResult.status === 'pass' ? '✓' : '✕'}`);
    console.log(payload);
    console.groupEnd();
  };

  for (const scenario of SCENARIOS) {
    const refs = rowRefs.get(scenario.id);
    if (!refs) continue;
    refs.statusButton.addEventListener('mouseenter', () => {
      showScenarioTooltip(scenario, refs.statusButton);
    });
    refs.statusButton.addEventListener('focus', () => {
      showScenarioTooltip(scenario, refs.statusButton);
    });
    refs.statusButton.addEventListener('mouseleave', () => {
      hideScenarioTooltip(refs.statusButton);
    });
    refs.statusButton.addEventListener('blur', () => {
      hideScenarioTooltip(refs.statusButton);
    });
  }

  window.addEventListener('resize', () => {
    if (activeTooltipButton) {
      positionHoverCard(activeTooltipButton);
    }
  });

  const setScenarioRowState = (
    scenarioId: string,
    status: ScenarioStatus,
    metrics: string[],
    notes: string,
    progressFraction?: number,
  ): void => {
    const refs = rowRefs.get(scenarioId);
    if (!refs) return;
    refs.row.dataset.status = status;
    refs.statusButton.className = `scenario-status ${status}`;
    refs.labelSpan.textContent = refs.displayLabel;
    refs.lastStatus = status;
    refs.lastProgress = status === 'pass' || status === 'fail'
      ? 1.0
      : status === 'running'
        ? Math.max(0.0, Math.min(1.0, progressFraction ?? refs.lastProgress))
        : 0.0;
    refs.statusButton.style.setProperty('--progress', refs.lastProgress.toString());
    refs.statusButton.classList.toggle('has-progress', refs.lastProgress > 1e-4);
    refs.lastMetrics = metrics;
    refs.lastNotes = notes;
    refs.lastResult = status === 'pass' || status === 'fail'
      ? { status, metrics, notes }
      : null;
    const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);
    if (scenario) {
      refs.statusButton.title = `${scenario.label}\n${buildTooltipLines(scenario, refs).join('\n')}`;
      refs.statusButton.setAttribute('aria-label', `Test ${refs.displayLabel}, ${scenario.label}, ${refs.lastStatus}`);
      if (activeTooltipButton === refs.statusButton) {
        renderHoverCard(scenario, refs);
        positionHoverCard(refs.statusButton);
      }
    }
  };

  const runScenarios = async (scenarioIds: string[]): Promise<void> => {
    if (running) return;
    running = true;
    setRunState(false, `Running ${scenarioIds.length} scenario${scenarioIds.length === 1 ? '' : 's'}.`);
    const bodySolveMode = DEFAULT_BODY_SOLVE_MODE;
    lastRunMode = bodySolveMode;

    try {
      for (const scenarioId of scenarioIds) {
        const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);
        if (!scenario) continue;
        releaseRetainedWorld();
        applyScenarioView(ctx.camera, scenario.id);
        setScenarioRowState(scenarioId, 'running', ['Starting...'], scenario.description, 0.0);
        const frameBatchSize = scenarioIds.length === 1 ? 1 : FRAMES_PER_TICK;
        const result = await scenario.run({
          renderer: ctx.renderer,
          scene: ctx.scene,
          camera: ctx.camera,
          device: ctx.device,
          bodySolveMode,
          frameBatchSize,
          setActiveWorld: (world: ScenarioWorld | null) => {
            activeWorld = world;
          },
          clearActiveWorld: (world: ScenarioWorld) => {
            if (activeWorld === world) {
              activeWorld = null;
            }
          },
          retainWorld: (dispose: () => void) => {
            releaseRetainedWorld();
            retainedWorldDispose = dispose;
          },
          releaseRetainedWorld,
          setRenderedFrame: (label: string | null, frame: number) => {
            renderState.label = label;
            renderState.frame = frame;
          },
          updateProgress: (message: string, progressFraction?: number) => {
            liveStatus.textContent = message;
            setScenarioRowState(scenarioId, 'running', [message], scenario.description, progressFraction);
          },
        });
        setScenarioRowState(scenarioId, result.status, result.metrics, result.notes);
        logScenarioDetails(scenario);
      }

      liveStatus.textContent = `Completed ${scenarioIds.length} scenario${scenarioIds.length === 1 ? '' : 's'}.`;
    } catch (error) {
      console.error('Regression scenario run failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      liveStatus.textContent = message;
    } finally {
      running = false;
      renderState.label = null;
      setRunState(true, liveStatus.textContent || 'Ready.');
    }
  };

  runAllButton.addEventListener('click', () => {
    void runScenarios(SCENARIOS.map((scenario) => scenario.id));
  });
  liveStatus.textContent = 'Ready.';
}

void main().catch((error) => {
  console.error('Failed to initialize AVBD regression page:', error);
});
