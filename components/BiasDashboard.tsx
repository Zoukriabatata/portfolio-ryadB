'use client';

import { useTradingData } from '@/lib/useTradingData';
import { useWallAlerts } from '@/lib/useWallAlerts';
import { useLiveSpot } from '@/lib/useLiveSpot';
import { useRef, useEffect } from 'react';
import type {
  BiasDirection, TradeStyle, MarketRegime,
  TradingBias, GEXStreamData, OptionsFlowData,
} from '@/types/trading-bias';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TEAL = '#26beaf';
const BULL = '#34d399';
const BEAR = '#f87171';
const WARN = '#fbbf24';

const dirColor  = (d: BiasDirection) => d === 'BUY' ? BULL : d === 'SELL' ? BEAR : WARN;
const dirBg     = (d: BiasDirection) => d === 'BUY' ? 'rgba(52,211,153,0.06)' : d === 'SELL' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.05)';
const dirBorder = (d: BiasDirection) => d === 'BUY' ? 'rgba(52,211,153,0.22)' : d === 'SELL' ? 'rgba(248,113,113,0.22)' : 'rgba(251,191,36,0.18)';
const dirLabel  = (d: BiasDirection) => d === 'BUY' ? 'LONG' : d === 'SELL' ? 'SHORT' : 'NEUTRAL';

const STYLE_META: Record<TradeStyle, { label: string; color: string; icon: string }> = {
  CONTINUATION:  { label: 'Continuation',  color: TEAL, icon: '→' },
  COUNTER_TREND: { label: 'Counter-Trend', color: WARN, icon: '↩' },
  RANGE_BOUND:   { label: 'Range Bound',   color: 'rgba(148,163,184,0.7)', icon: '↔' },
};
const REGIME_META: Record<MarketRegime, { label: string; color: string; desc: string }> = {
  NEGATIVE_GEX: { label: 'Neg GEX',     color: BEAR, desc: 'Dealers short γ — amplified moves' },
  POSITIVE_GEX: { label: 'Pos GEX',     color: BULL, desc: 'Dealers long γ — mean-reverting' },
  NEUTRAL_GEX:  { label: 'Neutral GEX', color: 'rgba(148,163,184,0.65)', desc: 'Mixed dealer flows' },
};

const SYMBOLS = ['QQQ', 'SPY', 'AAPL', 'NVDA', 'TSLA'];

function fmt(n: number, dec = 2) {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(dec)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(dec)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(dec)}K`;
  return n.toFixed(dec);
}

function ivToPercentile(iv: number): number {
  if (iv <= 10) return 5;
  if (iv <= 15) return 18;
  if (iv <= 20) return 32;
  if (iv <= 25) return 50;
  if (iv <= 30) return 65;
  if (iv <= 35) return 75;
  if (iv <= 45) return 85;
  if (iv <= 60) return 92;
  return 97;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ text, extra }: { text: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>{text}</span>
      {extra}
    </div>
  );
}

// ─── Score Arc Canvas ─────────────────────────────────────────────────────────
function ScoreArc({ score, direction }: { score: number; direction: BiasDirection }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const color = dirColor(direction);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const sz = 68;
    c.width = sz * dpr;
    c.height = sz * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = sz / 2, cy = sz * 0.58, r = 24;
    const sa = Math.PI * 0.75, sweep = Math.PI * 1.5;
    const t = (score + 100) / 200;

    ctx.beginPath();
    ctx.arc(cx, cy, r, sa, sa + sweep);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (t > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, sa, sa + sweep * t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.font = `bold 13px "Consolas", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${score > 0 ? '+' : ''}${score}`, cx, cy - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '8px system-ui';
    ctx.fillText('score', cx, cy + 11);
  }, [score, color]);

  return <canvas ref={ref} style={{ width: 68, height: 68 }} className="shrink-0" />;
}

// ─── Verdict Banner ───────────────────────────────────────────────────────────
function VerdictBanner({ bias, spot }: { bias: TradingBias; spot: number | null }) {
  const color  = dirColor(bias.direction);
  const style  = STYLE_META[bias.tradeStyle];
  const regime = REGIME_META[bias.regime];

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 shrink-0"
      style={{ background: dirBg(bias.direction), borderBottom: `1px solid ${dirBorder(bias.direction)}` }}
    >
      {/* Direction + badges */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[42px] font-black leading-none tracking-tight" style={{ color, textShadow: `0 0 24px ${color}40` }}>
          {dirLabel(bias.direction)}
        </span>
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full"
            style={{ background: `${style.color}18`, color: style.color, border: `1px solid ${style.color}30` }}
          >
            {style.icon} {style.label}
          </span>
          <span className="text-[9px] font-medium" style={{ color: `${regime.color}` }}>
            <span className="font-bold">{regime.label}</span> · {regime.desc}
          </span>
        </div>
      </div>

      {/* Score arc */}
      <ScoreArc score={bias.score} direction={bias.direction} />

      {/* Confidence */}
      <div className="flex-1 min-w-[100px] max-w-[200px]">
        <div className="flex justify-between text-[8.5px] mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
          <span>Confidence</span>
          <span className="font-mono font-black" style={{ color }}>{bias.confidence}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${bias.confidence}%`, background: color, boxShadow: `0 0 8px ${color}60` }}
          />
        </div>
      </div>

      {/* Trade cells */}
      {spot && (
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <TradeCell label="Entry"  value={`$${spot.toFixed(0)}`}                          c="rgba(255,255,255,0.7)" />
          {bias.targets[0]   && <TradeCell label="Target" value={`$${bias.targets[0].toFixed(0)}`}    c={color} />}
          {bias.invalidation && <TradeCell label="Stop"   value={`$${bias.invalidation.toFixed(0)}`}  c={bias.direction === 'BUY' ? BEAR : BULL} />}
        </div>
      )}
    </div>
  );
}

