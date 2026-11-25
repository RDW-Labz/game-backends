import * as THREE from 'three';
import {
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import {
  instancedBufferAttribute,
  normalLocal,
  positionLocal,
  storage,
  transformNormalToView,
  uint,
  varying,
} from 'three/tsl';
import { PhysicsEngine } from '../physics/PhysicsEngine';

export type TrackedBodyVisualSet = {
  addBody: (body: number) => void;
  syncVisuals: (engine: PhysicsEngine) => void;
  dispose: () => void;
};

export function createTrackedBodyVisualSet(
  scene: THREE.Object3D,
  physics: PhysicsEngine,
  options: {
    capacity: number;
    halfExtents?: [number, number, number];
    geometry?: THREE.BufferGeometry;
    color: number;
    roughness?: number;
    metalness?: number;
    outlineScale?: number;
    showOutline?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
  },
): TrackedBodyVisualSet {
  const { capacity } = options;
  const outlineScale = options.outlineScale ?? 1.002;
  const showOutline = options.showOutline ?? true;
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;
  const ownsGeometry = options.geometry === undefined;
  const geometry = options.geometry
    ?? new THREE.BoxGeometry(
      (options.halfExtents?.[0] ?? 0.5) * 2.0,
      (options.halfExtents?.[1] ?? 0.5) * 2.0,
      (options.halfExtents?.[2] ?? 0.5) * 2.0,
    );

  const material = new MeshStandardNodeMaterial();
  material.color.setHex(options.color);
  material.roughness = options.roughness ?? 0.65;
  material.metalness = options.metalness ?? 0.06;

  const instancedMesh = new THREE.InstancedMesh(geometry, material, capacity);
  instancedMesh.castShadow = castShadow;
  instancedMesh.receiveShadow = receiveShadow;
  instancedMesh.frustumCulled = false;
  instancedMesh.count = 0;
  scene.add(instancedMesh);

  const outlineMaterial = new MeshBasicNodeMaterial();
  outlineMaterial.color.setHex(0x111111);
  outlineMaterial.wireframe = true;
  outlineMaterial.transparent = true;
  outlineMaterial.opacity = 0.5;
  outlineMaterial.depthWrite = false;

  const outlineMesh = new THREE.InstancedMesh(geometry, outlineMaterial, capacity);
  outlineMesh.frustumCulled = false;
  outlineMesh.count = 0;
  outlineMesh.renderOrder = 1;
  if (showOutline) {
    scene.add(outlineMesh);
  }

  const bodyIndexData = new Float32Array(capacity * 4);
  const bodyIndexAttr = new THREE.InstancedBufferAttribute(bodyIndexData, 4);
  let trackedCount = 0;
  let gpuVisualsBound = false;

  return {
    addBody(body: number): void {
      if (trackedCount >= capacity) {
        throw new Error(`Tracked body visual capacity exceeded (${capacity})`);
      }
      bodyIndexData[trackedCount * 4 + 0] = body;
      bodyIndexAttr.needsUpdate = true;
      trackedCount++;
      instancedMesh.count = trackedCount;
      if (showOutline) {
        outlineMesh.count = trackedCount;
      }
    },

    syncVisuals(engine: PhysicsEngine): void {
      if (gpuVisualsBound) return;

      const renderBuffers = engine.getRenderBuffers();
      if (!renderBuffers) return;

      const positions = storage(renderBuffers.positions, 'vec4', physics.config.maxBodies).toReadOnly();
      const quaternions = storage(renderBuffers.quaternions, 'vec4', physics.config.maxBodies).toReadOnly();
      const bodyIndices = instancedBufferAttribute(bodyIndexAttr, 'vec4');
      const bodyIdx = uint((bodyIndices as any).x);
      const pos = positions.element(bodyIdx).xyz;
      const quat = quaternions.element(bodyIdx);
      const qv = quat.xyz;
      const qw = quat.w;

      const rotateByQuat = (v: any) => {
        const t = qv.cross(v).mul(2.0);
        return v.add(t.mul(qw)).add(qv.cross(t));
      };

      material.positionNode = rotateByQuat(positionLocal).add(pos);
      material.normalNode = varying(
        transformNormalToView(rotateByQuat(normalLocal)).normalize(),
        'vTrackedBodyNormalView',
      );
      material.needsUpdate = true;

      if (showOutline) {
        outlineMaterial.positionNode = rotateByQuat(positionLocal.mul(outlineScale)).add(pos);
        outlineMaterial.needsUpdate = true;
      }
      gpuVisualsBound = true;
    },

    dispose(): void {
      scene.remove(instancedMesh);
      if (showOutline) {
        scene.remove(outlineMesh);
      }
      instancedMesh.dispose();
      outlineMesh.dispose();
      material.dispose();
      outlineMaterial.dispose();
      if (ownsGeometry) geometry.dispose();
    },
  };
}
