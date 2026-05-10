// Convertit cells Float32 ∈ [0,1] vers Uint8 ∈ [0,255], in place dans `out`.
// Pas d'allocation. Clamping strict aux bornes.
export function intensityToUint8(cells: Float32Array, out: Uint8Array): void {
  const n = cells.length;
  if (out.length !== n) {
    throw new Error(
      `intensityToUint8: out.length (${out.length}) must match cells.length (${n})`,
    );
  }
  for (let i = 0; i < n; i++) {
    let v = cells[i] * 255;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    out[i] = v | 0;
  }
}
