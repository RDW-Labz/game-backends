import * as THREE from 'three';

export interface FPSControllerConfig {
  moveSpeed?: number;
  sprintMultiplier?: number;
  jumpVelocity?: number;
  gravity?: number;
  eyeHeight?: number;
  groundY?: number;
  mouseSensitivity?: number;
  physicsBodyMode?: boolean;
}

export interface FPSControllerState {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  verticalVelocity: number;
  isGrounded: boolean;
  jumpRequested: boolean;
  noclipEnabled: boolean;
}

export class FPSController {
  private readonly cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly moveForward = new THREE.Vector3();
  private readonly moveRight = new THREE.Vector3();
  private readonly moveDelta = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly lookDir = new THREE.Vector3();
  private readonly shootOrigin = new THREE.Vector3();
  private readonly keys = new Set<string>();
  private readonly crosshair: HTMLDivElement;
  private readonly controlsHint: HTMLDivElement;
  private readonly sceneStatusHint: HTMLDivElement;
  private readonly modeBadge: HTMLDivElement;
  private sceneStatusText: string | null = null;
  private yaw = 0;
  private pitch = 0;
  private verticalVelocity = 0;
  private isGrounded = false;
  private isPointerLocked = false;
  private jumpRequested = false;
  private noclipEnabled = false;
  private readonly moveSpeed: number;
  private readonly sprintMultiplier: number;
  private readonly jumpVelocity: number;
  private readonly gravity: number;
  private readonly eyeHeight: number;
  private readonly groundY: number;
  private readonly mouseSensitivity: number;
  private readonly physicsBodyMode: boolean;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly domElement: HTMLElement,
    config: FPSControllerConfig = {},
  ) {
    this.moveSpeed = config.moveSpeed ?? 7.0;
    this.sprintMultiplier = config.sprintMultiplier ?? 1.8;
    this.jumpVelocity = config.jumpVelocity ?? 5.4;
    this.gravity = config.gravity ?? 16.0;
    this.eyeHeight = config.eyeHeight ?? 1.7;
    this.groundY = config.groundY ?? 0.0;
    this.mouseSensitivity = config.mouseSensitivity ?? 0.0018;
    this.physicsBodyMode = config.physicsBodyMode ?? false;

    this.crosshair = document.createElement('div');
    Object.assign(this.crosshair.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '12px',
      height: '12px',
      marginLeft: '-6px',
      marginTop: '-6px',
      pointerEvents: 'none',
      zIndex: '30',
      display: 'none',
    });
    this.crosshair.innerHTML =
      '<div style="position:absolute;left:5px;top:0;width:2px;height:12px;background:#ffffffc0"></div>' +
      '<div style="position:absolute;left:0;top:5px;width:12px;height:2px;background:#ffffffc0"></div>';
    document.body.appendChild(this.crosshair);

    this.controlsHint = document.createElement('div');
    Object.assign(this.controlsHint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#ffffffd0',
      fontFamily: 'monospace',
      fontSize: '12px',
      background: 'rgba(0,0,0,0.55)',
      padding: '6px 10px',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '30',
      whiteSpace: 'pre',
    });
    this.controlsHint.textContent = '';
    document.body.appendChild(this.controlsHint);

    this.sceneStatusHint = document.createElement('div');
    Object.assign(this.sceneStatusHint.style, {
      position: 'fixed',
      top: '42px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#ffffffd0',
      fontFamily: 'monospace',
      fontSize: '12px',
      background: 'rgba(0,0,0,0.55)',
      padding: '6px 10px',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '30',
      whiteSpace: 'pre',
      display: 'none',
    });
    this.sceneStatusHint.textContent = '';
    document.body.appendChild(this.sceneStatusHint);

    this.modeBadge = document.createElement('div');
    Object.assign(this.modeBadge.style, {
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      color: '#ffffffd0',
      fontFamily: 'monospace',
      fontSize: '12px',
      background: 'rgba(0,0,0,0.55)',
      padding: '6px 10px',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '30',
      whiteSpace: 'pre',
    });
    this.modeBadge.textContent = '';
    document.body.appendChild(this.modeBadge);

    this.refreshHintText();
    this.updateModeBadge();

    this.camera.position.y = Math.max(this.camera.position.y, this.groundY + this.eyeHeight);
    this.cameraEuler.setFromQuaternion(this.camera.quaternion);
    this.yaw = this.cameraEuler.y;
    this.pitch = THREE.MathUtils.clamp(this.cameraEuler.x, -1.54, 1.54);
    this.applyView();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  lockPointer(): void {
    this.domElement.requestPointerLock();
  }

  isLocked(): boolean {
    return this.isPointerLocked;
  }

  setSceneStatusText(text: string | null): void {
    if (this.sceneStatusText === text) return;
    this.sceneStatusText = text;
    this.refreshHintText();
    this.updateHintVisibility();
  }

  update(dt: number): void {
    const runMultiplier = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
      ? this.sprintMultiplier
      : 1.0;
    const speed = this.moveSpeed * runMultiplier;

    this.camera.getWorldDirection(this.moveForward);
    if (this.noclipEnabled) {
      if (this.moveForward.lengthSq() < 1e-6) {
        this.moveForward.set(
          Math.sin(this.yaw),
          0,
          -Math.cos(this.yaw),
        );
      }
      this.moveForward.normalize();
      this.moveRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
    } else {
      this.moveForward.y = 0;
      if (this.moveForward.lengthSq() < 1e-6) {
        this.moveForward.set(
          Math.sin(this.yaw),
          0,
          -Math.cos(this.yaw),
        );
      }
      this.moveForward.normalize();
      this.moveRight.crossVectors(this.moveForward, this.up).normalize();
    }

    this.moveDelta.set(0, 0, 0);
    if (this.keys.has('KeyW')) this.moveDelta.add(this.moveForward);
    if (this.keys.has('KeyS')) this.moveDelta.sub(this.moveForward);
    if (this.keys.has('KeyD')) this.moveDelta.add(this.moveRight);
    if (this.keys.has('KeyA')) this.moveDelta.sub(this.moveRight);
    if (this.noclipEnabled) {
      if (this.keys.has('Space')) this.moveDelta.add(this.up);
      if (this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyQ')) {
        this.moveDelta.sub(this.up);
      }
    }
    this.desiredVelocity.set(0, 0, 0);
    if (this.moveDelta.lengthSq() > 1e-6) {
      this.moveDelta.normalize();
      this.desiredVelocity.copy(this.moveDelta).multiplyScalar(speed);
      if (!this.physicsBodyMode) {
        this.camera.position.addScaledVector(this.moveDelta, speed * dt);
      }
    }

    if (this.physicsBodyMode) {
      return;
    }

    if (this.noclipEnabled) {
      this.verticalVelocity = 0;
      this.isGrounded = false;
      return;
    }

    this.verticalVelocity -= this.gravity * dt;
    this.camera.position.y += this.verticalVelocity * dt;
    const minY = this.groundY + this.eyeHeight;
    if (this.camera.position.y <= minY) {
      this.camera.position.y = minY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  }

  getLookDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }

  getShootOrigin(out: THREE.Vector3, forwardOffset = 1.0): THREE.Vector3 {
    this.getLookDirection(this.lookDir);
    this.shootOrigin.copy(this.camera.position).addScaledVector(this.lookDir, forwardOffset);
    return out.copy(this.shootOrigin);
  }

  private applyView(): void {
    this.cameraEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.cameraEuler);
  }

  toggleNoclip(): boolean {
    this.setNoclipEnabled(!this.noclipEnabled);
    return this.noclipEnabled;
  }

  isNoclipEnabled(): boolean {
    return this.noclipEnabled;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);

    if (event.code === 'KeyN' && !event.repeat) {
      event.preventDefault();
      this.toggleNoclip();
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (this.physicsBodyMode) {
        if (this.isGrounded) {
          this.jumpRequested = true;
          this.isGrounded = false;
        }
      } else if (!this.noclipEnabled && this.isGrounded) {
        this.verticalVelocity = this.jumpVelocity;
        this.isGrounded = false;
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onPointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.domElement;
    this.crosshair.style.display = this.isPointerLocked ? 'block' : 'none';
    this.updateHintVisibility();
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isPointerLocked) return;

    this.yaw -= event.movementX * this.mouseSensitivity;
    this.pitch -= event.movementY * this.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.54, 1.54);
    this.applyView();
  };

  getDesiredMoveVelocity(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.desiredVelocity);
  }

  captureState(): FPSControllerState {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      quaternion: [this.camera.quaternion.x, this.camera.quaternion.y, this.camera.quaternion.z, this.camera.quaternion.w],
      verticalVelocity: this.verticalVelocity,
      isGrounded: this.isGrounded,
      jumpRequested: this.jumpRequested,
      noclipEnabled: this.noclipEnabled,
    };
  }

  restoreState(state: FPSControllerState): void {
    this.setNoclipEnabled(state.noclipEnabled);
    this.camera.position.set(state.position[0], state.position[1], state.position[2]);
    this.camera.quaternion.set(
      state.quaternion[0],
      state.quaternion[1],
      state.quaternion[2],
      state.quaternion[3],
    );
    this.cameraEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this.cameraEuler.y;
    this.pitch = THREE.MathUtils.clamp(this.cameraEuler.x, -1.54, 1.54);
    this.verticalVelocity = state.verticalVelocity;
    this.isGrounded = state.isGrounded;
    this.jumpRequested = state.jumpRequested;
  }

  consumeJumpRequest(): boolean {
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  setPhysicsBodyState(center: THREE.Vector3, grounded: boolean, eyeOffset = this.eyeHeight): void {
    this.camera.position.set(center.x, center.y + eyeOffset, center.z);
    this.isGrounded = grounded;
  }

  setNoclipEnabled(enabled: boolean): void {
    if (this.noclipEnabled === enabled) return;
    this.noclipEnabled = enabled;
    this.verticalVelocity = 0;
    if (!this.physicsBodyMode && !enabled) {
      const minY = this.groundY + this.eyeHeight;
      if (this.camera.position.y < minY) {
        this.camera.position.y = minY;
      }
      this.isGrounded = this.camera.position.y <= minY + 1e-4;
    } else {
      this.isGrounded = false;
    }
    this.refreshHintText();
    this.updateModeBadge();
  }

  private refreshHintText(): void {
    this.controlsHint.textContent = this.noclipEnabled
      ? 'Click canvas to lock mouse. WASD move, Shift sprint, Space up, Ctrl/Q down, N noclip, R reset sim, LMB shoot.'
      : 'Click canvas to lock mouse. WASD move, Shift sprint, Space jump, N noclip, R reset sim, LMB shoot.';
    this.sceneStatusHint.textContent = this.sceneStatusText ?? '';
  }

  private updateHintVisibility(): void {
    this.controlsHint.style.display = this.isPointerLocked ? 'none' : 'block';
    this.sceneStatusHint.style.display = this.sceneStatusText ? 'block' : 'none';
  }

  private updateModeBadge(): void {
    if (this.noclipEnabled) {
      this.modeBadge.textContent = 'Mode: NOCLIP';
      this.modeBadge.style.background = 'rgba(42, 122, 64, 0.75)';
    } else {
      this.modeBadge.textContent = 'Mode: WALK';
      this.modeBadge.style.background = 'rgba(0,0,0,0.55)';
    }
  }
}
