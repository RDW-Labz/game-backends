import * as THREE from 'three';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { AVBD_FRICTION_STATIC } from '../physics/avbdParams';
import {
  createTrackedBodyVisualSet,
  type TrackedBodyVisualSet,
} from './trackedBodyVisuals';

export type RagdollFactory = {
  trackedVisualSets: TrackedBodyVisualSet[];
  addRagdoll: (args: {
    index: number;
    rootPosition: [number, number, number];
    linearVelocity?: [number, number, number];
    rootQuaternion?: [number, number, number, number];
    pose?: RagdollPose;
  }) => number[];
};

export type RagdollPose =
  | 'standing'
  | 'seated';

type RagdollVisualBucket = {
  trunkVisuals: TrackedBodyVisualSet;
  armVisuals: TrackedBodyVisualSet;
  legVisuals: TrackedBodyVisualSet;
  headVisuals: TrackedBodyVisualSet;
};

const TRUNK_HALF_EXTENTS: [number, number, number] = [0.38, 0.64, 0.16];
const ARM_SEGMENT_HALF_EXTENTS: [number, number, number] = [0.1, 0.28, 0.1];
const LEG_SEGMENT_HALF_EXTENTS: [number, number, number] = [0.14, 0.38, 0.14];
const HEAD_RADIUS = 0.22;

function bucketRagdollCount(bucketIndex: number, bucketCount: number, total: number): number {
  let count = 0;
  for (let i = bucketIndex; i < total; i += bucketCount) {
    count++;
  }
  return count;
}

