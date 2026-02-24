/**
 * ORBIT CAMERA CONTROLLER v2
 *
 * Perspective camera with orbit controls for the 3D heatmap.
 * All matrix math is inline — no gl-matrix dependency.
 *
 * Features:
 *  - Velocity-based inertia (momentum after release)
 *  - Smooth animated transitions (ease-out cubic)
 *  - Camera presets (Iso, Top, Front, Side, 3/4)
 *  - 3D→2D projection and ray casting (unproject)
 *
 * Controls:
 *  - Left-drag: orbit (rotate)
 *  - Scroll: zoom
 *  - Right-drag / Shift+left-drag: pan
 *  - Keys 1-5: camera presets
 *  - Key R: reset camera
 */

// ── Matrix helpers (column-major Float32Array(16)) ──────────────────────

function mat4_perspective(out: Float32Array, fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fov / 2);
  const rangeInv = 1.0 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * rangeInv;
  out[11] = -1;
  out[14] = 2 * far * near * rangeInv;
  return out;
}

function mat4_lookAt(out: Float32Array, eye: number[], center: number[], up: number[]): Float32Array {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
  const fz0 = zx * len, fz1 = zy * len, fz2 = zz * len;

  let rx = up[1] * fz2 - up[2] * fz1;
  let ry = up[2] * fz0 - up[0] * fz2;
  let rz = up[0] * fz1 - up[1] * fz0;
  len = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (len > 0) { len = 1 / len; rx *= len; ry *= len; rz *= len; }

  const ux = fz1 * rz - fz2 * ry;
  const uy = fz2 * rx - fz0 * rz;
  const uz = fz0 * ry - fz1 * rx;

  out[0] = rx;  out[1] = ux;  out[2] = fz0;  out[3] = 0;
  out[4] = ry;  out[5] = uy;  out[6] = fz1;  out[7] = 0;
  out[8] = rz;  out[9] = uz;  out[10] = fz2; out[11] = 0;
  out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = -(fz0 * eye[0] + fz1 * eye[1] + fz2 * eye[2]);
  out[15] = 1;
  return out;
}

function mat4_multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[i] * b[j * 4] +
        a[4 + i] * b[j * 4 + 1] +
        a[8 + i] * b[j * 4 + 2] +
        a[12 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

function mat4_invert(out: Float32Array, m: Float32Array): boolean {
  const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
  const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
  const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
  const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-10) return false;
  det = 1.0 / det;

  out[0]  = (m11 * b11 - m12 * b10 + m13 * b09) * det;
  out[1]  = (m02 * b10 - m01 * b11 - m03 * b09) * det;
  out[2]  = (m31 * b05 - m32 * b04 + m33 * b03) * det;
  out[3]  = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  out[4]  = (m12 * b08 - m10 * b11 - m13 * b07) * det;
  out[5]  = (m00 * b11 - m02 * b08 + m03 * b07) * det;
  out[6]  = (m32 * b02 - m30 * b05 - m33 * b01) * det;
  out[7]  = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  out[8]  = (m10 * b10 - m11 * b08 + m13 * b06) * det;
  out[9]  = (m01 * b08 - m00 * b10 - m03 * b06) * det;
  out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
  out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
  out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
  out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
  out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;

  return true;
}

// ── Camera Presets ──────────────────────────────────────────────────────

export interface CameraPreset {
  name: string;
  label: string;
  shortcut: string;
  state: Partial<CameraState>;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { name: 'isometric', label: 'Iso',   shortcut: '1', state: { azimuth: -0.6, elevation: 0.45, distance: 2.8, target: [0.5, 0.5, 0] } },
  { name: 'top',       label: 'Top',   shortcut: '2', state: { azimuth: 0, elevation: Math.PI / 2 - 0.06, distance: 2.0, target: [0.5, 0.5, 0] } },
  { name: 'front',     label: 'Front', shortcut: '3', state: { azimuth: 0, elevation: 0.05, distance: 2.5, target: [0.5, 0.5, 0] } },
  { name: 'side',      label: 'Side',  shortcut: '4', state: { azimuth: -Math.PI / 2, elevation: 0.15, distance: 2.5, target: [0.5, 0.5, 0] } },
  { name: 'overview',  label: '3/4',   shortcut: '5', state: { azimuth: -0.9, elevation: 0.6, distance: 3.2, target: [0.5, 0.5, 0] } },
];

// ── CameraController ────────────────────────────────────────────────────

export interface CameraState {
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
}

const DEFAULT_STATE: CameraState = {
  azimuth: -0.6,
  elevation: 0.45,
  distance: 2.8,
  target: [0.5, 0.5, 0],
  fov: Math.PI / 4,
  near: 0.01,
  far: 100,
};

