import * as THREE from 'three';
import { initRenderer } from './renderer/setup';
import { DebugOverlay } from './renderer/debugOverlay';
import { PhysicsEngine, type JointReadbackState, type RigidBodyReadbackState } from './physics/PhysicsEngine';
import { createBoxSpawner, type BoxSpawner, type EmitterRuntimeConfig } from './scene/boxSpawner';
import { createTrackedBodyVisualSet } from './scene/trackedBodyVisuals';
import { createTrackedSpringVisualSet } from './scene/trackedSpringVisuals';
import { buildClothBoxesDemo } from './scene/clothBoxesDemo';
import { buildBunnySoftBodyDemo } from './scene/bunnySoftBodyDemo';
import { buildColiseumDemo } from './scene/coliseumDemo';
import { buildDominoAdvancedDemo, buildDominoDemo } from './scene/dominoDemo';
import { buildJointedSandboxDemo } from './scene/jointedSandboxDemo';
import { buildNewtonsCradleDemo } from './scene/newtonsCradleDemo';
import { buildRagdollAvalancheDemo } from './scene/ragdollAvalancheDemo';
import { buildRagdollCarouselDemo } from './scene/ragdollCarouselDemo';
import { buildRagdollClothDemo } from './scene/ragdollClothDemo';
import { buildRopeDemo } from './scene/ropeDemo';
import { buildSoftBodyDemo } from './scene/softBodyDemo';
import { ContactPointOverlay } from './scene/contactPointOverlay';
import { EmitterPanel, type EmitterResetDefaults, type StackPreset } from './scene/emitterPanel';
import { FPSController, type FPSControllerState } from './scene/fpsController';
import { GpuPassTimer } from './renderer/gpuPassTimer';
import { AVBD_FRICTION_STATIC } from './physics/avbdParams';
import { applyReferenceAvbdConfig } from './app/avbdReferenceConfig';

type StackPresetConfig = {
  maxBodies: number;
  initialCount: number;
  cameraPosition: [number, number, number];
  cameraLookAt: [number, number, number];
  physics: {
    maxPairsPerBodyBroadphase: number;
    maxContactsPerBodySolver?: number;
    maxPairSolveColorCount?: number;
    activePairSolveColorCount?: number;
  };
  layout: 'grid' | 'pyramid-wall';
  grid?: {
    x: number;
    z: number;
    startY: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    spacing: number;
    stacksX?: number;
    stacksZ?: number;
    stackSpacingX?: number;
    stackSpacingZ?: number;
  };
  pyramidWall?: {
    x: number;
    z: number;
    startY: number;
    layers: number;
    stepX?: number;
    stepY?: number;
  };
};

type MiniBridgeJointDescriptor = {
  joint: number;
  label: string;
  bodyA: number | null;
  bodyB: number;
  anchorA: [number, number, number];
  anchorB: [number, number, number];
};

type MiniBridgeDiagnosticsConfig = {
  preset: 'bridge-demo' | 'bridge-demo-empty' | 'bridge-demo-fixed';
  centerBody: number;
  joints: MiniBridgeJointDescriptor[];
};

type CarouselDiagnosticsConfig = {
  joints: MiniBridgeJointDescriptor[];
};

type SyncedSceneVisual = {
  syncVisuals: (engine: PhysicsEngine) => void;
  dispose: () => void;
};

type ProjectileShootConfig = {
  position: [number, number, number];
  direction: [number, number, number];
  averageSpeed: number;
  speedJitter?: number;
  angularJitter?: number;
};

type SceneRuntime = {
  sceneRoot: THREE.Group;
  spawner: BoxSpawner;
  defaultEmitter: EmitterRuntimeConfig;
  trackedVisualSets: Array<ReturnType<typeof createTrackedBodyVisualSet>>;
  trackedSpringVisualSets: Array<ReturnType<typeof createTrackedSpringVisualSet>>;
  syncedSceneVisuals: SyncedSceneVisual[];
  sceneUpdateCallbacks: Array<(dt: number) => void>;
  contactPointOverlay: ContactPointOverlay;
  bridgeMiniDiagnostics: MiniBridgeDiagnosticsConfig | null;
  carouselDiagnostics: CarouselDiagnosticsConfig | null;
  sceneStatusText: (() => string | null) | null;
  shootProjectileOverride: ((config: ProjectileShootConfig) => boolean) | null;
  dispose: () => void;
};

function multiplyQuat4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function conjugateQuat4(
  q: [number, number, number, number],
): [number, number, number, number] {
  return [-q[0], -q[1], -q[2], q[3]];
}

function normalizeQuat4(
  q: [number, number, number, number],
): [number, number, number, number] {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length <= 1e-12) return [0.0, 0.0, 0.0, 1.0];
  const invLength = 1.0 / length;
  return [q[0] * invLength, q[1] * invLength, q[2] * invLength, q[3] * invLength];
}

