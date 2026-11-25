import * as THREE from 'three';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import {
  createTrackedBodyVisualSet,
  type TrackedBodyVisualSet,
} from './trackedBodyVisuals';
import type { TrackedSpringVisualSet } from './trackedSpringVisuals';

export type RopeDemoVariant =
  | 'rope-demo'
  | 'heavy-rope-demo';

export type RopeDemoResult = {
  trackedVisualSets: TrackedBodyVisualSet[];
  trackedSpringVisualSets: TrackedSpringVisualSet[];
};

const ROPE_LINK_COUNT = 20;
const ROPE_Y = 20.0;
const HEAVY_ROPE_Y = 24.0;
const LINK_HALF_EXTENTS: [number, number, number] = [0.5, 0.25, 0.25];
const HEAVY_HALF_EXTENTS: [number, number, number] = [2.5, 2.5, 2.5];
const DENSITY = 1.0;
const JOINT_STIFFNESS = Number.POSITIVE_INFINITY;

function boxMass(halfExtents: [number, number, number], density: number): number {
  const fullX = halfExtents[0] * 2.0;
  const fullY = halfExtents[1] * 2.0;
  const fullZ = halfExtents[2] * 2.0;
  return fullX * fullY * fullZ * density;
}

export function buildRopeDemo(args: {
  scene: THREE.Object3D;
  physics: PhysicsEngine;
  variant: RopeDemoVariant;
}): RopeDemoResult {
  const { scene, physics, variant } = args;
  const trackedVisualSets: TrackedBodyVisualSet[] = [];
  const trackedSpringVisualSets: TrackedSpringVisualSet[] = [];

  const smallLinkCount = variant === 'heavy-rope-demo' ? ROPE_LINK_COUNT - 1 : ROPE_LINK_COUNT;
  const linkVisuals = createTrackedBodyVisualSet(scene, physics, {
    capacity: smallLinkCount,
    halfExtents: LINK_HALF_EXTENTS,
    color: 0xb7c4d6,
    roughness: 0.72,
    metalness: 0.04,
  });
  trackedVisualSets.push(linkVisuals);

  let heavyVisuals: TrackedBodyVisualSet | null = null;
  if (variant === 'heavy-rope-demo') {
    heavyVisuals = createTrackedBodyVisualSet(scene, physics, {
      capacity: 1,
      halfExtents: HEAVY_HALF_EXTENTS,
      color: 0xd5b06a,
      roughness: 0.76,
      metalness: 0.03,
    });
    trackedVisualSets.push(heavyVisuals);
  }

  const startX = variant === 'heavy-rope-demo' ? -10.75 : -9.5;
  const ropeY = variant === 'heavy-rope-demo' ? HEAVY_ROPE_Y : ROPE_Y;
  let prevBody: number | null = null;
  let prevHalfExtents: [number, number, number] | null = null;

  for (let i = 0; i < ROPE_LINK_COUNT; i++) {
    const isAnchor = i === 0;
    const isHeavy = variant === 'heavy-rope-demo' && i === ROPE_LINK_COUNT - 1;
    const halfExtents = isHeavy ? HEAVY_HALF_EXTENTS : LINK_HALF_EXTENTS;
    const x = startX + i + (isHeavy ? HEAVY_HALF_EXTENTS[0] : 0.0);
    const body = physics.addBody({
      position: [x, ropeY, 0.0],
      halfExtents,
      mass: isAnchor ? 0.0 : boxMass(halfExtents, DENSITY),
      friction: 0.5,
    });
    if (isHeavy) {
      heavyVisuals!.addBody(body);
    } else {
      linkVisuals.addBody(body);
    }

    if (prevBody !== null && prevHalfExtents !== null) {
      physics.addSphericalJoint(
        prevBody,
        body,
        [prevHalfExtents[0], 0.0, 0.0],
        [-halfExtents[0], 0.0, 0.0],
        JOINT_STIFFNESS,
        true,
      );
    }

    prevBody = body;
    prevHalfExtents = halfExtents;
  }

  return {
    trackedVisualSets,
    trackedSpringVisualSets,
  };
}
