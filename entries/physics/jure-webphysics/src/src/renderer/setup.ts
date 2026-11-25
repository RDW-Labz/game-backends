import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Inspector } from 'three/addons/inspector/Inspector.js';
import { REQUESTED_MAX_STORAGE_BUFFERS_PER_SHADER_STAGE } from '../gpuLimits';

export interface RenderContext {
  renderer: InstanceType<typeof WebGPURenderer>;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  device: GPUDevice;
}

export type InitRendererOptions = {
  enableInspector?: boolean;
};

export async function initRenderer(options: InitRendererOptions = {}): Promise<RenderContext> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU not supported');

  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) requiredFeatures.push('timestamp-query');
  if (adapter.features.has('subgroups' as GPUFeatureName)) requiredFeatures.push('subgroups' as GPUFeatureName);
  const requiredStorageBuffers = Math.min(
    REQUESTED_MAX_STORAGE_BUFFERS_PER_SHADER_STAGE,
    adapter.limits.maxStorageBuffersPerShaderStage,
  );
  if (requiredStorageBuffers < REQUESTED_MAX_STORAGE_BUFFERS_PER_SHADER_STAGE) {
    throw new Error(
      `This demo requires ${REQUESTED_MAX_STORAGE_BUFFERS_PER_SHADER_STAGE} storage buffers per shader stage, but this adapter only supports ${adapter.limits.maxStorageBuffersPerShaderStage}.`,
    );
  }

  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxStorageBuffersPerShaderStage: requiredStorageBuffers,
    },
  });

  const renderer = new WebGPURenderer({
    canvas: document.createElement('canvas'),
    antialias: true,
    forceWebGL: false,
    device,
  } as any);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  if (options.enableInspector ?? true) {
    // Enable built-in THREE inspector UI (parameters + GPU profiler tabs).
    (renderer as any).inspector = new Inspector();
  }

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x1a1a2e);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Must run after canvas is attached so Inspector can mount its DOM panel.
  if (renderer.init) {
    await renderer.init();
  }

  // Scene
  const scene = new THREE.Scene();

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.8);
  dirLight.position.set(8, 12, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.setScalar(2048);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 50;
  dirLight.shadow.camera.left = -15;
  dirLight.shadow.camera.right = 15;
  dirLight.shadow.camera.top = 15;
  dirLight.shadow.camera.bottom = -15;
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0xc7dcff, 0x425160, 1.35));

  // Camera
  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(0, 8, 16);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 3, 0);
  controls.update();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, device };
}