function rotateLocalPoint(
  point: [number, number, number],
  quaternion: [number, number, number, number],
): [number, number, number] {
  const [qx, qy, qz, qw] = normalizeQuat4(quaternion);
  const [vx, vy, vz] = point;
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

function jointAnchorError(
  statesByBody: Map<number, RigidBodyReadbackState>,
  joint: MiniBridgeJointDescriptor,
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

function currentJointAngularError(
  qA: [number, number, number, number],
  qB: [number, number, number, number],
  restRelative: [number, number, number, number],
): [number, number, number] {
  const worldQA = normalizeQuat4(qA);
  const currentQB = normalizeQuat4(qB);
  const currentRelative = normalizeQuat4(multiplyQuat4(conjugateQuat4(worldQA), currentQB));
  let delta = multiplyQuat4(currentRelative, conjugateQuat4(normalizeQuat4(restRelative)));
  if (delta[3] < 0.0) {
    delta = [-delta[0], -delta[1], -delta[2], -delta[3]];
  }
  return [2.0 * delta[0], 2.0 * delta[1], 2.0 * delta[2]];
}

function demo3dStyleJointAngularError(
  qA: [number, number, number, number],
  qB: [number, number, number, number],
): [number, number, number] {
  const delta = multiplyQuat4(normalizeQuat4(qA), conjugateQuat4(normalizeQuat4(qB)));
  return [2.0 * delta[0], 2.0 * delta[1], 2.0 * delta[2]];
}

function vectorMagnitude3(value: [number, number, number]): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function formatTriple(value: [number, number, number], digits = 3): string {
  return `[${value[0].toFixed(digits)}, ${value[1].toFixed(digits)}, ${value[2].toFixed(digits)}]`;
}

const STACK_PRESET_QUERY_KEY = 'stackPreset';
const PERF_EMIT_FRAME_QUERY_KEY = 'perfEmitFrame';
const PERF_EMIT_COUNT_QUERY_KEY = 'perfEmitCount';
const DEBUG_TIMING_STORAGE_KEY = 'webphys_debug_timing';
const DEBUG_BEHAVIOR_STORAGE_KEY = 'webphys_debug_behavior';
const SHOW_CONTACT_POINTS_STORAGE_KEY = 'webphys_show_contact_points';
const SHADOWS_ENABLED_STORAGE_KEY = 'webphys_shadows_enabled';
const SIMULATION_PAUSED_STORAGE_KEY = 'webphys_simulation_paused';
const LOG_EVERY_STEP_STORAGE_KEY = 'webphys_log_every_step';
const DUAL_UPDATE_BETA_STORAGE_KEY = 'webphys_dual_update_beta';
const REGULARIZATION_ALPHA_STORAGE_KEY = 'webphys_regularization_alpha';
const PENALTY_GAMMA_STORAGE_KEY = 'webphys_penalty_gamma';
const AVBD_PENALTY_FLOOR_STORAGE_KEY = 'webphys_avbd_penalty_floor';
const SOLVER_ITERATIONS_STORAGE_KEY = 'webphys_solver_iterations';
const DEFAULT_STACK_PRESET: StackPreset = 'single-5';
const STACK_PRESET_CONFIGS: Record<StackPreset, StackPresetConfig> = {
  'single-5': {
    maxBodies: 2048,
    initialCount: 5 * 5 * 5,
    cameraPosition: [0, 3.2, 10],
    cameraLookAt: [0, 1.5, 0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 5,
      sizeY: 5,
      sizeZ: 5,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'single-10': {
    maxBodies: 8192,
    initialCount: 10 * 10 * 10,
    cameraPosition: [0, 5.0, 16],
    cameraLookAt: [0, 3.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 32,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 10,
      sizeY: 10,
      sizeZ: 10,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'wall-10x10x1': {
    maxBodies: 4096,
    initialCount: 10 * 10 * 1,
    cameraPosition: [0, 4.0, 14.0],
    cameraLookAt: [0, 2.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 10,
      sizeY: 10,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'line-2x1x1': {
    maxBodies: 256,
    initialCount: 2,
    cameraPosition: [0, 1.8, 5.0],
    cameraLookAt: [0, 0.9, 0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 2,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'line-1x1x1': {
    maxBodies: 256,
    initialCount: 1,
    cameraPosition: [0, 1.4, 4.2],
    cameraLookAt: [0, 0.55, 0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'line-3x1x1': {
    maxBodies: 256,
    initialCount: 3,
    cameraPosition: [0, 2.2, 5.5],
    cameraLookAt: [0, 1.2, 0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 3,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'line-10x1x1': {
    maxBodies: 1024,
    initialCount: 10 * 1 * 1,
    cameraPosition: [0, 4.6, 9.0],
    cameraLookAt: [0, 2.7, 0],
    physics: {
      maxPairsPerBodyBroadphase: 32,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 10,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'bridge-demo': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [0, 16.0, 34.0],
    cameraLookAt: [0, 8.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 64,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'bridge-demo-empty': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [0, 16.0, 34.0],
    cameraLookAt: [0, 8.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 32,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'bridge-demo-fixed': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [0, 16.0, 34.0],
    cameraLookAt: [0, 8.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 64,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'soft-body': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [14.0, 18.0, 28.0],
    cameraLookAt: [0.0, 13.0, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'bunny-soft-body': {
    maxBodies: 12288,
    initialCount: 0,
    cameraPosition: [14.0, 12.0, 22.0],
    cameraLookAt: [0.0, 7.0, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 96,
      maxContactsPerBodySolver: 192,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'spring-demo': {
    maxBodies: 320,
    initialCount: 0,
    cameraPosition: [0, 28.0, 58.0],
    cameraLookAt: [0, 18.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 24,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'spring-ratio': {
    maxBodies: 256,
    initialCount: 0,
    cameraPosition: [0, 17.5, 22.0],
    cameraLookAt: [0, 17.5, 0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'rope-demo': {
    maxBodies: 256,
    initialCount: 0,
    cameraPosition: [0, 16.0, 28.0],
    cameraLookAt: [0, 12.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 24,
      maxContactsPerBodySolver: 96,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'heavy-rope-demo': {
    maxBodies: 256,
    initialCount: 0,
    cameraPosition: [0, 19.0, 32.0],
    cameraLookAt: [0, 15.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 24,
      maxContactsPerBodySolver: 96,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'sphere-demo': {
    maxBodies: 256,
    initialCount: 0,
    cameraPosition: [0, 7.0, 18.0],
    cameraLookAt: [0, 3.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'ragdoll-cloth-demo': {
    maxBodies: 4096,
    initialCount: 0,
    cameraPosition: [0, 24.0, 46.0],
    cameraLookAt: [0, 12.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'ragdoll-carousel-demo': {
    maxBodies: 4096,
    initialCount: 0,
    cameraPosition: [0, 22.0, 42.0],
    cameraLookAt: [0, 15.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'jointed-sandbox-demo': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [0, 12.0, 56.0],
    cameraLookAt: [0, 6.5, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'cloth-boxes-demo': {
    maxBodies: 1024,
    initialCount: 0,
    cameraPosition: [0, 11.0, 18.0],
    cameraLookAt: [0, 7.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 32,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 12,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'coliseum-50k': {
    maxBodies: 50688,
    initialCount: 0,
    cameraPosition: [48.0, 12.0, 48.0],
    cameraLookAt: [0.0, 5.0, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 12,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'coliseum-64k': {
    maxBodies: 64512,
    initialCount: 0,
    cameraPosition: [52.0, 13.0, 52.0],
    cameraLookAt: [0.0, 5.5, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 12,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'pyramid-8': {
    maxBodies: 2048,
    initialCount: (8 * 9) / 2,
    cameraPosition: [0, 3.8, 11.0],
    cameraLookAt: [0, 1.5, 0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'pyramid-wall',
    pyramidWall: {
      x: 0,
      z: 0,
      startY: 0.3,
      layers: 8,
      stepX: 0.63,
      stepY: 0.51,
    },
  },
  'waterfall-gutter': {
    maxBodies: 8192,
    initialCount: 11 * 28 * 5,
    cameraPosition: [10.0, 30.0, 72.0],
    cameraLookAt: [8.0, 16.0, -8.0],
    physics: {
      maxPairsPerBodyBroadphase: 48,
      maxContactsPerBodySolver: 128,
      maxPairSolveColorCount: 16,
    },
    layout: 'grid',
    grid: {
      x: -7.0,
      z: 0.0,
      startY: 32.0,
      sizeX: 11,
      sizeY: 28,
      sizeZ: 5,
      spacing: 0.06,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'grid-1000x10': {
    maxBodies: 12288,
    initialCount: 1000 * 10,
    cameraPosition: [0, 26.0, 70.0],
    cameraLookAt: [0, 8.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 12,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 10,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 25,
      stacksZ: 40,
      stackSpacingX: 0.5,
      stackSpacingZ: 0.5,
    },
  },
  'grid-64x10': {
    maxBodies: 65536,
    initialCount: 64 * 10 * 10 * 10,
    cameraPosition: [0, 12.0, 36.0],
    cameraLookAt: [0, 6.0, 0],
    physics: {
      maxPairsPerBodyBroadphase: 12,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0,
      z: 0,
      startY: 0.3,
      sizeX: 10,
      sizeY: 10,
      sizeZ: 10,
      spacing: 0.01,
      stacksX: 8,
      stacksZ: 8,
      stackSpacingX: 0.5,
      stackSpacingZ: 0.5,
    },
  },
  'dominoes-demo': {
    maxBodies: 32768,
    initialCount: 0,
    cameraPosition: [0.0, 19.0, 78.0],
    cameraLookAt: [0.0, 5.5, 4.0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'dominoes-advanced-demo': {
    maxBodies: 32768,
    initialCount: 0,
    cameraPosition: [0.0, 18.0, 58.0],
    cameraLookAt: [0.0, 8.0, 5.0],
    physics: {
      maxPairsPerBodyBroadphase: 16,
      maxContactsPerBodySolver: 64,
      maxPairSolveColorCount: 8,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'newtons-cradles-demo': {
    maxBodies: 2048,
    initialCount: 0,
    cameraPosition: [0.0, 15.0, 68.0],
    cameraLookAt: [0.0, 7.5, -6.0],
    physics: {
      maxPairsPerBodyBroadphase: 24,
      maxContactsPerBodySolver: 48,
      maxPairSolveColorCount: 10,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
  'ragdoll-avalanche-demo': {
    maxBodies: 16384,
    initialCount: 0,
    cameraPosition: [78.0, 48.0, 0.0],
    cameraLookAt: [6.0, 34.0, 0.0],
    physics: {
      maxPairsPerBodyBroadphase: 24,
      maxContactsPerBodySolver: 40,
    },
    layout: 'grid',
    grid: {
      x: 0.0,
      z: 0.0,
      startY: 0.3,
      sizeX: 1,
      sizeY: 1,
      sizeZ: 1,
      spacing: 0.01,
      stacksX: 1,
      stacksZ: 1,
      stackSpacingX: 0.0,
      stackSpacingZ: 0.0,
    },
  },
};

function isStackPreset(value: string | null): value is StackPreset {
  return value === 'single-5'
    || value === 'single-10'
    || value === 'wall-10x10x1'
    || value === 'line-1x1x1'
    || value === 'line-2x1x1'
    || value === 'line-3x1x1'
    || value === 'line-10x1x1'
    || value === 'bridge-demo'
    || value === 'bridge-demo-empty'
    || value === 'bridge-demo-fixed'
    || value === 'soft-body'
    || value === 'bunny-soft-body'
    || value === 'spring-demo'
    || value === 'spring-ratio'
    || value === 'rope-demo'
    || value === 'heavy-rope-demo'
    || value === 'sphere-demo'
    || value === 'ragdoll-cloth-demo'
    || value === 'ragdoll-carousel-demo'
    || value === 'jointed-sandbox-demo'
    || value === 'cloth-boxes-demo'
    || value === 'coliseum-50k'
    || value === 'coliseum-64k'
    || value === 'pyramid-8'
    || value === 'waterfall-gutter'
    || value === 'grid-1000x10'
    || value === 'grid-64x10'
    || value === 'dominoes-demo'
    || value === 'dominoes-advanced-demo'
    || value === 'newtons-cradles-demo'
    || value === 'ragdoll-avalanche-demo';
}

function getStackPresetFromUrl(): StackPreset {
  const value = new URLSearchParams(window.location.search).get(STACK_PRESET_QUERY_KEY);
  return isStackPreset(value) ? value : DEFAULT_STACK_PRESET;
}

function reloadWithStackPreset(preset: StackPreset): void {
  const url = new URL(window.location.href);
  url.searchParams.set(STACK_PRESET_QUERY_KEY, preset);
  window.location.href = url.toString();
}

function loadPerfEmitConfig(): { frame: number; count: number } | null {
  try {
    const url = new URL(window.location.href);
    const frameRaw = url.searchParams.get(PERF_EMIT_FRAME_QUERY_KEY);
    if (!frameRaw) return null;

    const frame = Math.max(0, Math.floor(Number(frameRaw)));
    if (!Number.isFinite(frame)) return null;

    const countRaw = url.searchParams.get(PERF_EMIT_COUNT_QUERY_KEY);
    const count = countRaw === null ? 16 : Math.max(1, Math.floor(Number(countRaw)));
    if (!Number.isFinite(count)) return null;

    return { frame, count };
  } catch {
    return null;
  }
}

function loadDebugTimingEnabled(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(DEBUG_TIMING_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistDebugTimingEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(DEBUG_TIMING_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadDebugBehaviorEnabled(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(DEBUG_BEHAVIOR_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistDebugBehaviorEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(DEBUG_BEHAVIOR_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadShowContactPoints(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(SHOW_CONTACT_POINTS_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistShowContactPoints(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHOW_CONTACT_POINTS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadShadowsEnabled(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(SHADOWS_ENABLED_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistShadowsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHADOWS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadSimulationPaused(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(SIMULATION_PAUSED_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistSimulationPaused(paused: boolean): void {
  try {
    window.localStorage.setItem(SIMULATION_PAUSED_STORAGE_KEY, paused ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadLogEveryStep(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(LOG_EVERY_STEP_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const normalized = stored.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
  } catch {
    return defaultValue;
  }
}

function persistLogEveryStep(enabled: boolean): void {
  try {
    window.localStorage.setItem(LOG_EVERY_STEP_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadDualUpdateBeta(defaultValue: number): number {
  try {
    const stored = window.localStorage.getItem(DUAL_UPDATE_BETA_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const value = Number(stored);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(0.0, value);
  } catch {
    return defaultValue;
  }
}

function persistDualUpdateBeta(beta: number): void {
  try {
    const clamped = Math.max(0.0, beta);
    window.localStorage.setItem(DUAL_UPDATE_BETA_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadRegularizationAlpha(defaultValue: number): number {
  try {
    const stored = window.localStorage.getItem(REGULARIZATION_ALPHA_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const value = Number(stored);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(0.0, Math.min(1.0, value));
  } catch {
    return defaultValue;
  }
}

function persistRegularizationAlpha(alpha: number): void {
  try {
    const clamped = Math.max(0.0, Math.min(1.0, alpha));
    window.localStorage.setItem(REGULARIZATION_ALPHA_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadPenaltyDecayGamma(defaultValue: number): number {
  try {
    const stored = window.localStorage.getItem(PENALTY_GAMMA_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const value = Number(stored);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(0.0, Math.min(1.0, value));
  } catch {
    return defaultValue;
  }
}

function persistPenaltyDecayGamma(gamma: number): void {
  try {
    const clamped = Math.max(0.0, Math.min(1.0, gamma));
    window.localStorage.setItem(PENALTY_GAMMA_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

function loadAvbdPenaltyFloor(defaultValue: number): number {
  try {
    const stored = window.localStorage.getItem(AVBD_PENALTY_FLOOR_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const value = Number(stored);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(1e-6, value);
  } catch {
    return defaultValue;
  }
}

function loadSolverIterations(defaultValue: number): number {
  try {
    const stored = window.localStorage.getItem(SOLVER_ITERATIONS_STORAGE_KEY);
    if (stored === null) return defaultValue;
    const value = Number(stored);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(1, Math.min(64, Math.floor(value)));
  } catch {
    return defaultValue;
  }
}

function persistSolverIterations(iterations: number): void {
  try {
    const clamped = Math.max(1, Math.min(64, Math.floor(iterations)));
    window.localStorage.setItem(SOLVER_ITERATIONS_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage errors (private mode / blocked storage).
  }
}

async function main() {
  const stackPreset = getStackPresetFromUrl();
  const perfEmitConfig = loadPerfEmitConfig();
  const stackConfig = STACK_PRESET_CONFIGS[stackPreset];
  const MAX_BODIES = stackConfig.maxBodies;
  const initialPairManifoldSlots = 8;
  const defaultShadowsEnabled = false;
  const initialShadowsEnabled = loadShadowsEnabled(defaultShadowsEnabled);

  const ctx = await initRenderer();
  const setShadowsEnabled = (enabled: boolean): void => {
    ctx.renderer.shadowMap.enabled = enabled;
    ctx.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      if (Array.isArray(material)) {
        for (const entry of material) entry.needsUpdate = true;
      } else {
        material.needsUpdate = true;
      }
    });
  };
  setShadowsEnabled(initialShadowsEnabled);
  ctx.controls.enabled = false;
  ctx.camera.position.set(
    stackConfig.cameraPosition[0],
    stackConfig.cameraPosition[1],
    stackConfig.cameraPosition[2],
  );
  ctx.camera.lookAt(
    stackConfig.cameraLookAt[0],
    stackConfig.cameraLookAt[1],
    stackConfig.cameraLookAt[2],
  );

  // Physics
  const physics = new PhysicsEngine(ctx.device, {
    maxBodies: MAX_BODIES,
    gravity: [0, -9.81, 0],
    substeps: 4,
    deltaTime: 1 / 60,
    pairManifoldSlots: initialPairManifoldSlots,
    solverIterations: 4,
    pairSolveColorCount: stackConfig.physics.maxPairSolveColorCount,
    maxPairsPerBodyBroadphase: stackConfig.physics.maxPairsPerBodyBroadphase,
    maxContactsPerBodySolver: stackConfig.physics.maxContactsPerBodySolver ?? 64,
    // Keep the interactive demo out of catch-up spirals: if physics is slower
    // than real time, advance one fixed step per render frame and let sim time
    // slow down instead of stacking multiple full GPU solves into one frame.
    maxFixedStepsPerFrame: 1,
    enableBvhBuild: true,
    bvhBuildOnce: false,
    bvhRebuildIntervalFrames: 1,
    bvhWaitForGpuCompletion: false,
    avbdFriction: AVBD_FRICTION_STATIC,
    avbdBodySolveMode: 'colored',
  });
  const initialFriction = stackPreset === 'waterfall-gutter' ? 0.2 : AVBD_FRICTION_STATIC;
  const logAvbdConfig = (reason: string): void => {
    console.info(
      `[AVBD Config] reason=${reason} mode=avbd-paper-regularized-local-arms-normal-margin-manifold-basis ` +
      `substeps=${physics.getSubsteps()} solverIterations=${physics.getSolverIterations()} ` +
      `manifoldSlots=${physics.getPairManifoldSlots()} ` +
      `pairSweeps=${physics.getAvbdPairSweeps()} ` +
      `penetratingSupportFloor=${physics.getAvbdPreventPenetratingNormalDropout() ? 1 : 0} ` +
      `beta=${physics.getAvbdDualUpdateBeta().toFixed(3)} ` +
      `alpha=${physics.getAvbdRegularizationAlpha().toFixed(3)} ` +
      `gamma=${physics.getAvbdPenaltyDecayGamma().toFixed(3)} ` +
      `kStart=${physics.getAvbdPenaltyFloor().toFixed(3)}`,
    );
  };
  const initialSimulationPaused = loadSimulationPaused(false);
  const initialLogEveryStep = loadLogEveryStep(false);
  applyReferenceAvbdConfig(physics);
  if (stackConfig.physics.activePairSolveColorCount !== undefined) {
    physics.setPairSolveColorCount(stackConfig.physics.activePairSolveColorCount);
  }
  const defaultDualUpdateBeta = physics.getAvbdDualUpdateBeta();
  const defaultRegularizationAlpha = physics.getAvbdRegularizationAlpha();
  const defaultPenaltyDecayGamma = physics.getAvbdPenaltyDecayGamma();
  const defaultAvbdPenaltyFloor = physics.getAvbdPenaltyFloor();
  const defaultSolverIterations = physics.getSolverIterations();
  const initialDualUpdateBeta = loadDualUpdateBeta(defaultDualUpdateBeta);
  const initialRegularizationAlpha = loadRegularizationAlpha(defaultRegularizationAlpha);
  const initialPenaltyDecayGamma = loadPenaltyDecayGamma(defaultPenaltyDecayGamma);
  const initialAvbdPenaltyFloor = loadAvbdPenaltyFloor(defaultAvbdPenaltyFloor);
  const initialSolverIterations = defaultSolverIterations;
  physics.setAvbdFriction(initialFriction);
  physics.setAvbdDualUpdateBeta(initialDualUpdateBeta);
  physics.setAvbdRegularizationAlpha(initialRegularizationAlpha);
  physics.setAvbdPenaltyDecayGamma(initialPenaltyDecayGamma);
  physics.setAvbdPenaltyFloor(initialAvbdPenaltyFloor);
  physics.setSolverIterations(initialSolverIterations);
  logAvbdConfig('startup');
  physics.setDebugLogEveryFrame(initialLogEveryStep);

  const playerEyeOffset = 0.75;
  const floorHalfExtents: [number, number, number] = [100.0, 0.5, 100.0];
  type CollisionFilterOptions = {
    collisionGroup?: number;
    collisionMask?: number;
  };

  const buildSceneRuntime = (): SceneRuntime => {
    const sceneRoot = new THREE.Group();
    ctx.scene.add(sceneRoot);

    const staticVisuals: THREE.Mesh[] = [];
    const trackedVisualSets: Array<ReturnType<typeof createTrackedBodyVisualSet>> = [];
    const trackedSpringVisualSets: Array<ReturnType<typeof createTrackedSpringVisualSet>> = [];
    const syncedSceneVisuals: SyncedSceneVisual[] = [];
    const sceneUpdateCallbacks: Array<(dt: number) => void> = [];
    let bridgeMiniDiagnostics: MiniBridgeDiagnosticsConfig | null = null;
    let carouselDiagnostics: CarouselDiagnosticsConfig | null = null;
    let shootProjectileOverride: ((config: ProjectileShootConfig) => boolean) | null = null;
    let sceneStatusText: (() => string | null) | null = null;

    const boxCapacity = MAX_BODIES - 1;
    const spawner = createBoxSpawner(sceneRoot, physics, {
      count: boxCapacity,
      initialCount: Math.min(stackConfig.initialCount, boxCapacity),
      halfExtents: [0.3, 0.3, 0.3],
      layout: stackConfig.layout,
      ...(stackConfig.grid ? { grid: stackConfig.grid } : {}),
      ...(stackConfig.pyramidWall ? { pyramidWall: stackConfig.pyramidWall } : {}),
      emitter: {
        enabled: false,
        rate: 24.0,
      },
      randomRotation: false,
      rotationJitter: 0.04,
    });
    const defaultEmitter = spawner.getEmitter();

    const addStaticBoxWithVisual = (
      position: [number, number, number],
      halfExtents: [number, number, number],
      options?: {
        quaternion?: [number, number, number, number];
        color?: number;
      },
    ): void => {
      physics.addBody({
        position,
        mass: 0.0,
        halfExtents,
        ...(options?.quaternion ? { quaternion: options.quaternion } : {}),
        lockRotation: true,
      });

      const visual = new THREE.Mesh(
        new THREE.BoxGeometry(halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2),
        new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x586474,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      visual.position.set(position[0], position[1], position[2]);
      if (options?.quaternion) {
        visual.quaternion.set(
          options.quaternion[0],
          options.quaternion[1],
          options.quaternion[2],
          options.quaternion[3],
        );
      }
      visual.castShadow = true;
      visual.receiveShadow = true;
      sceneRoot.add(visual);
      staticVisuals.push(visual);
    };

    const addStaticCylinderWithVisual = (
      position: [number, number, number],
      radius: number,
      halfHeight: number,
      options?: {
        color?: number;
      },
    ): void => {
      physics.addBody({
        position,
        mass: 0.0,
        halfExtents: [radius, halfHeight, radius],
        lockRotation: true,
      });

      const visual = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 28),
        new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x586474,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      visual.position.set(position[0], position[1], position[2]);
      visual.castShadow = true;
      visual.receiveShadow = true;
      sceneRoot.add(visual);
      staticVisuals.push(visual);
    };

    const addDynamicBoxWithTrackedVisual = (
      position: [number, number, number],
      halfExtents: [number, number, number],
      trackedVisuals: ReturnType<typeof createTrackedBodyVisualSet>,
      options?: {
        mass?: number;
        friction?: number;
        quaternion?: [number, number, number, number];
        linearVelocity?: [number, number, number];
        collisionGroup?: number;
        collisionMask?: number;
      },
    ): number => {
      const body = physics.addBody({
        position,
        mass: options?.mass ?? 1.0,
        halfExtents,
        friction: options?.friction ?? AVBD_FRICTION_STATIC,
        quaternion: options?.quaternion,
        linearVelocity: options?.linearVelocity,
        collisionGroup: options?.collisionGroup,
        collisionMask: options?.collisionMask,
      });
      trackedVisuals.addBody(body);
      return body;
    };

    const addDynamicSphereWithTrackedVisual = (
      position: [number, number, number],
      radius: number,
      trackedVisuals: ReturnType<typeof createTrackedBodyVisualSet>,
      options?: {
        mass?: number;
        friction?: number;
        quaternion?: [number, number, number, number];
        linearVelocity?: [number, number, number];
        collisionGroup?: number;
        collisionMask?: number;
      },
    ): number => {
      const body = physics.addBody({
        position,
        shapeType: 'sphere',
        radius,
        mass: options?.mass ?? 1.0,
        friction: options?.friction ?? AVBD_FRICTION_STATIC,
        quaternion: options?.quaternion,
        linearVelocity: options?.linearVelocity,
        collisionGroup: options?.collisionGroup,
        collisionMask: options?.collisionMask,
      });
      trackedVisuals.addBody(body);
      return body;
    };

    const isBridgePreset =
      stackPreset === 'bridge-demo'
      || stackPreset === 'bridge-demo-empty'
      || stackPreset === 'bridge-demo-fixed';
    const isSpringPreset =
      stackPreset === 'spring-demo'
      || stackPreset === 'spring-ratio';
    const isSpherePreset = stackPreset === 'sphere-demo';

    if (
      stackPreset !== 'waterfall-gutter'
      && stackPreset !== 'dominoes-advanced-demo'
      && stackPreset !== 'bunny-soft-body'
      && !isBridgePreset
      && !isSpringPreset
    ) {
      addStaticBoxWithVisual(
        [0.0, -floorHalfExtents[1], 0.0],
        floorHalfExtents,
        { color: 0x495563 },
      );
    }

    if (stackPreset === 'waterfall-gutter') {
      const gutterTilt = -0.18;
      const gutterFloorHalfExtents: [number, number, number] = [11.0, 0.45, 3.2];
      const gutterWallHalfExtents: [number, number, number] = [11.0, 1.1, 0.35];
      const gutterWallZ = 3.55;
      const gutterLiftY = 1.05;

      const slopeRatio = Math.tan(Math.abs(gutterTilt));
      const up = new THREE.Vector3(0.0, 1.0, 0.0);
      const makeGutterOrientation = (horizontalFlow: THREE.Vector3): THREE.Quaternion => {
        const flow = horizontalFlow.clone().setY(0).normalize();
        const xAxis = new THREE.Vector3(flow.x, -slopeRatio, flow.z).normalize();
        const zAxis = new THREE.Vector3().crossVectors(up, xAxis).normalize();
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
        const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        return new THREE.Quaternion().setFromRotationMatrix(basis);
      };

      const gutterOrientations = [
        makeGutterOrientation(new THREE.Vector3(1.0, 0.0, 0.0)),
        makeGutterOrientation(new THREE.Vector3(0.0, 0.0, 1.0)),
        makeGutterOrientation(new THREE.Vector3(-1.0, 0.0, 0.0)),
        makeGutterOrientation(new THREE.Vector3(0.0, 0.0, -1.0)),
        makeGutterOrientation(new THREE.Vector3(1.0, 0.0, 0.0)),
      ];

      const segmentCenters: THREE.Vector3[] = [new THREE.Vector3(0.0, 22.0, 0.0)];
      const segmentHalfLength = gutterFloorHalfExtents[0];
      const dropPerJoin = 5.8;
      const joinLocalOffsets: Array<[number, number, number]> = [
        [5.0, dropPerJoin, 3.0],
        [5.0, dropPerJoin, 3.0],
        [5.0, dropPerJoin, 3.0],
        [5.0, dropPerJoin, 3.0],
      ];
      for (let i = 1; i < gutterOrientations.length; i++) {
        const prevCenter = segmentCenters[i - 1];
        const prevOrientation = gutterOrientations[i - 1];
        const prevDir = new THREE.Vector3(1.0, 0.0, 0.0).applyQuaternion(gutterOrientations[i - 1]).normalize();
        const nextDir = new THREE.Vector3(1.0, 0.0, 0.0).applyQuaternion(gutterOrientations[i]).normalize();
        const prevLowEnd = prevCenter.clone().addScaledVector(prevDir, segmentHalfLength);
        const localOffset = joinLocalOffsets[i - 1] ?? [0.0, -dropPerJoin, 0.0];
        const offsetWorld = new THREE.Vector3(localOffset[0], localOffset[1], localOffset[2])
          .applyQuaternion(prevOrientation);
        const nextHighEnd = prevLowEnd.clone().add(offsetWorld);
        segmentCenters.push(nextHighEnd.addScaledVector(nextDir, segmentHalfLength));
      }

      const addGutterSegment = (center: THREE.Vector3, orientation: THREE.Quaternion): void => {
        const q: [number, number, number, number] = [orientation.x, orientation.y, orientation.z, orientation.w];
        addStaticBoxWithVisual([center.x, center.y, center.z], gutterFloorHalfExtents, {
          quaternion: q,
          color: 0x4a5563,
        });

        const wallSide = new THREE.Vector3(0.0, 0.0, 1.0).applyQuaternion(orientation).normalize();
        const wallLift = new THREE.Vector3(0.0, gutterLiftY, 0.0);
        const wallA = center.clone().add(wallLift).addScaledVector(wallSide, gutterWallZ);
        const wallB = center.clone().add(wallLift).addScaledVector(wallSide, -gutterWallZ);
        addStaticBoxWithVisual([wallA.x, wallA.y, wallA.z], gutterWallHalfExtents, {
          quaternion: q,
          color: 0x6a7689,
        });
        addStaticBoxWithVisual([wallB.x, wallB.y, wallB.z], gutterWallHalfExtents, {
          quaternion: q,
          color: 0x6a7689,
        });
      };

      for (let i = 0; i < segmentCenters.length; i++) {
        addGutterSegment(segmentCenters[i], gutterOrientations[i]);
      }

      const firstCenter = segmentCenters[0];
      const firstDir = new THREE.Vector3(1.0, 0.0, 0.0).applyQuaternion(gutterOrientations[0]).normalize();
      const firstHighEnd = firstCenter.clone().addScaledVector(firstDir, -segmentHalfLength);
      const capCenter = firstHighEnd.clone().addScaledVector(firstDir, -0.7);
      const firstQ = gutterOrientations[0];
      addStaticBoxWithVisual([capCenter.x, capCenter.y, capCenter.z], [0.55, 2.6, 3.2], {
        quaternion: [firstQ.x, firstQ.y, firstQ.z, firstQ.w],
        color: 0x73839a,
      });
    }

    if (isBridgePreset) {
      const COLLISION_GROUP_WORLD = 0x01;
      const COLLISION_GROUP_PLANK = 0x02;
      const COLLISION_GROUP_LOAD = 0x04;
      const rigidJointStiffness = Number.POSITIVE_INFINITY;
      const useFixedBridgeJoints = stackPreset === 'bridge-demo-fixed';
      const spawnBridgeLoads = stackPreset === 'bridge-demo';
      const plankCount = 40;
      const plankHalfExtents: [number, number, number] = [0.5, 0.25, 2.0];
      const plankHalfLength = plankHalfExtents[0];
      const plankHalfWidth = plankHalfExtents[2];
      const bridgeY = 10.0;
      const plankDensity = 1.0;
      const loadHalfExtents: [number, number, number] = [0.5, 0.5, 0.5];
      const boxMassFromDensity = (halfExtents: [number, number, number], density: number): number => {
        const volume = halfExtents[0] * 2.0 * halfExtents[1] * 2.0 * halfExtents[2] * 2.0;
        return volume * density;
      };
      const plankMass = boxMassFromDensity(plankHalfExtents, plankDensity);
      const loadMass = boxMassFromDensity(loadHalfExtents, 1.0);
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

      addStaticBoxWithVisual(
        [0.0, -floorHalfExtents[1], 0.0],
        floorHalfExtents,
        { color: 0x495563 },
      );
      physics.setBodyCollisionFilter(0, worldFilter.collisionGroup ?? 0x01, worldFilter.collisionMask ?? 0xff);

      const loadCols = Math.max(1, Math.floor(plankCount / 4));
      const loadRows = Math.max(1, Math.floor(plankCount / 8));
      const plankVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
        capacity: plankCount,
        halfExtents: plankHalfExtents,
        color: 0x8f6737,
        roughness: 0.82,
        metalness: 0.04,
      });
      trackedVisualSets.push(plankVisuals);
      const loadVisuals = spawnBridgeLoads ? createTrackedBodyVisualSet(sceneRoot, physics, {
        capacity: loadCols * loadRows,
        halfExtents: loadHalfExtents,
        color: 0xb24c3f,
        roughness: 0.7,
        metalness: 0.08,
      }) : null;
      if (loadVisuals) {
        trackedVisualSets.push(loadVisuals);
      }

      const plankIds: number[] = [];
      for (let i = 0; i < plankCount; i++) {
        const mass = (i === 0 || i === plankCount - 1) ? 0.0 : plankMass;
        plankIds.push(addDynamicBoxWithTrackedVisual(
          [i - plankCount * 0.5, bridgeY, 0.0],
          plankHalfExtents,
          plankVisuals,
          {
            mass,
            friction: 0.5,
            collisionGroup: plankFilter.collisionGroup,
            collisionMask: plankFilter.collisionMask,
          },
        ));
      }
      for (let i = 1; i < plankCount; i++) {
        physics.setBodyPairCollisionIgnored(plankIds[i - 1]!, plankIds[i]!, true);
        if (useFixedBridgeJoints) {
          const joint = physics.addFixedJoint(
            plankIds[i - 1]!,
            plankIds[i]!,
            [plankHalfLength, 0.0, 0.0],
            [-plankHalfLength, 0.0, 0.0],
            rigidJointStiffness,
            true,
          );
        } else {
          physics.addSphericalJoint(
            plankIds[i - 1]!,
            plankIds[i]!,
            [plankHalfLength, 0.0, plankHalfWidth],
            [-plankHalfLength, 0.0, plankHalfWidth],
            rigidJointStiffness,
            true,
          );
          physics.addSphericalJoint(
            plankIds[i - 1]!,
            plankIds[i]!,
            [plankHalfLength, 0.0, -plankHalfWidth],
            [-plankHalfLength, 0.0, -plankHalfWidth],
            rigidJointStiffness,
            true,
          );
        }
      }
      if (loadVisuals) {
        for (let x = 0; x < loadCols; x++) {
          for (let y = 0; y < loadRows; y++) {
            addDynamicBoxWithTrackedVisual(
              [x - plankCount / 8.0, y + 12.0, 0.0],
              loadHalfExtents,
              loadVisuals,
              {
                mass: loadMass,
                friction: 0.5,
                collisionGroup: loadFilter.collisionGroup,
                collisionMask: loadFilter.collisionMask,
              },
            );
          }
        }
      }
    }

    if (isSpringPreset) {
      const springSceneHeightOffset = 9.5;
      const springGroundHalfExtents: [number, number, number] = [100.0, 0.5, 100.0];
      addStaticBoxWithVisual(
        [0.0, -springGroundHalfExtents[1], 0.0],
        springGroundHalfExtents,
        { color: 0x495563 },
      );

      if (stackPreset === 'spring-demo') {
        const springGridCols = 10;
        const springGridRows = 10;
        const springCellSpacingX = 5.0;
        const springCellSpacingZ = 5.0;
        const springAnchorY = 14.0 + springSceneHeightOffset;
        const springBlockY = 8.0 + springSceneHeightOffset;
        const springCount = springGridCols * springGridRows;
        const springSeed01 = (index: number, salt: number): number => {
          const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453123;
          return value - Math.floor(value);
        };
        const springLines = createTrackedSpringVisualSet(sceneRoot, {
          capacity: springCount,
          color: 0x9fd0ff,
        });
        trackedSpringVisualSets.push(springLines);
        const anchorVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
          capacity: springCount,
          halfExtents: [0.5, 0.5, 0.5],
          color: 0x7f5d36,
          roughness: 0.82,
          metalness: 0.04,
        });
        const blockVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
          capacity: springCount,
          halfExtents: [1.0, 1.0, 1.0],
          color: 0x7f5d36,
          roughness: 0.82,
          metalness: 0.04,
        });
        trackedVisualSets.push(anchorVisuals, blockVisuals);

        for (let row = 0; row < springGridRows; row++) {
          for (let col = 0; col < springGridCols; col++) {
            const springIndex = row * springGridCols + col;
            const baseX = (col - (springGridCols - 1) * 0.5) * springCellSpacingX;
            const baseZ = (row - (springGridRows - 1) * 0.5) * springCellSpacingZ;
            const blockMass = THREE.MathUtils.lerp(0.6, 2.4, springSeed01(springIndex, 0.19));
            const springStiffness = THREE.MathUtils.lerp(55.0, 220.0, springSeed01(springIndex, 0.47));
            const lateralOffset = THREE.MathUtils.lerp(-1.1, 1.1, springSeed01(springIndex, 0.83));

            const anchor = addDynamicBoxWithTrackedVisual(
              [baseX, springAnchorY, baseZ],
              [0.5, 0.5, 0.5],
              anchorVisuals,
              { mass: 0.0, friction: 0.5 },
            );
            const block = addDynamicBoxWithTrackedVisual(
              [baseX + lateralOffset, springBlockY, baseZ],
              [1.0, 1.0, 1.0],
              blockVisuals,
              { mass: blockMass, friction: 0.5 },
            );
            const spring = physics.addSpring(
              anchor,
              block,
              [0.0, 0.0, 0.0],
              [0.0, 0.0, 0.0],
              springStiffness,
              4.0,
            );
            springLines.addSpring(spring);
          }
        }
      } else {
        const springLines = createTrackedSpringVisualSet(sceneRoot, {
          capacity: 7,
          color: 0x9fd0ff,
        });
        trackedSpringVisualSets.push(springLines);
        const springVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
          capacity: 8,
          halfExtents: [0.5, 0.375, 0.375],
          color: 0x7f5d36,
          roughness: 0.82,
          metalness: 0.04,
        });
        trackedVisualSets.push(springVisuals);

        const bodies: number[] = [];
        const springCount = 8;
        for (let i = 0; i < springCount; i++) {
          const x = (i - (springCount - 1) * 0.5) * 3.0;
          bodies.push(addDynamicBoxWithTrackedVisual(
            [x, 12.0 + springSceneHeightOffset, 0.0],
            [0.5, 0.375, 0.375],
            springVisuals,
            { mass: (i === 0 || i === springCount - 1) ? 0.0 : 1.0, friction: 0.5 },
          ));
          if (i > 0) {
            const spring = physics.addSpring(
              bodies[i - 1]!,
              bodies[i]!,
              [0.5, 0.0, 0.0],
              [-0.5, 0.0, 0.0],
              i % 2 === 0 ? 10.0 : 10000.0,
              3.0,
            );
            springLines.addSpring(spring);
          }
        }
      }
    }

    if (isSpherePreset) {
      const largeSphereVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
        capacity: 1,
        geometry: new THREE.SphereGeometry(1.0, 28, 20),
        color: 0x9fd0ff,
        roughness: 0.58,
        metalness: 0.08,
      });
      const smallSphereVisuals = createTrackedBodyVisualSet(sceneRoot, physics, {
        capacity: 2,
        geometry: new THREE.SphereGeometry(0.75, 24, 18),
        color: 0x9fd0ff,
        roughness: 0.58,
        metalness: 0.08,
      });
      trackedVisualSets.push(largeSphereVisuals, smallSphereVisuals);

      addStaticBoxWithVisual(
        [-4.0, 1.0, 0.0],
        [2.0, 1.0, 2.0],
        { color: 0x586474 },
      );

      addDynamicSphereWithTrackedVisual(
        [-4.0, 4.6, 0.0],
        1.0,
        largeSphereVisuals,
        { mass: 2.5, friction: 0.6 },
      );
      addDynamicSphereWithTrackedVisual(
        [2.5, 1.35, 0.0],
        0.75,
        smallSphereVisuals,
        { mass: 1.5, friction: 0.6 },
      );
      addDynamicSphereWithTrackedVisual(
        [2.5, 4.6, 0.0],
        0.75,
        smallSphereVisuals,
        { mass: 1.5, friction: 0.6 },
      );
    }

    if (stackPreset === 'ragdoll-cloth-demo') {
      const ragdollClothScene = buildRagdollClothDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...ragdollClothScene.trackedVisualSets);
      trackedSpringVisualSets.push(...ragdollClothScene.trackedSpringVisualSets);
      syncedSceneVisuals.push(...ragdollClothScene.syncedVisuals);
      sceneUpdateCallbacks.push(ragdollClothScene.update);
    }

    if (stackPreset === 'ragdoll-carousel-demo') {
      const ragdollCarouselScene = buildRagdollCarouselDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
        addStaticCylinderWithVisual,
      });
      trackedVisualSets.push(...ragdollCarouselScene.trackedVisualSets);
      trackedSpringVisualSets.push(...ragdollCarouselScene.trackedSpringVisualSets);
      sceneStatusText = ragdollCarouselScene.getStatusText;
      if (ragdollCarouselScene.diagnostics.joints.length > 0) {
        carouselDiagnostics = {
          joints: ragdollCarouselScene.diagnostics.joints,
        };
      }
      sceneUpdateCallbacks.push(ragdollCarouselScene.update);
    }

    if (stackPreset === 'jointed-sandbox-demo') {
      const jointedSandboxScene = buildJointedSandboxDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...jointedSandboxScene.trackedVisualSets);
      trackedSpringVisualSets.push(...jointedSandboxScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'soft-body') {
      const softBodyScene = buildSoftBodyDemo({
        scene: sceneRoot,
        physics,
      });
      trackedVisualSets.push(...softBodyScene.trackedVisualSets);
      trackedSpringVisualSets.push(...softBodyScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'bunny-soft-body') {
      const bunnySoftBodyScene = buildBunnySoftBodyDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...bunnySoftBodyScene.trackedVisualSets);
      trackedSpringVisualSets.push(...bunnySoftBodyScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'cloth-boxes-demo') {
      const clothBoxesScene = buildClothBoxesDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...clothBoxesScene.trackedVisualSets);
      trackedSpringVisualSets.push(...clothBoxesScene.trackedSpringVisualSets);
      syncedSceneVisuals.push(...clothBoxesScene.syncedVisuals);
      sceneUpdateCallbacks.push(clothBoxesScene.update);
    }

    if (stackPreset === 'rope-demo' || stackPreset === 'heavy-rope-demo') {
      const ropeScene = buildRopeDemo({
        scene: sceneRoot,
        physics,
        variant: stackPreset,
      });
      trackedVisualSets.push(...ropeScene.trackedVisualSets);
      trackedSpringVisualSets.push(...ropeScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'coliseum-50k' || stackPreset === 'coliseum-64k') {
      const coliseumScene = buildColiseumDemo({
        scene: sceneRoot,
        physics,
        variant: stackPreset,
      });
      trackedVisualSets.push(...coliseumScene.trackedVisualSets);
      trackedSpringVisualSets.push(...coliseumScene.trackedSpringVisualSets);
      shootProjectileOverride = coliseumScene.shootProjectile;
    }

    if (stackPreset === 'dominoes-demo') {
      const dominoScene = buildDominoDemo({
        scene: sceneRoot,
        physics,
      });
      trackedVisualSets.push(...dominoScene.trackedVisualSets);
      trackedSpringVisualSets.push(...dominoScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'dominoes-advanced-demo') {
      const dominoScene = buildDominoAdvancedDemo({
        scene: sceneRoot,
        physics,
      });
      trackedVisualSets.push(...dominoScene.trackedVisualSets);
      trackedSpringVisualSets.push(...dominoScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'newtons-cradles-demo') {
      const newtonsCradleScene = buildNewtonsCradleDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...newtonsCradleScene.trackedVisualSets);
      trackedSpringVisualSets.push(...newtonsCradleScene.trackedSpringVisualSets);
    }

    if (stackPreset === 'ragdoll-avalanche-demo') {
      const avalancheScene = buildRagdollAvalancheDemo({
        scene: sceneRoot,
        physics,
        addStaticBoxWithVisual,
      });
      trackedVisualSets.push(...avalancheScene.trackedVisualSets);
      trackedSpringVisualSets.push(...avalancheScene.trackedSpringVisualSets);
    }

    const contactPointOverlay = new ContactPointOverlay(sceneRoot, physics.getMaxActiveContactDebugPoints());

    return {
      sceneRoot,
      spawner,
      defaultEmitter,
      trackedVisualSets,
      trackedSpringVisualSets,
      syncedSceneVisuals,
      sceneUpdateCallbacks,
      contactPointOverlay,
      bridgeMiniDiagnostics,
      carouselDiagnostics,
      sceneStatusText,
      shootProjectileOverride,
      dispose(): void {
        contactPointOverlay.dispose();
        for (const syncedVisuals of syncedSceneVisuals) {
          syncedVisuals.dispose();
        }
        for (const trackedSpringVisuals of trackedSpringVisualSets) {
          trackedSpringVisuals.dispose();
        }
        for (const trackedVisuals of trackedVisualSets) {
          trackedVisuals.dispose();
        }
        spawner.dispose();
        for (const visual of staticVisuals) {
          visual.removeFromParent();
          if (visual.geometry) {
            visual.geometry.dispose();
          }
          const material = visual.material;
          if (Array.isArray(material)) {
            for (const entry of material) {
              entry.dispose();
            }
          } else {
            material.dispose();
          }
        }
        sceneRoot.removeFromParent();
      },
    };
  };

  let activeRuntime = buildSceneRuntime();
  let perfEmitTriggered = false;

  // Debug
  const overlay = new DebugOverlay();
  const gpuPassTimer = new GpuPassTimer(ctx.device, ctx.renderer);
  const defaultDebugTimingEnabled = false;
  const defaultDebugBehaviorEnabled = false;
  const defaultShowContactPoints = false;
  const defaultSimulationPaused = false;
  const defaultLogEveryStep = false;
  const defaultTimeScale = 1.0;
  const debugTimingEnabledByDefault = loadDebugTimingEnabled(defaultDebugTimingEnabled);
  const debugBehaviorEnabledByDefault = loadDebugBehaviorEnabled(defaultDebugBehaviorEnabled);
  const initialShowContactPoints = loadShowContactPoints(defaultShowContactPoints);
  let debugBehaviorEnabled = debugBehaviorEnabledByDefault;
  let showContactPointsEnabled = initialShowContactPoints;
  let logEveryStepEnabled = initialLogEveryStep;
  const setDebugTimingEnabled = (enabled: boolean): void => {
    gpuPassTimer.setEnabled(enabled);
    persistDebugTimingEnabled(enabled);
  };
  const setDebugBehaviorEnabled = (enabled: boolean): void => {
    debugBehaviorEnabled = enabled;
    physics.setDebugBehaviorEnabled(enabled);
    persistDebugBehaviorEnabled(enabled);
  };
  setDebugTimingEnabled(debugTimingEnabledByDefault);
  setDebugBehaviorEnabled(debugBehaviorEnabledByDefault);
  const setShowContactPoints = (enabled: boolean): void => {
    showContactPointsEnabled = enabled;
    activeRuntime.contactPointOverlay.setEnabled(enabled);
    persistShowContactPoints(enabled);
  };
  setShowContactPoints(initialShowContactPoints);
  let timeScale = defaultTimeScale;
  let simulationPaused = initialSimulationPaused;
  let pendingSimulationSteps = 0;
  let emitterPanel: EmitterPanel;
  let fps: FPSController;
  const resetSimulation = (): void => {
    const fpsState: FPSControllerState = fps.captureState();
    fireAccumulator = 0.0;
    triggerHeld = false;
    pendingSimulationSteps = 0;
    bridgeMiniDiagnosticsInFlight = false;
    lastBridgeMiniDiagnosticsFrame = -1;
    carouselDiagnosticsInFlight = false;
    lastCarouselDiagnosticsFrame = -1;
    activeRuntime.dispose();
    physics.clearScene();
    activeRuntime = buildSceneRuntime();
    perfEmitTriggered = false;
    fps.restoreState(fpsState);
    fps.setSceneStatusText(activeRuntime.sceneStatusText?.() ?? null);
    activeRuntime.contactPointOverlay.setEnabled(showContactPointsEnabled);
    emitterPanel.setSpawner(activeRuntime.spawner);
    (window as typeof window & { __WEBPHYS_BRIDGE_MINI_DEBUG__?: unknown }).__WEBPHYS_BRIDGE_MINI_DEBUG__ = undefined;
    (window as typeof window & { __WEBPHYS_DRIVEN_SEAT_DEBUG__?: unknown }).__WEBPHYS_DRIVEN_SEAT_DEBUG__ = undefined;
    (window as typeof window & { __WEBPHYS_CAROUSEL_DEBUG__?: unknown }).__WEBPHYS_CAROUSEL_DEBUG__ = undefined;
  };
  const panelDefaults: EmitterResetDefaults = {
    enabled: activeRuntime.defaultEmitter.enabled,
    rate: activeRuntime.defaultEmitter.rate,
    x: activeRuntime.defaultEmitter.x,
    y: activeRuntime.defaultEmitter.y,
    z: activeRuntime.defaultEmitter.z,
    randomRotation: activeRuntime.defaultEmitter.randomRotation,
    rotationJitter: activeRuntime.defaultEmitter.rotationJitter,
    debugTimingEnabled: defaultDebugTimingEnabled,
    debugBehaviorEnabled: defaultDebugBehaviorEnabled,
    showContactPoints: defaultShowContactPoints,
    shadowsEnabled: defaultShadowsEnabled,
    paused: defaultSimulationPaused,
    logEveryStep: defaultLogEveryStep,
    timeScale: defaultTimeScale,
    friction: initialFriction,
    dualUpdateBeta: defaultDualUpdateBeta,
    regularizationAlpha: defaultRegularizationAlpha,
    penaltyDecayGamma: defaultPenaltyDecayGamma,
    solverIterations: defaultSolverIterations,
    stackPreset,
  };
  emitterPanel = new EmitterPanel(activeRuntime.spawner, ctx.renderer, {
    debugTimingEnabled: debugTimingEnabledByDefault,
    onDebugTimingEnabledChange: (enabled) => setDebugTimingEnabled(enabled),
    debugBehaviorEnabled: debugBehaviorEnabledByDefault,
    onDebugBehaviorEnabledChange: (enabled) => setDebugBehaviorEnabled(enabled),
    showContactPoints: initialShowContactPoints,
    onShowContactPointsChange: (enabled) => {
      setShowContactPoints(enabled);
    },
    shadowsEnabled: initialShadowsEnabled,
    onShadowsEnabledChange: (enabled) => {
      setShadowsEnabled(enabled);
      persistShadowsEnabled(enabled);
    },
    paused: initialSimulationPaused,
    onPausedChange: (paused) => {
      simulationPaused = paused;
      if (!paused) {
        pendingSimulationSteps = 0;
      }
      persistSimulationPaused(paused);
    },
    logEveryStep: initialLogEveryStep,
    onLogEveryStepChange: (enabled) => {
      logEveryStepEnabled = enabled;
      physics.setDebugLogEveryFrame(enabled);
      persistLogEveryStep(enabled);
    },
    onStepOnce: () => {
      if (!simulationPaused) return;
      pendingSimulationSteps = Math.min(pendingSimulationSteps + 1, 32);
    },
    onResetSimulation: () => {
      resetSimulation();
    },
    timeScale,
    onTimeScaleChange: (value) => {
      timeScale = Math.max(0.05, Math.min(2.0, value));
    },
    friction: physics.getAvbdFriction(),
    onFrictionChange: (friction) => physics.setAvbdFriction(friction),
    dualUpdateBeta: initialDualUpdateBeta,
    getDualUpdateBeta: () => physics.getAvbdDualUpdateBeta(),
    onDualUpdateBetaChange: (beta) => {
      physics.setAvbdDualUpdateBeta(beta);
      persistDualUpdateBeta(beta);
      logAvbdConfig('beta-change');
    },
    regularizationAlpha: initialRegularizationAlpha,
    getRegularizationAlpha: () => physics.getAvbdRegularizationAlpha(),
    onRegularizationAlphaChange: (alpha) => {
      physics.setAvbdRegularizationAlpha(alpha);
      persistRegularizationAlpha(alpha);
      logAvbdConfig('alpha-change');
    },
    penaltyDecayGamma: initialPenaltyDecayGamma,
    getPenaltyDecayGamma: () => physics.getAvbdPenaltyDecayGamma(),
    onPenaltyDecayGammaChange: (gamma) => {
      physics.setAvbdPenaltyDecayGamma(gamma);
      persistPenaltyDecayGamma(gamma);
      logAvbdConfig('gamma-change');
    },
    solverIterations: initialSolverIterations,
    getSolverIterations: () => physics.getSolverIterations(),
    onSolverIterationsChange: (iterations) => {
      physics.setSolverIterations(iterations);
      persistSolverIterations(iterations);
      logAvbdConfig('solver-iterations-change');
    },
    stackPreset,
    onStackPresetChange: (preset) => {
      if (preset !== stackPreset) {
        reloadWithStackPreset(preset);
      }
    },
    defaults: panelDefaults,
  });
  fps = new FPSController(ctx.camera, ctx.renderer.domElement, {
    eyeHeight: playerEyeOffset,
    groundY: 0,
    moveSpeed: 7.0,
    jumpVelocity: 5.4,
    gravity: 16.0,
    physicsBodyMode: false,
  });
  fps.setNoclipEnabled(stackPreset === 'ragdoll-avalanche-demo');
  fps.setSceneStatusText(activeRuntime.sceneStatusText?.() ?? null);
  const desiredMoveVelocity = new THREE.Vector3();

  const isClothBoxesPreset = stackPreset === 'cloth-boxes-demo';
  const isColiseumPreset = stackPreset === 'coliseum-50k' || stackPreset === 'coliseum-64k';
  const isDominoPreset = stackPreset === 'dominoes-demo' || stackPreset === 'dominoes-advanced-demo';
  const fireConfig = {
    averageSpeed: isClothBoxesPreset ? 10.0 : (isColiseumPreset ? 40.0 : (isDominoPreset ? 12.0 : 18.0)),
    speedJitter: isClothBoxesPreset ? 2.0 : (isColiseumPreset ? 6.0 : (isDominoPreset ? 1.5 : 4.0)),
    angularJitter: isClothBoxesPreset ? 4.0 : (isColiseumPreset ? 5.0 : (isDominoPreset ? 2.0 : 8.0)),
    shotsPerSecond: 28.0,
    muzzleOffset: 1.1,
  };
  const fireOrigin = new THREE.Vector3();
  const fireDirection = new THREE.Vector3();
  let triggerHeld = false;
  let fireAccumulator = 0.0;
  const heldFireIntervalSeconds = isColiseumPreset ? 2.0 : (1.0 / fireConfig.shotsPerSecond);

  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (!fps.isLocked()) {
      if (event.target === ctx.renderer.domElement) {
        fps.lockPointer();
      }
      return;
    }
    triggerHeld = true;
    fireAccumulator = 0.0;
    if (isColiseumPreset && !simulationPaused) {
      shoot();
    }
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    triggerHeld = false;
  });

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyR' || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    resetSimulation();
  });

  const shoot = (): void => {
    fps.getShootOrigin(fireOrigin, fireConfig.muzzleOffset);
    fps.getLookDirection(fireDirection);
    const shootConfig: ProjectileShootConfig = {
      position: [fireOrigin.x, fireOrigin.y, fireOrigin.z],
      direction: [fireDirection.x, fireDirection.y, fireDirection.z],
      averageSpeed: fireConfig.averageSpeed,
      speedJitter: fireConfig.speedJitter,
      angularJitter: fireConfig.angularJitter,
    };
    if (activeRuntime.shootProjectileOverride) {
      activeRuntime.shootProjectileOverride(shootConfig);
      return;
    }
    activeRuntime.spawner.shoot(shootConfig);
  };

  // Render loop
  const timer = new THREE.Timer();
  timer.connect(document);
  timer.update();
  let bridgeMiniDiagnosticsInFlight = false;
  let lastBridgeMiniDiagnosticsFrame = -1;
  let carouselDiagnosticsInFlight = false;
  let lastCarouselDiagnosticsFrame = -1;

  const sampleBridgeMiniDiagnostics = async (): Promise<void> => {
    const bridgeMiniDiagnostics = activeRuntime.bridgeMiniDiagnostics;
    if (!bridgeMiniDiagnostics || bridgeMiniDiagnosticsInFlight) return;
    if (physics.stats.frameCount < 16) return;

    bridgeMiniDiagnosticsInFlight = true;
    try {
      const [bodyStates, jointStates] = await Promise.all([
        physics.readRigidBodyStatesAsync(ctx.renderer),
        physics.readJointStatesAsync(
          ctx.renderer,
          bridgeMiniDiagnostics.joints.map((joint) => joint.joint),
        ),
      ]);
      if (!bodyStates || !jointStates) return;

      const statesByBody = new Map(bodyStates.map((state) => [state.body, state] as const));
      const jointStatesById = new Map(jointStates.map((joint) => [joint.joint, joint] as const));
      const centerState = statesByBody.get(bridgeMiniDiagnostics.centerBody);
      if (!centerState) return;

      const centerEuler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(
          centerState.quaternion[0],
          centerState.quaternion[1],
          centerState.quaternion[2],
          centerState.quaternion[3],
        ),
        'XYZ',
      );
      const centerEulerDeg: [number, number, number] = [
        THREE.MathUtils.radToDeg(centerEuler.x),
        THREE.MathUtils.radToDeg(centerEuler.y),
        THREE.MathUtils.radToDeg(centerEuler.z),
      ];

      const jointSummaries = bridgeMiniDiagnostics.joints.map((joint) => {
        const jointState = jointStatesById.get(joint.joint);
        const summary: Record<string, unknown> = {
          label: joint.label,
          joint: joint.joint,
          type: jointState?.type ?? 'missing',
          anchorError: jointAnchorError(statesByBody, joint),
          penaltyLin: jointState?.penaltyLin ?? [0.0, 0.0, 0.0],
          lambdaLin: jointState?.lambdaLin ?? [0.0, 0.0, 0.0],
          c0Lin: jointState?.c0Lin ?? [0.0, 0.0, 0.0],
        };

        if (jointState?.type === 'fixed') {
          const qA = jointState.bodyA === null
            ? [0.0, 0.0, 0.0, 1.0] as [number, number, number, number]
            : (statesByBody.get(jointState.bodyA)?.quaternion ?? [0.0, 0.0, 0.0, 1.0] as [number, number, number, number]);
          const qB = statesByBody.get(jointState.bodyB)?.quaternion ?? [0.0, 0.0, 0.0, 1.0] as [number, number, number, number];
          summary.angularErrorCurrent = currentJointAngularError(qA, qB, jointState.restRelative);
          summary.angularErrorDemo3d = demo3dStyleJointAngularError(qA, qB);
          summary.penaltyAng = jointState.penaltyAng;
          summary.lambdaAng = jointState.lambdaAng;
          summary.c0Ang = jointState.c0Ang;
        }

        return summary;
      });

      const fixedJointSummaries = jointSummaries.filter((joint) => joint.type === 'fixed');
      const snapshot = {
        preset: bridgeMiniDiagnostics.preset,
        frame: physics.stats.frameCount,
        centerBody: bridgeMiniDiagnostics.centerBody,
        centerPosition: centerState.position,
        centerEulerDeg,
        centerAngularVelocity: centerState.angularVelocity,
        centerAngularSpeed: vectorMagnitude3(centerState.angularVelocity),
        maxAnchorError: Math.max(...jointSummaries.map((joint) => Number(joint.anchorError ?? 0.0))),
        maxCurrentAngularError: fixedJointSummaries.length > 0
          ? Math.max(...fixedJointSummaries.map((joint) => vectorMagnitude3(joint.angularErrorCurrent as [number, number, number])))
          : 0.0,
        maxDemo3dAngularError: fixedJointSummaries.length > 0
          ? Math.max(...fixedJointSummaries.map((joint) => vectorMagnitude3(joint.angularErrorDemo3d as [number, number, number])))
          : 0.0,
        joints: jointSummaries,
      };

      (window as typeof window & { __WEBPHYS_BRIDGE_MINI_DEBUG__?: unknown }).__WEBPHYS_BRIDGE_MINI_DEBUG__ = snapshot;

      if (logEveryStepEnabled || physics.stats.frameCount % 60 === 0) {
        const jointText = jointSummaries.map((joint) => {
          if (joint.type === 'fixed') {
            return `${String(joint.label)} err=${Number(joint.anchorError ?? 0.0).toExponential(2)} angGpu=${vectorMagnitude3(joint.angularErrorCurrent as [number, number, number]).toExponential(2)} angDemo3d=${vectorMagnitude3(joint.angularErrorDemo3d as [number, number, number]).toExponential(2)} kAng=${formatTriple(joint.penaltyAng as [number, number, number], 2)}`;
          }
          return `${String(joint.label)} err=${Number(joint.anchorError ?? 0.0).toExponential(2)} kLin=${formatTriple(joint.penaltyLin as [number, number, number], 2)}`;
        }).join(' | ');
        console.info(
          `[BridgeMini:${bridgeMiniDiagnostics.preset}] frame=${physics.stats.frameCount} centerEulerDeg=${formatTriple(centerEulerDeg, 2)} angVel=${formatTriple(centerState.angularVelocity, 2)} maxAnchorErr=${snapshot.maxAnchorError.toExponential(2)} ${jointText}`,
        );
      }
    } catch (error) {
      console.warn('[BridgeMini] diagnostics readback failed:', error);
    } finally {
      bridgeMiniDiagnosticsInFlight = false;
    }
  };

  const sampleCarouselDiagnostics = async (): Promise<void> => {
    const carouselDiagnostics = activeRuntime.carouselDiagnostics;
    if (!carouselDiagnostics || carouselDiagnosticsInFlight) return;
    if (physics.stats.frameCount < 16) return;

    carouselDiagnosticsInFlight = true;
    try {
      const [bodyStates, jointStates] = await Promise.all([
        physics.readRigidBodyStatesAsync(ctx.renderer),
        physics.readJointStatesAsync(
          ctx.renderer,
          carouselDiagnostics.joints.map((joint) => joint.joint),
        ),
      ]);
      if (!bodyStates || !jointStates) return;

      const statesByBody = new Map(bodyStates.map((state) => [state.body, state] as const));
      const jointStatesById = new Map(jointStates.map((joint) => [joint.joint, joint] as const));

      const jointSummaries = carouselDiagnostics.joints.map((joint) => {
        const jointState = jointStatesById.get(joint.joint);
        return {
          label: joint.label,
          joint: joint.joint,
          anchorError: jointAnchorError(statesByBody, joint),
          c0Lin: jointState?.c0Lin ?? [0.0, 0.0, 0.0],
          penaltyLin: jointState?.penaltyLin ?? [0.0, 0.0, 0.0],
          lambdaLin: jointState?.lambdaLin ?? [0.0, 0.0, 0.0],
        };
      });

      const snapshot = {
        frame: physics.stats.frameCount,
        maxTopAnchorError: Math.max(...jointSummaries.map((joint) => Number(joint.anchorError ?? 0.0))),
        joints: jointSummaries,
      };

      (window as typeof window & { __WEBPHYS_CAROUSEL_DEBUG__?: unknown }).__WEBPHYS_CAROUSEL_DEBUG__ = snapshot;

      if (logEveryStepEnabled || physics.stats.frameCount % 60 === 0) {
        const jointText = jointSummaries
          .slice(0, 8)
          .map((joint) =>
            `${joint.label} err=${Number(joint.anchorError).toExponential(2)} c0=${formatTriple(joint.c0Lin as [number, number, number], 2)}`
          )
          .join(' | ');
        console.info(
          `[Carousel] frame=${physics.stats.frameCount} maxTopErr=${snapshot.maxTopAnchorError.toExponential(2)} ${jointText}`,
        );
      }
    } catch (error) {
      console.warn('[Carousel] diagnostics readback failed:', error);
    } finally {
      carouselDiagnosticsInFlight = false;
    }
  };

  ctx.renderer.setAnimationLoop(() => {
    gpuPassTimer.beginFrame();
    overlay.begin();

    timer.update();
    const realDt = Math.min(timer.getDelta(), 0.05);
    const dt = Math.min(realDt * timeScale, 0.05);
    const simulationFrame = physics.stats.frameCount;

    fps.update(dt);
    fps.setSceneStatusText(activeRuntime.sceneStatusText?.() ?? null);
    fps.getDesiredMoveVelocity(desiredMoveVelocity);
    fps.consumeJumpRequest();
    if (
      perfEmitConfig
      && !perfEmitTriggered
      && !simulationPaused
      && simulationFrame >= perfEmitConfig.frame
    ) {
      const emitted = activeRuntime.spawner.emit(perfEmitConfig.count);
      perfEmitTriggered = true;
      console.info(
        `[Perf Emit] frame=${simulationFrame} requested=${perfEmitConfig.count} emitted=${emitted}`,
      );
    }
    activeRuntime.spawner.update(simulationPaused ? 0.0 : dt);

    if (!simulationPaused && fps.isLocked() && triggerHeld) {
      fireAccumulator += dt;
      while (fireAccumulator >= heldFireIntervalSeconds) {
        shoot();
        fireAccumulator -= heldFireIntervalSeconds;
      }
    } else {
      fireAccumulator = 0.0;
    }

    if (simulationPaused) {
      if (pendingSimulationSteps > 0) {
        for (const updateScene of activeRuntime.sceneUpdateCallbacks) {
          updateScene(physics.config.deltaTime);
        }
        physics.step(physics.config.deltaTime, ctx.renderer);
        pendingSimulationSteps--;
      }
    } else {
      for (const updateScene of activeRuntime.sceneUpdateCallbacks) {
        updateScene(dt);
      }
      physics.step(dt, ctx.renderer);
    }
    activeRuntime.spawner.syncVisuals(physics);
    for (const trackedVisuals of activeRuntime.trackedVisualSets) {
      trackedVisuals.syncVisuals(physics);
    }
    for (const trackedSpringVisuals of activeRuntime.trackedSpringVisualSets) {
      trackedSpringVisuals.syncVisuals(physics);
    }
    for (const syncedVisuals of activeRuntime.syncedSceneVisuals) {
      syncedVisuals.syncVisuals(physics);
    }
    activeRuntime.contactPointOverlay.requestUpdate(physics);
    if (activeRuntime.bridgeMiniDiagnostics && debugBehaviorEnabled) {
      const sampleEvery = logEveryStepEnabled ? 1 : 15;
      const frame = physics.stats.frameCount;
      if (frame > 0 && frame !== lastBridgeMiniDiagnosticsFrame && frame % sampleEvery === 0) {
        lastBridgeMiniDiagnosticsFrame = frame;
        void sampleBridgeMiniDiagnostics();
      }
    }
    if (activeRuntime.carouselDiagnostics && debugBehaviorEnabled) {
      const sampleEvery = logEveryStepEnabled ? 1 : 15;
      const frame = physics.stats.frameCount;
      if (frame > 0 && frame !== lastCarouselDiagnosticsFrame && frame % sampleEvery === 0) {
        lastCarouselDiagnosticsFrame = frame;
        void sampleCarouselDiagnostics();
      }
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
    gpuPassTimer.endFrame();

    overlay.end();
    overlay.update(physics.stats);
    emitterPanel.update();
  });
}

main().catch((err) => {
  document.body.innerHTML = `<pre style="color:red;padding:2em;font-size:14px">${err.message}\n\n${err.stack}</pre>`;
  console.error(err);
});