const FRICTION = 0.90;
const VELOCITY_THRESHOLD = 0.00005;

export class CameraController {
  private state: CameraState;
  private projMat = new Float32Array(16);
  private viewMat = new Float32Array(16);
  private vpMat = new Float32Array(16);
  private vpInvMat = new Float32Array(16);
  private dirty = true;
  private vpInvDirty = true;

  // Inertia velocities
  private orbitVel = { az: 0, el: 0 };
  private panVel = { x: 0, y: 0, z: 0 };
  private zoomVel = 0;

  // Smooth transition
  private transitionActive = false;
  private transitionStart: CameraState | null = null;
  private transitionEnd: CameraState | null = null;
  private transitionStartTime = 0;
  private transitionDuration = 600;

  constructor(initial?: Partial<CameraState>) {
    this.state = { ...DEFAULT_STATE, ...initial };
    if (initial?.target) this.state.target = [...initial.target] as [number, number, number];
  }

  // ── Getters ──

  getState(): Readonly<CameraState> {
    return this.state;
  }

  getEyePosition(): [number, number, number] {
    const { azimuth, elevation, distance, target } = this.state;
    const ce = Math.cos(elevation);
    return [
      target[0] + distance * ce * Math.sin(azimuth),
      target[1] + distance * Math.sin(elevation),
      target[2] + distance * ce * Math.cos(azimuth),
    ];
  }

  getViewProjectionMatrix(aspect: number): Float32Array {
    if (this.dirty) {
      const eye = this.getEyePosition();
      mat4_perspective(this.projMat, this.state.fov, aspect, this.state.near, this.state.far);
      mat4_lookAt(this.viewMat, eye, this.state.target as number[], [0, 1, 0]);
      mat4_multiply(this.vpMat, this.projMat, this.viewMat);
      this.dirty = false;
      this.vpInvDirty = true;
    }
    return this.vpMat;
  }

  getInverseVPMatrix(aspect: number): Float32Array {
    this.getViewProjectionMatrix(aspect); // ensure VP is fresh
    if (this.vpInvDirty) {
      mat4_invert(this.vpInvMat, this.vpMat);
      this.vpInvDirty = false;
    }
    return this.vpInvMat;
  }

  // ── Mutations ──

