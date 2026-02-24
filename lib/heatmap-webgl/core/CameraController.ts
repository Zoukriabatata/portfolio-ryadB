/**
 * ORBIT CAMERA CONTROLLER
 *
 * Perspective camera with orbit controls for the 3D heatmap.
 * All matrix math is inline — no gl-matrix dependency.
 *
 * Controls:
 *  - Left-drag: orbit (rotate)
 *  - Scroll: zoom
 *  - Right-drag / Shift+left-drag: pan
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

  // right = normalize(cross(up, forward))
  let rx = up[1] * fz2 - up[2] * fz1;
  let ry = up[2] * fz0 - up[0] * fz2;
  let rz = up[0] * fz1 - up[1] * fz0;
  len = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (len > 0) { len = 1 / len; rx *= len; ry *= len; rz *= len; }

  // recalculated up = cross(forward, right)
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

// ── CameraController ────────────────────────────────────────────────────

export interface CameraState {
  azimuth: number;      // Horizontal rotation (rad)
  elevation: number;    // Vertical rotation (rad)
  distance: number;     // Distance from target
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

export class CameraController {
  private state: CameraState;
  private projMat = new Float32Array(16);
  private viewMat = new Float32Array(16);
  private vpMat = new Float32Array(16);
  private dirty = true;

  constructor(initial?: Partial<CameraState>) {
    this.state = { ...DEFAULT_STATE, ...initial };
  }

  // ── Getters ──

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
      mat4_multiply(this.vpMat, this.viewMat, this.projMat);
      // viewProjection = projection * view (column-major: multiply(proj, view))
      mat4_multiply(this.vpMat, this.projMat, this.viewMat);
      this.dirty = false;
    }
    return this.vpMat;
  }

  // ── Mutations ──

  orbit(deltaAzimuth: number, deltaElevation: number): void {
    this.state.azimuth += deltaAzimuth;
    this.state.elevation = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.state.elevation + deltaElevation));
    this.dirty = true;
  }

  zoom(delta: number): void {
    this.state.distance = Math.max(0.3, Math.min(10, this.state.distance * (1 - delta * 0.001)));
    this.dirty = true;
  }

  pan(deltaX: number, deltaY: number): void {
    const { azimuth } = this.state;
    // Move in camera's local horizontal and vertical plane
    const speed = this.state.distance * 0.002;
    this.state.target[0] += (-Math.cos(azimuth) * deltaX + Math.sin(azimuth) * deltaY) * speed;
    this.state.target[2] += (Math.sin(azimuth) * deltaX + Math.cos(azimuth) * deltaY) * speed;
    this.state.target[1] += deltaY * speed * 0.5;
    this.dirty = true;
  }

  reset(): void {
    Object.assign(this.state, DEFAULT_STATE);
    this.state.target = [...DEFAULT_STATE.target] as [number, number, number];
    this.dirty = true;
  }

  setDirty(): void {
    this.dirty = true;
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
        this.orbit(-dx * 0.005, dy * 0.005);
      } else if (isPanning) {
        this.pan(dx, -dy);
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      isPanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom(-e.deltaY);
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
        this.orbit(-dx * 0.005, dy * 0.005);
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