export function createRagdollFactory(args: {
  scene: THREE.Object3D;
  physics: PhysicsEngine;
  totalRagdolls: number;
  collisionGroup: number;
  collisionMask: number;
  colorBucketCount?: number;
  scale?: number;
  defaultPose?: RagdollPose;
}): RagdollFactory {
  const {
    scene,
    physics,
    totalRagdolls,
    collisionGroup,
    collisionMask,
    colorBucketCount = 20,
    scale = 1.0,
    defaultPose = 'standing',
  } = args;
  const scaleVec3 = (value: [number, number, number]): [number, number, number] => [
    value[0] * scale,
    value[1] * scale,
    value[2] * scale,
  ];
  const trunkHalfExtents = scaleVec3(TRUNK_HALF_EXTENTS);
  const armHalfExtents = scaleVec3(ARM_SEGMENT_HALF_EXTENTS);
  const legHalfExtents = scaleVec3(LEG_SEGMENT_HALF_EXTENTS);
  const headRadius = HEAD_RADIUS * scale;
  const massScale = scale * scale * scale;

  const trackedVisualSets: TrackedBodyVisualSet[] = [];
  const ragdollVisualBucketCount = Math.min(colorBucketCount, totalRagdolls);
  const ragdollHeadGeometry = new THREE.SphereGeometry(headRadius, 22, 16);
  const ragdollVisualBuckets = new Array<RagdollVisualBucket>(ragdollVisualBucketCount);

  for (let bucketIndex = 0; bucketIndex < ragdollVisualBucketCount; bucketIndex++) {
    const bucketCount = bucketRagdollCount(bucketIndex, ragdollVisualBucketCount, totalRagdolls);
    const paletteColor = new THREE.Color().setHSL(
      ((bucketIndex / Math.max(1, ragdollVisualBucketCount)) * 0.86 + 0.02) % 1.0,
      0.68,
      0.58,
    ).getHex();
    const trunkVisuals = createTrackedBodyVisualSet(scene, physics, {
      capacity: bucketCount,
      halfExtents: trunkHalfExtents,
      color: paletteColor,
      roughness: 0.8,
      metalness: 0.04,
    });
    const armVisuals = createTrackedBodyVisualSet(scene, physics, {
      capacity: bucketCount * 4,
      halfExtents: armHalfExtents,
      color: paletteColor,
      roughness: 0.78,
      metalness: 0.04,
    });
    const legVisuals = createTrackedBodyVisualSet(scene, physics, {
      capacity: bucketCount * 4,
      halfExtents: legHalfExtents,
      color: paletteColor,
      roughness: 0.78,
      metalness: 0.04,
    });
    const headVisuals = createTrackedBodyVisualSet(scene, physics, {
      capacity: bucketCount,
      geometry: ragdollHeadGeometry,
      color: paletteColor,
      roughness: 0.74,
      metalness: 0.03,
    });
    ragdollVisualBuckets[bucketIndex] = {
      trunkVisuals,
      armVisuals,
      legVisuals,
      headVisuals,
    };
    trackedVisualSets.push(trunkVisuals, armVisuals, legVisuals, headVisuals);
  }

  const addTrackedBox = (
    position: [number, number, number],
    halfExtents: [number, number, number],
    visuals: TrackedBodyVisualSet,
    options: {
      mass: number;
      friction?: number;
      linearVelocity?: [number, number, number];
      quaternion?: [number, number, number, number];
    },
  ): number => {
    const body = physics.addBody({
      position,
      halfExtents,
      mass: options.mass,
      friction: options.friction ?? AVBD_FRICTION_STATIC,
      collisionGroup,
      collisionMask,
      linearVelocity: options.linearVelocity,
      quaternion: options.quaternion,
    });
    visuals.addBody(body);
    return body;
  };

  const addTrackedSphere = (
    position: [number, number, number],
    radius: number,
    visuals: TrackedBodyVisualSet,
    options: {
      mass: number;
      friction?: number;
      linearVelocity?: [number, number, number];
      quaternion?: [number, number, number, number];
    },
  ): number => {
    const body = physics.addBody({
      position,
      shapeType: 'sphere',
      radius,
      mass: options.mass,
      friction: options.friction ?? AVBD_FRICTION_STATIC,
      collisionGroup,
      collisionMask,
      linearVelocity: options.linearVelocity,
      quaternion: options.quaternion,
    });
    visuals.addBody(body);
    return body;
  };

  return {
    trackedVisualSets,

    addRagdoll(args): number[] {
      const {
        index,
        rootPosition,
        linearVelocity = [0.0, 0.0, 0.0],
        rootQuaternion = [0.0, 0.0, 0.0, 1.0],
        pose = defaultPose,
      } = args;
      const visuals = ragdollVisualBuckets[index % ragdollVisualBucketCount]!;
      const trunkVisuals = visuals.trunkVisuals;
      const armVisuals = visuals.armVisuals;
      const legVisuals = visuals.legVisuals;
      const headVisuals = visuals.headVisuals;

      const toQuatTuple = (q: THREE.Quaternion): [number, number, number, number] => [q.x, q.y, q.z, q.w];
      const quatFromEuler = (x: number, y: number, z: number): [number, number, number, number] => {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
        return toQuatTuple(q);
      };
      const multiplyQuatTuple = (
        a: [number, number, number, number],
        b: [number, number, number, number],
      ): [number, number, number, number] => {
        const qa = new THREE.Quaternion(a[0], a[1], a[2], a[3]);
        const qb = new THREE.Quaternion(b[0], b[1], b[2], b[3]);
        qa.multiply(qb).normalize();
        return [qa.x, qa.y, qa.z, qa.w];
      };
      const normalizedRootQuat = toQuatTuple(new THREE.Quaternion(
        rootQuaternion[0],
        rootQuaternion[1],
        rootQuaternion[2],
        rootQuaternion[3],
      ).normalize());
      const rotateLocal = (
        local: [number, number, number],
        quaternion: [number, number, number, number],
      ): [number, number, number] => {
        const rotated = new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(
          new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]),
        );
        return [rotated.x, rotated.y, rotated.z];
      };
      const centerFromAnchor = (
        anchorWorld: [number, number, number],
        localAnchor: [number, number, number],
        quaternion: [number, number, number, number],
      ): [number, number, number] => {
        const offset = rotateLocal(localAnchor, quaternion);
        return [
          anchorWorld[0] - offset[0],
          anchorWorld[1] - offset[1],
          anchorWorld[2] - offset[2],
        ];
      };
      const anchorFromCenter = (
        centerWorld: [number, number, number],
        localAnchor: [number, number, number],
        quaternion: [number, number, number, number],
      ): [number, number, number] => {
        const offset = rotateLocal(localAnchor, quaternion);
        return [
          centerWorld[0] + offset[0],
          centerWorld[1] + offset[1],
          centerWorld[2] + offset[2],
        ];
      };

      const [x, y, z] = rootPosition;
      const trunkLocalQuat = pose === 'seated'
        ? quatFromEuler(0.05, 0.0, 0.0)
        : quatFromEuler(0.0, 0.0, 0.0);
      const trunkQuat = multiplyQuatTuple(normalizedRootQuat, trunkLocalQuat);
      const trunk = addTrackedBox(
        [x, y, z],
        trunkHalfExtents,
        trunkVisuals,
        {
          mass: 2.85 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: trunkQuat,
        },
      );

      const leftUpperArmLocalQuat = pose === 'seated'
        ? quatFromEuler(-0.42, 0.0, -0.08)
        : quatFromEuler(0.08, 0.0, -0.58);
      const leftForearmLocalQuat = pose === 'seated'
        ? quatFromEuler(-1.16, 0.0, -0.02)
        : quatFromEuler(-0.38, 0.0, -0.24);
      const rightUpperArmLocalQuat = pose === 'seated'
        ? quatFromEuler(-0.42, 0.0, 0.08)
        : quatFromEuler(-0.08, 0.0, 0.58);
      const rightForearmLocalQuat = pose === 'seated'
        ? quatFromEuler(-1.16, 0.0, 0.02)
        : quatFromEuler(-0.38, 0.0, 0.24);
      const leftUpperLegLocalQuat = pose === 'seated'
        ? quatFromEuler(-1.4, 0.0, -0.04)
        : quatFromEuler(-0.14, 0.0, -0.16);
      const leftLowerLegLocalQuat = pose === 'seated'
        ? quatFromEuler(0.12, 0.0, -0.01)
        : quatFromEuler(0.24, 0.0, -0.04);
      const rightUpperLegLocalQuat = pose === 'seated'
        ? quatFromEuler(-1.4, 0.0, 0.04)
        : quatFromEuler(-0.14, 0.0, 0.16);
      const rightLowerLegLocalQuat = pose === 'seated'
        ? quatFromEuler(0.12, 0.0, 0.01)
        : quatFromEuler(0.24, 0.0, 0.04);

      const leftUpperArmQuat = multiplyQuatTuple(normalizedRootQuat, leftUpperArmLocalQuat);
      const leftForearmQuat = multiplyQuatTuple(normalizedRootQuat, leftForearmLocalQuat);
      const rightUpperArmQuat = multiplyQuatTuple(normalizedRootQuat, rightUpperArmLocalQuat);
      const rightForearmQuat = multiplyQuatTuple(normalizedRootQuat, rightForearmLocalQuat);
      const leftUpperLegQuat = multiplyQuatTuple(normalizedRootQuat, leftUpperLegLocalQuat);
      const leftLowerLegQuat = multiplyQuatTuple(normalizedRootQuat, leftLowerLegLocalQuat);
      const rightUpperLegQuat = multiplyQuatTuple(normalizedRootQuat, rightUpperLegLocalQuat);
      const rightLowerLegQuat = multiplyQuatTuple(normalizedRootQuat, rightLowerLegLocalQuat);

      const leftShoulderTrunkLocalAnchor: [number, number, number] = pose === 'seated'
        ? [-trunkHalfExtents[0], trunkHalfExtents[1] * 0.58, 0.0]
        : [-(trunkHalfExtents[0] + 0.06 * scale), trunkHalfExtents[1] * 0.58, 0.0];
      const rightShoulderTrunkLocalAnchor: [number, number, number] = pose === 'seated'
        ? [trunkHalfExtents[0], trunkHalfExtents[1] * 0.58, 0.0]
        : [trunkHalfExtents[0] + 0.06 * scale, trunkHalfExtents[1] * 0.58, 0.0];
      const leftHipTrunkLocalAnchor: [number, number, number] = pose === 'seated'
        ? [-0.17 * scale, -trunkHalfExtents[1] + 0.22 * scale, 0.0]
        : [-0.17 * scale, -trunkHalfExtents[1] + 0.22 * scale, 0.0];
      const rightHipTrunkLocalAnchor: [number, number, number] = pose === 'seated'
        ? [0.17 * scale, -trunkHalfExtents[1] + 0.22 * scale, 0.0]
        : [0.17 * scale, -trunkHalfExtents[1] + 0.22 * scale, 0.0];

      const shoulderRightOffset = rotateLocal(rightShoulderTrunkLocalAnchor, trunkQuat);
      const shoulderLeftOffset = rotateLocal(leftShoulderTrunkLocalAnchor, trunkQuat);
      const hipLeftOffset = rotateLocal(leftHipTrunkLocalAnchor, trunkQuat);
      const hipRightOffset = rotateLocal(rightHipTrunkLocalAnchor, trunkQuat);

      const leftShoulderAnchor: [number, number, number] = [x + shoulderLeftOffset[0], y + shoulderLeftOffset[1], z + shoulderLeftOffset[2]];
      const rightShoulderAnchor: [number, number, number] = [x + shoulderRightOffset[0], y + shoulderRightOffset[1], z + shoulderRightOffset[2]];
      const leftHipAnchor: [number, number, number] = [x + hipLeftOffset[0], y + hipLeftOffset[1], z + hipLeftOffset[2]];
      const rightHipAnchor: [number, number, number] = [x + hipRightOffset[0], y + hipRightOffset[1], z + hipRightOffset[2]];

      const leftUpperArmCenter = centerFromAnchor(
        leftShoulderAnchor,
        [0.0, armHalfExtents[1], 0.0],
        leftUpperArmQuat,
      );
      const rightUpperArmCenter = centerFromAnchor(
        rightShoulderAnchor,
        [0.0, armHalfExtents[1], 0.0],
        rightUpperArmQuat,
      );
      const leftElbowAnchor = anchorFromCenter(
        leftUpperArmCenter,
        [0.0, -armHalfExtents[1], 0.0],
        leftUpperArmQuat,
      );
      const rightElbowAnchor = anchorFromCenter(
        rightUpperArmCenter,
        [0.0, -armHalfExtents[1], 0.0],
        rightUpperArmQuat,
      );
      const leftForearmCenter = centerFromAnchor(
        leftElbowAnchor,
        [0.0, armHalfExtents[1], 0.0],
        leftForearmQuat,
      );
      const rightForearmCenter = centerFromAnchor(
        rightElbowAnchor,
        [0.0, armHalfExtents[1], 0.0],
        rightForearmQuat,
      );

      const leftUpperLegCenter = centerFromAnchor(
        leftHipAnchor,
        [0.0, legHalfExtents[1], 0.0],
        leftUpperLegQuat,
      );
      const rightUpperLegCenter = centerFromAnchor(
        rightHipAnchor,
        [0.0, legHalfExtents[1], 0.0],
        rightUpperLegQuat,
      );
      const leftKneeAnchor = anchorFromCenter(
        leftUpperLegCenter,
        [0.0, -legHalfExtents[1], 0.0],
        leftUpperLegQuat,
      );
      const rightKneeAnchor = anchorFromCenter(
        rightUpperLegCenter,
        [0.0, -legHalfExtents[1], 0.0],
        rightUpperLegQuat,
      );
      const leftLowerLegCenter = centerFromAnchor(
        leftKneeAnchor,
        [0.0, legHalfExtents[1], 0.0],
        leftLowerLegQuat,
      );
      const rightLowerLegCenter = centerFromAnchor(
        rightKneeAnchor,
        [0.0, legHalfExtents[1], 0.0],
        rightLowerLegQuat,
      );

      const headOffset = rotateLocal([0.0, trunkHalfExtents[1] + headRadius - 0.02 * scale, 0.0], trunkQuat);
      const head = addTrackedSphere(
        [x + headOffset[0], y + headOffset[1], z + headOffset[2]],
        headRadius,
        headVisuals,
        {
          mass: 0.6 * massScale,
          friction: 0.55,
          linearVelocity,
          quaternion: trunkQuat,
        },
      );
      const leftUpperArm = addTrackedBox(
        leftUpperArmCenter,
        armHalfExtents,
        armVisuals,
        {
          mass: 0.45 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: leftUpperArmQuat,
        },
      );
      const leftForearm = addTrackedBox(
        leftForearmCenter,
        armHalfExtents,
        armVisuals,
        {
          mass: 0.38 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: leftForearmQuat,
        },
      );
      const rightUpperArm = addTrackedBox(
        rightUpperArmCenter,
        armHalfExtents,
        armVisuals,
        {
          mass: 0.45 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: rightUpperArmQuat,
        },
      );
      const rightForearm = addTrackedBox(
        rightForearmCenter,
        armHalfExtents,
        armVisuals,
        {
          mass: 0.38 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: rightForearmQuat,
        },
      );
      const leftUpperLeg = addTrackedBox(
        leftUpperLegCenter,
        legHalfExtents,
        legVisuals,
        {
          mass: 0.82 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: leftUpperLegQuat,
        },
      );
      const leftLowerLeg = addTrackedBox(
        leftLowerLegCenter,
        legHalfExtents,
        legVisuals,
        {
          mass: 0.7 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: leftLowerLegQuat,
        },
      );
      const rightUpperLeg = addTrackedBox(
        rightUpperLegCenter,
        legHalfExtents,
        legVisuals,
        {
          mass: 0.82 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: rightUpperLegQuat,
        },
      );
      const rightLowerLeg = addTrackedBox(
        rightLowerLegCenter,
        legHalfExtents,
        legVisuals,
        {
          mass: 0.7 * massScale,
          friction: 0.62,
          linearVelocity,
          quaternion: rightLowerLegQuat,
        },
      );

      physics.addFixedJoint(
        trunk,
        head,
        [0.0, trunkHalfExtents[1], 0.0],
        [0.0, -headRadius, 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        trunk,
        leftUpperArm,
        leftShoulderTrunkLocalAnchor,
        [0.0, armHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        trunk,
        rightUpperArm,
        rightShoulderTrunkLocalAnchor,
        [0.0, armHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        leftUpperArm,
        leftForearm,
        [0.0, -armHalfExtents[1], 0.0],
        [0.0, armHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        rightUpperArm,
        rightForearm,
        [0.0, -armHalfExtents[1], 0.0],
        [0.0, armHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        trunk,
        leftUpperLeg,
        leftHipTrunkLocalAnchor,
        [0.0, legHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        trunk,
        rightUpperLeg,
        rightHipTrunkLocalAnchor,
        [0.0, legHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        leftUpperLeg,
        leftLowerLeg,
        [0.0, -legHalfExtents[1], 0.0],
        [0.0, legHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );
      physics.addSphericalJoint(
        rightUpperLeg,
        rightLowerLeg,
        [0.0, -legHalfExtents[1], 0.0],
        [0.0, legHalfExtents[1], 0.0],
        Number.POSITIVE_INFINITY,
        true,
      );

      return [
        trunk,
        head,
        leftUpperArm,
        leftForearm,
        rightUpperArm,
        rightForearm,
        leftUpperLeg,
        leftLowerLeg,
        rightUpperLeg,
        rightLowerLeg,
      ];
    },
  };
}
