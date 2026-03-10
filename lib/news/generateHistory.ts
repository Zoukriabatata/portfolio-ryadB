// Deterministic historical release generator
// Used to show "last 6 releases" sparkline in event detail panel

export interface HistoricalPoint {
  period: string;
  actualStr: string;
  actual: number;
  forecast: number;
  deviation: 'beat' | 'miss' | 'inline';
}

function seededRng(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function fmtLike(num: number, template?: string): string {
  if (!template) return num.toFixed(1);
  const t = template.trim();
  if (t.endsWith('K')) return `${(num / 1000).toFixed(1)}K`;
  if (t.endsWith('M')) return `${(num / 1_000_000).toFixed(2)}M`;
  if (t.endsWith('B')) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (t.endsWith('%')) {
    const m = t.replace('%', '').match(/\.(\d+)/);
    return `${num.toFixed(m ? m[1].length : 1)}%`;
  }
  const m = t.match(/\.(\d+)/);
  return num.toFixed(m ? m[1].length : 1);
}

function parseRaw(s?: string): number | null {
  if (!s) return null;
  const t = s.trim();
  let mult = 1;
  let clean = t;
  if (t.endsWith('K')) { mult = 1000; clean = t.slice(0, -1); }
  else if (t.endsWith('M')) { mult = 1_000_000; clean = t.slice(0, -1); }
  else if (t.endsWith('B')) { mult = 1_000_000_000; clean = t.slice(0, -1); }
  const n = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n * mult;
}

const PERIODS = ["Oct '24", "Nov '24", "Dec '24", "Jan '25", "Feb '25", "Mar '25"];

export function generateHistory(eventName: string, previousValue?: string): HistoricalPoint[] {
  const rng = seededRng(hashStr(eventName));

  const baseRaw = parseRaw(previousValue) ?? 100;
  const spread = Math.abs(baseRaw) * 0.08 || 1;

  return PERIODS.map((period) => {
    const forecast = baseRaw + (rng() - 0.5) * spread * 2;
    const actual = forecast + (rng() - 0.5) * spread * 1.5;
    const threshold = Math.abs(forecast) * 0.05 || 0.01;
    const deviation: 'beat' | 'miss' | 'inline' =
      actual - forecast > threshold ? 'beat' :
      forecast - actual > threshold ? 'miss' : 'inline';
    return {
      period,
      actual,
      forecast,
      deviation,
      actualStr: fmtLike(actual, previousValue),
    };
  });
}
