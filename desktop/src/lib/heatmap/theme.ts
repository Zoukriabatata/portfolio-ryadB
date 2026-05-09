// Phase B / M6a-1 — Senzoukria + ATAS heatmap palette.
//
// The web `OrderflowTheme.ts` ships seven presets and ~700 LOC of
// 3D / GEX / IV palettes. M6a only needs the orderbook 2D heatmap
// gradient — port a single preset (atas-like, navy → gold → red)
// and skip the rest. M6c will reintroduce the multi-theme picker.
//
// `generateGradientTexture` returns a 256-pixel RGBA strip that the
// renderer uploads as a 1D lookup texture; the fragment shader
// indexes into it using the per-cell intensity ∈ [0, 1].

export interface HeatmapTheme {
  name: string;
  background: [number, number, number, number];
  /** Stops as { offset ∈ [0, 1], rgb } — interpolated linearly to
   *  fill the 256-pixel gradient strip. */
  stops: { at: number; rgb: [number, number, number] }[];
  axisColor: string;
  gridColor: string;
  textColor: string;
  crosshairColor: string;
}

/** ATAS-flavoured navy → cyan → lime → gold → red. Matches the
 *  Senzoukria primary lime and works well on the navy background. */
export const ATAS_HEATMAP_THEME: HeatmapTheme = {
  name: "atas",
  background: [0.029, 0.034, 0.060, 1.0], // #07080f
  stops: [
    { at: 0.0, rgb: [0.05, 0.06, 0.10] }, // near-black low intensity
    { at: 0.2, rgb: [0.08, 0.16, 0.32] }, // deep navy
    { at: 0.4, rgb: [0.13, 0.36, 0.58] }, // ocean
    { at: 0.6, rgb: [0.29, 0.87, 0.50] }, // lime (Senzoukria primary)
    { at: 0.8, rgb: [0.98, 0.75, 0.14] }, // gold
    { at: 1.0, rgb: [0.94, 0.27, 0.27] }, // red — extreme liquidity
  ],
  axisColor: "rgba(255, 255, 255, 0.10)",
  gridColor: "rgba(255, 255, 255, 0.05)",
  textColor: "#a3a7b3",
  crosshairColor: "#94a3b8",
};

/** Build a 256×4 RGBA texture (Uint8Array) by interpolating the
 *  theme's stops. Returned in RGBA so the renderer can upload it
 *  with `format: 'rgba', type: 'uint8'`. */
export function generateGradientTexture(theme: HeatmapTheme): Uint8Array {
  const width = 256;
  const out = new Uint8Array(width * 4);
  const stops = theme.stops;

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);

    // Find the two stops bracketing t.
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (stops[s].at <= t && stops[s + 1].at >= t) {
        lo = stops[s];
        hi = stops[s + 1];
        break;
      }
    }
    const span = hi.at - lo.at;
    const local = span > 0 ? (t - lo.at) / span : 0;

    const r = lerp(lo.rgb[0], hi.rgb[0], local);
    const g = lerp(lo.rgb[1], hi.rgb[1], local);
    const b = lerp(lo.rgb[2], hi.rgb[2], local);

    const o = i * 4;
    out[o] = clamp255(r * 255);
    out[o + 1] = clamp255(g * 255);
    out[o + 2] = clamp255(b * 255);
    out[o + 3] = 255;
  }

  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