  orbit(deltaAzimuth: number, deltaElevation: number): void {
    this.cancelTransition();
    this.state.azimuth += deltaAzimuth;
    this.state.elevation = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.state.elevation + deltaElevation));
    this.dirty = true;
  }

  zoom(delta: number): void {
    this.cancelTransition();
    this.state.distance = Math.max(0.3, Math.min(10, this.state.distance * (1 - delta * 0.001)));
    this.dirty = true;
  }

  pan(deltaX: number, deltaY: number): void {
    this.cancelTransition();
    const { azimuth } = this.state;
    const speed = this.state.distance * 0.002;
    this.state.target[0] += (-Math.cos(azimuth) * deltaX + Math.sin(azimuth) * deltaY) * speed;
    this.state.target[2] += (Math.sin(azimuth) * deltaX + Math.cos(azimuth) * deltaY) * speed;
    this.state.target[1] += deltaY * speed * 0.5;
    this.dirty = true;
  }

  // ── Inertia ──

  /**
   * Apply inertia and transitions. Call once per frame.
   * Returns true if the camera moved (for dirty flagging overlays).
   */
  tick(): boolean {
    let moved = false;

    // Orbit inertia
    if (Math.abs(this.orbitVel.az) > VELOCITY_THRESHOLD || Math.abs(this.orbitVel.el) > VELOCITY_THRESHOLD) {
      this.state.azimuth += this.orbitVel.az;
      this.state.elevation = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.state.elevation + this.orbitVel.el));
      this.orbitVel.az *= FRICTION;
      this.orbitVel.el *= FRICTION;
      moved = true;
    } else {
      this.orbitVel.az = 0;
      this.orbitVel.el = 0;
    }

    // Pan inertia
    if (Math.abs(this.panVel.x) > VELOCITY_THRESHOLD || Math.abs(this.panVel.y) > VELOCITY_THRESHOLD || Math.abs(this.panVel.z) > VELOCITY_THRESHOLD) {
      this.state.target[0] += this.panVel.x;
      this.state.target[1] += this.panVel.y;
      this.state.target[2] += this.panVel.z;
      this.panVel.x *= FRICTION;
      this.panVel.y *= FRICTION;
      this.panVel.z *= FRICTION;
      moved = true;
    } else {
      this.panVel.x = 0;
      this.panVel.y = 0;
      this.panVel.z = 0;
    }

    // Zoom inertia
    if (Math.abs(this.zoomVel) > VELOCITY_THRESHOLD) {
      this.state.distance = Math.max(0.3, Math.min(10, this.state.distance * (1 - this.zoomVel)));
      this.zoomVel *= FRICTION;
      moved = true;
    } else {
      this.zoomVel = 0;
    }

    // Smooth transition
    if (this.transitionActive) {
      this.updateTransition();
      moved = true;
    }

    if (moved) this.dirty = true;
    return moved;
  }

  // ── Transitions ──

  animateTo(target: Partial<CameraState>, durationMs = 600): void {
    this.killVelocity();
    this.transitionStart = {
      ...this.state,
      target: [...this.state.target] as [number, number, number],
    };
    this.transitionEnd = {
      ...this.state,
      ...target,
      target: target.target ? [...target.target] as [number, number, number] : [...this.state.target] as [number, number, number],
    };
    this.transitionStartTime = performance.now();
    this.transitionDuration = durationMs;
    this.transitionActive = true;
  }

  private updateTransition(): void {
    const elapsed = performance.now() - this.transitionStartTime;
    const t = Math.min(1, elapsed / this.transitionDuration);
    // Ease-out cubic
    const e = 1 - Math.pow(1 - t, 3);

    const s = this.transitionStart!;
    const end = this.transitionEnd!;

    this.state.azimuth = s.azimuth + (end.azimuth - s.azimuth) * e;
    this.state.elevation = s.elevation + (end.elevation - s.elevation) * e;
    this.state.distance = s.distance + (end.distance - s.distance) * e;
    this.state.target[0] = s.target[0] + (end.target[0] - s.target[0]) * e;
    this.state.target[1] = s.target[1] + (end.target[1] - s.target[1]) * e;
    this.state.target[2] = s.target[2] + (end.target[2] - s.target[2]) * e;

    if (t >= 1) this.transitionActive = false;
  }

  private cancelTransition(): void {
    this.transitionActive = false;
  }

  private killVelocity(): void {
    this.orbitVel.az = 0;
    this.orbitVel.el = 0;
    this.panVel.x = 0;
    this.panVel.y = 0;
    this.panVel.z = 0;
    this.zoomVel = 0;
  }

  // ── Presets ──

  goToPreset(presetName: string): void {
    const preset = CAMERA_PRESETS.find(p => p.name === presetName);
    if (preset) this.animateTo(preset.state, 500);
  }

  reset(): void {
    this.animateTo({
      ...DEFAULT_STATE,
      target: [...DEFAULT_STATE.target] as [number, number, number],
    });
  }

  setDirty(): void {
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  // ── Canvas Controls ──

  attachToCanvas(canvas: HTMLCanvasElement): () => void {
    let isDragging = false;
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      lastX = e.clientX;
      lastY = e.clientY;
      // Kill inertia on new interaction
      this.killVelocity();
      this.cancelTransition();
      if (e.button === 2 || e.shiftKey) {
        isPanning = true;
      } else if (e.button === 0) {
        isDragging = true;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (isDragging) {
        const vAz = -dx * 0.005;
        const vEl = dy * 0.005;
        this.orbit(vAz, vEl);
        // Store velocity for inertia
        this.orbitVel.az = vAz;
        this.orbitVel.el = vEl;
      } else if (isPanning) {
        const { azimuth } = this.state;
        const speed = this.state.distance * 0.002;
        const pdx = dx;
        const pdy = -dy;
        this.pan(pdx, pdy);
        // Store velocity for inertia
        this.panVel.x = (-Math.cos(azimuth) * pdx + Math.sin(azimuth) * pdy) * speed;
        this.panVel.z = (Math.sin(azimuth) * pdx + Math.cos(azimuth) * pdy) * speed;
        this.panVel.y = pdy * speed * 0.5;
      }
    };

    const onMouseUp = () => {
      // Don't zero velocities — inertia will decay them in tick()
      isDragging = false;
      isPanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cancelTransition();
      const delta = -e.deltaY;
      this.zoom(delta);
      this.zoomVel = delta * 0.001 * 0.3;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Touch support
    let lastTouchDist = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      this.killVelocity();
      this.cancelTransition();
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        const vAz = -dx * 0.005;
        const vEl = dy * 0.005;
        this.orbit(vAz, vEl);
        this.orbitVel.az = vAz;
        this.orbitVel.el = vEl;
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastTouchDist > 0) {
          this.zoom((dist - lastTouchDist) * 5);
        }
        lastTouchDist = dist;

        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.pan(mx - lastTouchX, -(my - lastTouchY));
        lastTouchX = mx;
        lastTouchY = my;
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }
}