function TradeCell({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg"
      style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>{label}</span>
      <span className="font-mono text-[13px] font-black" style={{ color: c }}>{value}</span>
    </div>
  );
}

// ─── Key Levels ───────────────────────────────────────────────────────────────
function KeyLevels({ gex, spot }: { gex: GEXStreamData; spot: number | null }) {
  const raw = [
    { label: 'Call Wall',  value: gex.callWall,  color: BULL },
    { label: 'Zero Gamma', value: gex.zeroGamma, color: TEAL },
    { label: 'Put Wall',   value: gex.putWall,   color: BEAR },
  ].filter(l => l.value > 0);

  if (spot) {
    raw.push({ label: 'Spot', value: spot, color: 'rgba(255,255,255,0.85)' });
  }
  const sorted = [...raw].sort((a, b) => b.value - a.value);
  const values = sorted.map(l => l.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;

  return (
    <div className="px-3 pb-2 flex flex-col gap-0.5">
      {sorted.map((l, i) => {
        const isSpot = l.label === 'Spot';
        const pct = ((l.value - min) / range) * 100;
        const dist = spot && !isSpot ? ((l.value - spot) / spot * 100) : null;
        return (
          <div key={i} className="relative rounded overflow-hidden">
            {/* bg bar */}
            <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.max(4, pct)}%`, background: l.color, opacity: 0.08 }} />
            <div className="relative flex items-center gap-2 px-2 py-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color, opacity: isSpot ? 1 : 0.75, boxShadow: isSpot ? undefined : `0 0 5px ${l.color}50` }} />
              <span className="font-mono text-[12px] font-bold w-[58px] shrink-0" style={{ color: l.color }}>${l.value.toFixed(0)}</span>
              <span className="text-[10px] flex-1 truncate" style={{ color: isSpot ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)' }}>{l.label}</span>
              {dist !== null && (
                <span className="text-[9px] font-mono ml-auto shrink-0" style={{ color: dist > 0 ? `${BULL}70` : `${BEAR}70` }}>
                  {dist > 0 ? '+' : ''}{dist.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── GEX Profile Chart (canvas) ───────────────────────────────────────────────
function GEXProfileChart({ options, spot }: { options: OptionsFlowData | null; spot: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W < 10 || H < 10) return;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const calls = options?.topCallWalls ?? [];
    const puts  = options?.topPutWalls  ?? [];

    if (calls.length === 0 && puts.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading…', W / 2, H / 2);
      return;
    }

    // Build strike map
    const sm = new Map<number, { c: number; p: number }>();
    for (const x of calls) sm.set(x.strike, { c: x.oi, p: (sm.get(x.strike)?.p ?? 0) });
    for (const x of puts)  { const e = sm.get(x.strike) ?? { c: 0, p: 0 }; e.p = x.oi; sm.set(x.strike, e); }
    const data = [...sm.entries()].sort((a, b) => a[0] - b[0]);
    if (data.length === 0) return;

    const PAD = { t: 18, b: 20, l: 4, r: 4 };
    const cW = W - PAD.l - PAD.r;
    const cH = H - PAD.t - PAD.b;
    const n  = data.length;
    const maxOI = Math.max(...data.flatMap(([, v]) => [v.c, v.p]));
    const stride = cW / n;
    const bw = Math.max(2, stride * 0.4);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = PAD.t + (cH * i / 4);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    }

    data.forEach(([strike, { c, p }], i) => {
      const cx = PAD.l + stride * i + stride / 2;

      if (c > 0) {
        const bh = (c / maxOI) * cH * 0.88;
        const g = ctx.createLinearGradient(0, PAD.t + cH - bh, 0, PAD.t + cH);
        g.addColorStop(0, `${BULL}cc`); g.addColorStop(1, `${BULL}1a`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - bw - 1, PAD.t + cH - bh, bw, bh);
      }

      if (p > 0) {
        const bh = (p / maxOI) * cH * 0.88;
        const g = ctx.createLinearGradient(0, PAD.t + cH - bh, 0, PAD.t + cH);
        g.addColorStop(0, `${BEAR}cc`); g.addColorStop(1, `${BEAR}1a`);
        ctx.fillStyle = g;
        ctx.fillRect(cx + 1, PAD.t + cH - bh, bw, bh);
      }

      if (i % Math.ceil(n / 5) === 0 || i === n - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '7px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${strike.toFixed(0)}`, cx, H - PAD.b + 2);
      }
    });

    // Baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t + cH); ctx.lineTo(W - PAD.r, PAD.t + cH); ctx.stroke();

    // Spot line
    if (spot) {
      const min = data[0][0], max = data[n - 1][0], sr = max - min || 1;
      if (spot >= min && spot <= max) {
        const sx = PAD.l + ((spot - min) / sr) * cW;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(sx, PAD.t); ctx.lineTo(sx, PAD.t + cH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '7px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('▼', sx, PAD.t + 1);
      }
    }

    // Top labels
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '7px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GEX Profile', PAD.l + 2, 2);

    ctx.fillStyle = `${BULL}99`;
    ctx.fillRect(W - 54, 3, 5, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.textAlign = 'left';
    ctx.fillText('Calls', W - 47, 2);
    ctx.fillStyle = `${BEAR}99`;
    ctx.fillRect(W - 22, 3, 5, 5);
    ctx.fillText('Puts', W - 15, 2);

  }, [options, spot]);

  return (
    <div ref={wrapRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

// ─── IV Percentile Arc ────────────────────────────────────────────────────────
function IVPercentileArc({ callIV, putIV }: { callIV: number; putIV: number }) {
  const ref   = useRef<HTMLCanvasElement>(null);
  const atmIV = callIV > 0 && putIV > 0 ? (callIV + putIV) / 2 : callIV || putIV;
  const pct   = ivToPercentile(atmIV);
  const color = pct < 30 ? BULL : pct < 60 ? WARN : BEAR;
  const label = pct < 30 ? 'Low' : pct < 60 ? 'Normal' : pct < 80 ? 'Elevated' : 'Extreme';

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const sz = 76;
    c.width = sz * dpr;
    c.height = sz * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = sz / 2, cy = sz * 0.6, r = 26;
    const sa = Math.PI, ea = Math.PI * 2;
    const sweep = ea - sa;

    ctx.beginPath();
    ctx.arc(cx, cy, r, sa, ea);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Colored segments: green / yellow / red
    const segs = [BULL, WARN, BEAR];
    for (let s = 0; s < 3; s++) {
      const from = s / 3, to = Math.min(pct / 100, (s + 1) / 3);
      if (to <= from) break;
      ctx.beginPath();
      ctx.arc(cx, cy, r, sa + sweep * from, sa + sweep * to);
      ctx.strokeStyle = segs[s];
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.font = `bold 15px "Consolas", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}`, cx, cy - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '8px system-ui';
    ctx.fillText('%ile', cx, cy + 10);

  }, [pct, color]);

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas ref={ref} style={{ width: 76, height: 76 }} />
      <span className="text-[9px] font-black uppercase tracking-wider" style={{ color }}>{label} IV</span>
      <div className="flex gap-2.5 mt-0.5">
        <span className="text-[9px] font-mono" style={{ color: `${BULL}99` }}>C {callIV.toFixed(1)}%</span>
        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span className="text-[9px] font-mono" style={{ color: `${BEAR}99` }}>P {putIV.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─── Expected Move ────────────────────────────────────────────────────────────
function ExpectedMove({ spot, callIV }: { spot: number; callIV: number }) {
  const iv = callIV / 100;
  const windows = [
    { label: '1D', dtes: 1   },
    { label: '1W', dtes: 5   },
    { label: '1M', dtes: 21  },
  ].map(({ label, dtes }) => {
    const move = spot * iv * Math.sqrt(dtes / 252);
    const pct  = (move / spot) * 100;
    return { label, pct, high: spot + move, low: spot - move };
  });

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      {windows.map(w => (
        <div key={w.label} className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-black w-5 shrink-0" style={{ color: TEAL }}>{w.label}</span>
          <div className="relative flex-1 h-[22px] rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="absolute top-1 bottom-1 rounded"
              style={{
                left: '50%',
                width: `${Math.min(88, w.pct * 5)}%`,
                transform: 'translateX(-50%)',
                background: `linear-gradient(90deg, ${BEAR}55, ${BEAR}88 50%, ${BULL}88 50%, ${BULL}55)`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-1.5">
              <span className="text-[8px] font-mono" style={{ color: `${BEAR}bb` }}>${w.low.toFixed(0)}</span>
              <span className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>±{w.pct.toFixed(1)}%</span>
              <span className="text-[8px] font-mono" style={{ color: `${BULL}bb` }}>${w.high.toFixed(0)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Options Sentiment ────────────────────────────────────────────────────────
function OptionsSentiment({ options, flowRatio }: { options: OptionsFlowData; flowRatio: number }) {
  const total   = options.totalCallOI + options.totalPutOI;
  const callPct = total > 0 ? (options.totalCallOI / total) * 100 : 50;
  const putPct  = 100 - callPct;
  const color   = callPct > 55 ? BULL : callPct < 45 ? BEAR : WARN;
  const slabel  = callPct > 55 ? 'Bullish Flow' : callPct < 45 ? 'Bearish Flow' : 'Neutral Flow';

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <div>
        <div className="flex justify-between text-[8.5px] mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
          <span style={{ color: `${BULL}99` }}>Calls {callPct.toFixed(0)}%</span>
          <span className="font-bold" style={{ color }}>{slabel}</span>
          <span style={{ color: `${BEAR}99` }}>Puts {putPct.toFixed(0)}%</span>
        </div>
        <div className="h-3 rounded overflow-hidden flex">
          <div style={{ width: `${callPct}%`, background: `linear-gradient(90deg, ${BULL}55, ${BULL}99)`, transition: 'width 0.7s' }} />
          <div style={{ width: `${putPct}%`, background: `linear-gradient(90deg, ${BEAR}99, ${BEAR}55)`, transition: 'width 0.7s' }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { l: 'P/C OI',  v: options.pcRatio.toFixed(2), c: options.pcRatio > 1.1 ? BEAR : BULL },
          { l: 'C/P Vol', v: flowRatio.toFixed(2),         c: flowRatio > 1.1 ? BULL : BEAR },
          { l: 'IV Skew', v: `${options.skewIndex >= 0 ? '+' : ''}${options.skewIndex.toFixed(1)}%`, c: options.skewIndex > 3 ? BEAR : WARN },
        ].map(m => (
          <div key={m.l} className="flex flex-col items-center py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-[7.5px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.22)' }}>{m.l}</span>
            <span className="font-mono text-[12px] font-black" style={{ color: m.c }}>{m.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dealer Exposure ──────────────────────────────────────────────────────────
function DealerExposure({ gex }: { gex: GEXStreamData }) {
  const vannaProxy = Math.min(100, Math.abs(gex.gexRatio - 1.0) * 60);
  const charmProxy = gex.zeroGamma > 0 && gex.spotPrice > 0
    ? Math.min(100, (Math.abs(gex.spotPrice - gex.zeroGamma) / gex.spotPrice) * 500)
    : 25;
  const deltaProxy = Math.min(100, Math.abs(gex.flowRatio - 1.0) * 90);
  const gammaAbs   = Math.min(100, Math.abs(gex.netGex) / 2e9 * 100);

  const bars = [
    { label: 'Gamma', pct: gammaAbs, value: fmt(gex.netGex), color: gex.netGex > 0 ? BULL : BEAR },
    { label: 'Vanna', pct: vannaProxy, value: `${vannaProxy.toFixed(0)}`, color: vannaProxy > 40 ? WARN : TEAL },
    { label: 'Charm', pct: charmProxy, value: `${charmProxy.toFixed(0)}`, color: charmProxy > 50 ? BEAR : TEAL },
    { label: 'Delta', pct: deltaProxy, value: `${deltaProxy.toFixed(0)}`, color: gex.flowRatio > 1 ? BULL : BEAR },
  ];

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {bars.map(b => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[9px] w-9 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{b.label}</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${b.pct}%`, background: b.color, opacity: 0.75, boxShadow: `0 0 6px ${b.color}50` }} />
          </div>
          <span className="font-mono text-[10px] w-10 text-right shrink-0 font-bold" style={{ color: b.color }}>{b.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Signal Rows ──────────────────────────────────────────────────────────────
function SignalRows({ bias }: { bias: TradingBias }) {
  return (
    <div className="flex flex-col">
      {bias.signals.map((sig, i) => {
        const color = dirColor(sig.direction);
        const pct   = (sig.weight / 30) * 100;
        return (
          <div
            key={sig.name}
            className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
          >
            <div className="w-[3px] self-stretch rounded-full shrink-0" style={{ background: `${color}50`, minHeight: 28 }} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[11px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.72)' }}>{sig.name}</span>
              <span className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.28)' }}>{sig.description}</span>
            </div>
            <span className="font-mono text-[11px] font-bold w-20 text-right shrink-0" style={{ color: 'rgba(255,255,255,0.88)' }}>{sig.value}</span>
            <div className="w-12 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, opacity: 0.65 }} />
            </div>
            <span className="text-[8.5px] font-black uppercase w-11 text-center shrink-0 py-0.5 rounded"
              style={{ background: `${color}14`, color, border: `1px solid ${color}28` }}>
              {sig.direction}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Metrics Strip ────────────────────────────────────────────────────────────
function MetricsStrip({ gex, options }: { gex: GEXStreamData; options: OptionsFlowData | null }) {
  const cells = [
    { l: 'Net GEX',    v: fmt(gex.netGex),                            c: gex.netGex > 0 ? BULL : BEAR },
    { l: 'Zero Gamma', v: `$${gex.zeroGamma.toFixed(0)}`,             c: TEAL },
    { l: 'GEX Ratio',  v: gex.gexRatio.toFixed(2),                    c: gex.gexRatio > 1 ? BULL : BEAR },
    { l: 'C/P Vol',    v: gex.flowRatio.toFixed(2),                   c: gex.flowRatio > 1 ? BULL : BEAR },
    { l: 'Call IV',    v: `${gex.callIV.toFixed(1)}%`,                c: BULL },
    { l: 'Put IV',     v: `${gex.putIV.toFixed(1)}%`,                 c: BEAR },
    { l: 'IV Spread',  v: `${(gex.putIV - gex.callIV).toFixed(1)}pp`, c: (gex.putIV - gex.callIV) > 3 ? BEAR : WARN },
    ...(options ? [
      { l: 'P/C OI',  v: options.pcRatio.toFixed(2),                  c: options.pcRatio > 1.1 ? BEAR : BULL },
      { l: 'Call OI', v: fmt(options.totalCallOI, 0),                  c: `${BULL}99` },
      { l: 'Put OI',  v: fmt(options.totalPutOI, 0),                   c: `${BEAR}99` },
    ] : []),
  ];

  return (
    <div className="flex shrink-0 overflow-x-auto border-t" style={{ borderColor: 'var(--border)' }}>
      {cells.map((c, i) => (
        <div
          key={c.l}
          className="flex-1 min-w-[68px] flex flex-col items-center py-2 px-1 shrink-0"
          style={{ borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}
        >
          <span className="text-[7.5px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{c.l}</span>
          <span className="font-mono font-black text-[11px]" style={{ color: c.c }}>{c.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── AI Reasoning ─────────────────────────────────────────────────────────────
function ReasoningBlock({ text }: { text: string }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black px-2 py-0.5 rounded"
          style={{ background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}28` }}>
          AI
        </span>
        <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.18)' }}>
          Structural Analysis
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.85 }}>{text}</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BiasDashboard() {
  const { gexData, optionsData, bias, loading, error, refresh, symbol, setSymbol } = useTradingData(30_000);
  const liveSpot = useLiveSpot(symbol, 10_000);
  const spot = liveSpot.price > 0 ? liveSpot.price : gexData?.spotPrice ?? null;
  useWallAlerts(gexData, symbol);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Header ── */}
      <header className="flex items-center justify-between gap-3 px-4 h-11 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {SYMBOLS.map(s => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className="px-2.5 py-1 text-[10px] rounded font-bold transition-all duration-150"
                style={symbol === s
                  ? { background: `${TEAL}20`, color: TEAL, boxShadow: `0 0 8px ${TEAL}28` }
                  : { color: 'rgba(255,255,255,0.28)' }
                }
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-medium hidden md:block" style={{ color: 'rgba(255,255,255,0.25)' }}>
            GEX · Options Bias
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {spot && (
            <span className="font-mono text-[14px] font-black" style={{ color: TEAL }}>
              ${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px]"
            style={gexData
              ? { background: `${TEAL}0e`, color: TEAL, border: `1px solid ${TEAL}22` }
              : { background: 'rgba(251,191,36,0.06)', color: WARN, border: '1px solid rgba(251,191,36,0.16)' }
            }
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: gexData ? TEAL : WARN }} />
            {gexData ? `CBOE · ${gexData.date}` : loading ? 'Loading…' : 'No data'}
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'rgba(255,255,255,0.38)' }}
            title="Refresh (60s auto)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              className={loading ? 'animate-spin' : ''}>
              <path d="M4 12C4 7.58 7.58 4 12 4c3.37 0 6.26 2.11 7.42 5" />
              <path d="M20 12c0 4.42-3.58 8-8 8-3.37 0-6.26-2.11-7.42-5" />
              <polyline points="20 4 20 9 15 9" />
              <polyline points="4 20 4 15 9 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Error ── */}
      {error && (
        <div className="px-4 py-1.5 text-[10px] shrink-0"
          style={{ background: 'rgba(251,191,36,0.05)', color: WARN, borderBottom: '1px solid rgba(251,191,36,0.12)' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !bias && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-7 h-7 border-2 rounded-full animate-spin"
            style={{ borderColor: `${TEAL}25`, borderTopColor: TEAL }} />
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Fetching CBOE data for {symbol}…
          </p>
        </div>
      )}

      {/* ── Content ── */}
      {bias && gexData && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Verdict banner */}
          <VerdictBanner bias={bias} spot={spot} />

          {/* Three-column body */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* LEFT — Key Levels + GEX Profile */}
            <div className="w-[240px] shrink-0 flex flex-col overflow-hidden border-r" style={{ borderColor: 'var(--border)' }}>
              <SectionLabel text="Key Levels" />
              <KeyLevels gex={gexData} spot={spot} />

              <div className="border-t mx-3 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              <SectionLabel text="GEX Profile" />
              <div className="flex-1 min-h-0 px-2 pb-2">
                <GEXProfileChart options={optionsData} spot={spot} />
              </div>
            </div>

            {/* CENTER — Signals + Options Sentiment */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto border-r" style={{ borderColor: 'var(--border)' }}>
              <SectionLabel text="Signal Analysis" />
              <SignalRows bias={bias} />

              {optionsData && (
                <>
                  <div className="border-t mx-3 shrink-0 mt-1" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                  <SectionLabel text="Options Sentiment" />
                  <OptionsSentiment options={optionsData} flowRatio={gexData.flowRatio} />
                </>
              )}
            </div>

            {/* RIGHT — IV + Expected Move + Dealer */}
            <div className="w-[220px] shrink-0 flex flex-col overflow-y-auto">
              <SectionLabel text="Implied Volatility" />
              <div className="flex justify-center pb-1">
                <IVPercentileArc callIV={gexData.callIV} putIV={gexData.putIV} />
              </div>

              <div className="border-t mx-3 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              <SectionLabel text="Expected Move" />
              {spot && gexData.callIV > 0 && <ExpectedMove spot={spot} callIV={gexData.callIV} />}

              <div className="border-t mx-3 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              <SectionLabel text="Dealer Exposure" extra={
                <span className="text-[7.5px] px-1.5 py-0.5 rounded" style={{ background: `${TEAL}10`, color: `${TEAL}80` }}>proxy</span>
              } />
              <DealerExposure gex={gexData} />
            </div>
          </div>

          {/* Metrics strip */}
          <MetricsStrip gex={gexData} options={optionsData} />

          {/* AI Reasoning */}
          <div className="shrink-0 overflow-y-auto border-t" style={{ borderColor: 'var(--border)' }}>
            <ReasoningBlock text={bias.reasoning} />
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {!bias && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <span className="text-5xl opacity-10">🎯</span>
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>No data loaded</p>
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all hover:scale-105"
            style={{ background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}30` }}
          >
            Load {symbol}
          </button>
        </div>
      )}
    </div>
  );
}
