// Construit une texture 256×1 RGBA8 par interpolation linéaire entre les
// 7 stops --heat-0..--heat-6 lus sur :root via getComputedStyle.
// Allocation unique. À appeler une seule fois au mount de la Layer.

const STOP_COUNT = 7;

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 6) {
    throw new Error(`gradient: hex CSS color expected #rrggbb, got "${hex}"`);
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    throw new Error(`gradient: invalid hex CSS color "${hex}"`);
  }
  return [r, g, b];
}

function readHeatStops(): Array<[number, number, number]> {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const stops: Array<[number, number, number]> = [];
  for (let i = 0; i < STOP_COUNT; i++) {
    const raw = style.getPropertyValue(`--heat-${i}`);
    if (!raw) {
      throw new Error(
        `gradient: CSS variable --heat-${i} is undefined. Did you import tokens.css?`,
      );
    }
    stops.push(parseHexColor(raw));
  }
  return stops;
}

export function buildGradientTexture256(): Uint8Array {
  const stops = readHeatStops();
  const data = new Uint8Array(256 * 4);
  const segments = STOP_COUNT - 1; // 6 segments entre 7 stops
  for (let p = 0; p < 256; p++) {
    const t = p / 255;
    const scaled = t * segments;
    let idx = Math.floor(scaled);
    if (idx >= segments) idx = segments - 1;
    const frac = scaled - idx;
    const a = stops[idx];
    const b = stops[idx + 1];
    data[p * 4 + 0] = (a[0] + (b[0] - a[0]) * frac) | 0;
    data[p * 4 + 1] = (a[1] + (b[1] - a[1]) * frac) | 0;
    data[p * 4 + 2] = (a[2] + (b[2] - a[2]) * frac) | 0;
    data[p * 4 + 3] = 255;
  }
  return data;
}
