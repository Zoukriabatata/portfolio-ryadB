'use client';

/**
 * FootprintTEST Chart — DeepChart style
 *
 * Visual concept (DeepChart / ATAS):
 *  • Split bid/ask bars: bid fills from LEFT edge, ask from RIGHT edge
 *  • Text-first: bright numbers (bid | price | ask) over bar backgrounds
 *  • POC: full-width gold horizontal line at cell bottom
 *  • Imbalance triangles: ▶/◀ on cells with ratio > 3:1
 *  • Delta + volume callout above each candle
 *  • VWAP: quadratic-spline gold dashed line
 *  • CVD panel: area chart at bottom
 *  • Mouse: scroll (pan) | ctrl+wheel (zoom candleW) | shift+wheel (zoom rowH) | drag (pan)
 */

import { useEffect, useRef, useCallback, useMemo, useState, useLayoutEffect } from 'react';
import { generateSimCandles, type SimCandle, type SimLevel } from './SimulationEngine';
import { binanceWS } from '@/lib/websocket/BinanceWS';
import { SYMBOL_GROUPS } from './index';

// CME Micro Futures — Binance has no listings for these; use sim DOM only
const CME_SYMBOLS = new Set(['mnq', 'mes', 'mym', 'm2k']);
const ABSORPTION_THRESHOLD = 15; // DOM qty above which price absorption is possible

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg        : '#1e2128',   // ATAS medium-dark gray
  surface   : '#252830',
  grid      : '#2e3340',
  bid       : '#ef5350',   // ATAS standard red
  ask       : '#26a69a',   // ATAS standard teal
  poc       : '#c89020',   // gold
  deltaPos  : '#26a69a',
  deltaNeg  : '#ef5350',
  vwap      : '#ffab38',
  text      : '#9ab0c8',
  textMuted : '#4a5e74',
  price     : '#d8eaff',
  separator : 'rgba(90,120,200,0.22)',
  cvdBg     : '#1e2128',
  infoAsk   : '#1a3a2a',   // green-tinted row bg
  infoBid   : '#3a1a1a',   // red-tinted row bg
  infoDelta : '#1a2030',
  infoVol   : '#161820',
};

// ─── Layout constants ─────────────────────────────────────────────────────────

const PRICE_W      = 68;
const TIME_H       = 22;
const CVD_H        = 80;
const HDR_H        = 30;
const INFO_H       = 52;   // Ask / Bid / Delta / Volume strip below footprint
const SESSION_BAR_H = 18;  // Session Bid | Ask | Total summary bar
const FONT         = '"Consolas","Monaco",monospace';

const TF_LABEL: Record<number, string> = {
  60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1H', 7200: '2H', 14400: '4H', 86400: '1D', 604800: '1W',
};

// ─── Chart Settings ───────────────────────────────────────────────────────────

interface ChartSettings {
  // Visual
  showVWAP        : boolean;
  showGrid        : boolean;
  barOpacity      : number;          // 0.20 – 0.80
  gridOpacity     : number;          // 0.05 – 0.40
  colorScheme     : 'atas' | 'bookmap' | 'mono' | 'custom';
  customBid       : string;          // hex, used when colorScheme='custom'
  customAsk       : string;
  customPOC       : string;
  customVWAP      : string;
  customWick      : string;          // wick line color (custom mode)
  customBorder    : string;          // candle body border (custom mode)
  customBg        : string;          // chart background color
  customGrid      : string;          // grid / separator line color
  // Visual extras
  showCVD         : boolean;         // show/hide CVD panel at bottom
  cellMode        : 'both' | 'numbers' | 'bars';  // footprint cell content
  // Footprint
  imbalanceThresh : number;          // 1.5 – 10
  showPOC         : boolean;
  showDeltaCallout: boolean;
  showVolProfile  : boolean;
  showDeltaBars   : boolean;
  showDOMOverlay  : boolean;
  showImbalance   : boolean;         // diagonal imbalance markers
  minCellVolPct   : number;          // 0–20% — filter low-vol cell bars
  // Level lines
  showHighLow     : boolean;         // session high / low dashed lines
  showSessionOpen : boolean;         // session open horizontal line
  customHighLow   : string;          // color for H/L lines
  customSessionOpen: string;         // color for session open line
  // Trading
  defaultQty      : number;
  riskPercent     : number;          // 0.1 – 5
  showPnLOverlay  : boolean;
}

const DEFAULT_SETTINGS: ChartSettings = {
  showVWAP: true, showGrid: true, barOpacity: 0.50, gridOpacity: 0.18,
  colorScheme: 'atas', customBid: '#ef5350', customAsk: '#26a69a',
  customPOC: '#c89020', customVWAP: '#ffab38', customWick: '#c8dff8', customBorder: '#c8dff8',
  customBg: '#080b14', customGrid: '#0e1628',
  showCVD: true, cellMode: 'both',
  imbalanceThresh: 3, showPOC: true, showDeltaCallout: true,
  showVolProfile: true, showDeltaBars: false, showDOMOverlay: true,
  showImbalance: true, minCellVolPct: 0,
  showHighLow: false, showSessionOpen: false,
  customHighLow: '#ffd740', customSessionOpen: '#7a9fc0',
  defaultQty: 1, riskPercent: 1, showPnLOverlay: false,
};

type SettingsTab = 'visual' | 'footprint' | 'trading' | 'templates';

const COLOR_SCHEMES = {
  atas    : { bid: '#ef5350', ask: '#26a69a', poc: '#c89020', vwap: '#ffab38' },
  bookmap : { bid: '#ff4040', ask: '#4488ff', poc: '#ffcc00', vwap: '#ff8c00' },
  mono    : { bid: '#888888', ask: '#cccccc', poc: '#aaaaaa', vwap: '#bbbbbb' },
} as const;

function getSchemeColors(cfg: ChartSettings) {
  if (cfg.colorScheme === 'custom') {
    return {
      bid: cfg.customBid, ask: cfg.customAsk,
      poc: cfg.customPOC, vwap: cfg.customVWAP,
      wick: cfg.customWick, border: cfg.customBorder,
    };
  }
  const s = COLOR_SCHEMES[cfg.colorScheme];
  return { ...s, wick: null, border: null };  // null = inherit body color
}

// ─── HSV color math ───────────────────────────────────────────────────────────

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k   = (n + h / 60) % 6;
    const val = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(val * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

// ─── HSV picker component ──────────────────────────────────────────────────────

const SV_W = 200; const SV_H = 148; const HUE_H = 14;

function HSVPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ff0000';
  const init = hexToHsv(safe);

  const [hue, setHue]      = useState(init[0]);
  const [sat, setSat]      = useState(init[1]);
  const [val, setVal]      = useState(init[2]);
  const [hexIn, setHexIn]  = useState(safe.slice(1).toUpperCase());

  // Refs so window listeners always see latest values without re-binding
  const hR = useRef(init[0]);
  const sR = useRef(init[1]);
  const vR = useRef(init[2]);
  const svDrag  = useRef(false);
  const hueDrag = useRef(false);
  const svRef   = useRef<HTMLCanvasElement>(null);
  const hueRef  = useRef<HTMLCanvasElement>(null);

  // Sync when parent changes the value externally
  useLayoutEffect(() => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    const [nh, ns, nv] = hexToHsv(value);
    hR.current = nh; sR.current = ns; vR.current = nv;
    setHue(nh); setSat(ns); setVal(nv);
    setHexIn(value.slice(1).toUpperCase());
  }, [value]);

  // Draw SV gradient whenever hue changes
  useEffect(() => {
    const cv = svRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = `hsl(${hue},100%,50%)`;
    ctx.fillRect(0, 0, SV_W, SV_H);
    const wg = ctx.createLinearGradient(0, 0, SV_W, 0);
    wg.addColorStop(0, 'rgba(255,255,255,1)');
    wg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, SV_W, SV_H);
    const bg = ctx.createLinearGradient(0, 0, 0, SV_H);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, SV_W, SV_H);
  }, [hue]);

  // Draw hue rainbow (once)
  useEffect(() => {
    const cv = hueRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const gr = ctx.createLinearGradient(0, 0, SV_W, 0);
    for (let i = 0; i <= 12; i++) gr.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, SV_W, HUE_H);
  }, []);

  const emitSv = useCallback((e: MouseEvent) => {
    const cv = svRef.current;
    if (!cv) return;
    const r  = cv.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (e.clientX - r.left)  / r.width));
    const nv = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    sR.current = ns; vR.current = nv;
    setSat(ns); setVal(nv);
    const h = hsvToHex(hR.current, ns, nv);
    setHexIn(h.slice(1).toUpperCase());
    onChange(h);
  }, [onChange]);

  const emitHue = useCallback((e: MouseEvent) => {
    const cv = hueRef.current;
    if (!cv) return;
    const r  = cv.getBoundingClientRect();
    const nh = Math.max(0, Math.min(359.9, ((e.clientX - r.left) / r.width) * 360));
    hR.current = nh; setHue(nh);
    const h = hsvToHex(nh, sR.current, vR.current);
    setHexIn(h.slice(1).toUpperCase());
    onChange(h);
  }, [onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (svDrag.current)  emitSv(e);
      if (hueDrag.current) emitHue(e);
    };
    const onUp = () => { svDrag.current = false; hueDrag.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [emitSv, emitHue]);

  const cx = Math.round(sat * SV_W);
  const cy = Math.round((1 - val) * SV_H);
  const hx = Math.round((hue / 360) * SV_W);
  const previewHex = hsvToHex(hue, sat, val);

  return (
    <div style={{ width: SV_W, userSelect: 'none' }}>
      {/* SV canvas */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <canvas ref={svRef} width={SV_W} height={SV_H}
          style={{ display: 'block', borderRadius: 4, cursor: 'crosshair' }}
          onMouseDown={e => { svDrag.current = true; emitSv(e.nativeEvent); }}
        />
        {/* Circle cursor */}
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          left: cx - 7, top: cy - 7, width: 14, height: 14,
          borderRadius: '50%',
          border: `2px solid ${val > 0.45 ? '#000' : '#fff'}`,
          boxShadow: '0 0 4px rgba(0,0,0,0.7)',
          background: previewHex,
        }} />
      </div>

      {/* Hue rainbow slider */}
      <div style={{ position: 'relative', marginBottom: 12, height: HUE_H }}>
        <canvas ref={hueRef} width={SV_W} height={HUE_H}
          style={{ display: 'block', borderRadius: 7, cursor: 'pointer', width: SV_W, height: HUE_H }}
          onMouseDown={e => { hueDrag.current = true; emitHue(e.nativeEvent); }}
        />
        {/* Thumb */}
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          left: hx - 7, top: -3, width: 14, height: 20,
          borderRadius: 3,
          border: '2px solid #fff',
          boxShadow: '0 1px 6px rgba(0,0,0,0.7)',
          background: `hsl(${hue},100%,50%)`,
        }} />
      </div>

      {/* Hex input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: previewHex, flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.15)',
        }} />
        <span style={{ color: '#5a7aaa', fontSize: 11, fontFamily: FONT }}>#</span>
        <input
          value={hexIn}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
            setHexIn(raw);
            if (raw.length === 6) {
              const full = '#' + raw;
              const [nh, ns, nv] = hexToHsv(full);
              hR.current = nh; sR.current = ns; vR.current = nv;
              setHue(nh); setSat(ns); setVal(nv);
              onChange(full.toLowerCase());
            }
          }}
          maxLength={6}
          spellCheck={false}
          placeholder="RRGGBB"
          style={{
            flex: 1, padding: '4px 6px',
            background: '#06080f', border: '1px solid #2a3e5e',
            borderRadius: 3, color: '#c8dff8',
            fontFamily: FONT, fontSize: 11, outline: 'none',
            letterSpacing: '0.05em',
          }}
        />
      </div>
    </div>
  );
}

// ─── Color swatch button that opens HSV picker popup ──────────────────────────

function ColorPicker({ value, onChange, label }: {
  value: string; onChange: (c: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* Swatch trigger */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{
          width: 26, height: 26, borderRadius: 4, background: value, flexShrink: 0,
          border: open ? '2px solid #5a9af0' : '2px solid rgba(90,130,180,0.4)',
          boxShadow: open ? `0 0 8px ${value}88` : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }} />
        <span style={{ fontSize: 10, color: '#7a9fc0', userSelect: 'none' }}>{label}</span>
      </div>

      {/* Popup */}
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 34, zIndex: 300,
          background: '#0b1322', border: '1px solid #2a3e5e',
          borderRadius: 8, padding: '12px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.85)',
        }}>
          <HSVPicker value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

const TEMPLATES: { name: string; icon: string; desc: string; settings: Partial<ChartSettings> }[] = [
  { name: 'ATAS Default',  icon: '◈', desc: 'Red / Teal · Full features',
    settings: { colorScheme: 'atas',    barOpacity: 0.50, gridOpacity: 0.18, showVWAP: true,  showGrid: true,  showVolProfile: true,  showDeltaBars: false, showDOMOverlay: true  } },
  { name: 'Bookmap',       icon: '◉', desc: 'Red / Blue · Liquidity focus',
    settings: { colorScheme: 'bookmap', barOpacity: 0.60, gridOpacity: 0.20, showVWAP: true,  showGrid: true,  showVolProfile: true,  showDeltaBars: true,  showDOMOverlay: true  } },
  { name: 'Dark Minimal',  icon: '◼', desc: 'Mono · Clean no-noise view',
    settings: { colorScheme: 'mono',    barOpacity: 0.35, gridOpacity: 0.10, showVWAP: false, showGrid: false, showVolProfile: false, showDeltaBars: false, showDOMOverlay: false } },
  { name: 'High Contrast', icon: '◇', desc: 'Red / Teal · Max visibility',
    settings: { colorScheme: 'atas',    barOpacity: 0.75, gridOpacity: 0.25, showVWAP: true,  showGrid: true,  showVolProfile: true,  showDeltaBars: true,  showDOMOverlay: true  } },
  { name: 'Night Owl',     icon: '◑', desc: 'Purple / Cyan · Custom colors',
    settings: { colorScheme: 'custom',  barOpacity: 0.55, gridOpacity: 0.15, showVWAP: true,  showGrid: true,  showVolProfile: true,  showDeltaBars: false, showDOMOverlay: true,
                customBid: '#b04fc8', customAsk: '#00bcd4', customPOC: '#e040fb', customVWAP: '#80deea' } },
  { name: 'Lava',          icon: '◔', desc: 'Orange / Lime · High energy',
    settings: { colorScheme: 'custom',  barOpacity: 0.60, gridOpacity: 0.18, showVWAP: true,  showGrid: true,  showVolProfile: true,  showDeltaBars: true,  showDOMOverlay: true,
                customBid: '#ff6d00', customAsk: '#76ff03', customPOC: '#ffd740', customVWAP: '#ffff00' } },
  { name: 'Clean Vol',     icon: '▤', desc: 'Vol profile only · No overlays',
    settings: { colorScheme: 'atas',    barOpacity: 0.45, gridOpacity: 0.12, showVWAP: false, showGrid: true,  showVolProfile: true,  showDeltaBars: false, showDOMOverlay: false } },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1000)}K`;
  if (a >= 1e3) return `${(v / 1000).toFixed(1)}K`;
  return Math.round(v).toString();
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function fmtPrice(p: number, tick: number): string {
  const dec = tick < 0.01 ? 4 : tick < 1 ? 2 : tick < 10 ? 1 : 0;
  return p.toFixed(dec);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  symbol         ?: string;
  tickSize       ?: number;
  onSymbolChange ?: (s: string) => void;
}

export default function FootprintTESTChart({ symbol = 'BTCUSDT', tickSize = 10, onSymbolChange }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<SimCandle[]>([]);
  // ── Navigation state ─────────────────────────────────────────────────────
  type NavState = { candleW: number; rowH: number; offsetX: number; vZoom: number; priceCenter: number | null };
  const INIT_NAV: NavState = { candleW: 88, rowH: 13, offsetX: 0, vZoom: 1, priceCenter: null };

  const stateRef    = useRef<NavState>({ ...INIT_NAV });   // current rendered (smoothed)
  const targetRef   = useRef<NavState>({ ...INIT_NAV });   // gesture target
  const lastViewRef = useRef<{ priceMin: number; pRange: number; chartY: number; chartH: number } | null>(null);
  const hoverRef    = useRef<{ x: number; y: number } | null>(null);
  const dragRef     = useRef<{ active: boolean; startX: number; startY: number; startOff: number; startCenter: number; button: number }>({ active: false, startX: 0, startY: 0, startOff: 0, startCenter: 0, button: 0 });
  const velRef      = useRef({ x: 0 });                    // inertia px/frame
  const velTrackRef = useRef<{ t: number; x: number }[]>([]);
  const vPanRef     = useRef({ active: false, moved: false, startY: 0, startCenter: 0 });
  const axisZoomRef = useRef({
    active       : false,
    mode         : 'x' as 'x' | 'y',
    startX       : 0, startY       : 0,
    startCandleW : 88, startOffsetX : 0, startVZoom : 1,
    anchorPrice  : 0,  anchorPixel  : 0, anchorCandle: 0,
  });
  const dirtyRef    = useRef(true);
  const rafRef      = useRef(0);
  const dprRef      = useRef(1);   // device pixel ratio, updated on resize
  const vwapPtsRef  = useRef<{ x: number; y: number }[]>([]);
  const tfSecondsRef  = useRef(300);
  const hasRealDOMRef = useRef(false);   // true when real Binance depth data arrived
  const domBidsRef = useRef<Map<number, number>>(new Map());
  const domAsksRef = useRef<Map<number, number>>(new Map());
  // Stateful simulated order book (persists between ticks)
  const simBookRef = useRef<{
    bids: Map<number, number>;
    asks: Map<number, number>;
    price: number;
  } | null>(null);
  const [ctxMenu,       setCtxMenu]       = useState<{ x: number; y: number } | null>(null);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [settingsTab,   setSettingsTab]   = useState<SettingsTab>('visual');
  const [settings,      setSettings]      = useState<ChartSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<ChartSettings>(DEFAULT_SETTINGS);
  const [tfSeconds,     setTfSeconds]     = useState(300); // default 5m
  const [symbolPanelOpen, setSymbolPanelOpen] = useState(false);
  const [symbolSearch,    setSymbolSearch]    = useState('');
  const [symbolTab,       setSymbolTab]       = useState<'all' | 'cme' | 'majors' | 'alts'>('all');

  // ── DOM subscription (Binance symbols only — CME symbols use sim DOM) ────
  useEffect(() => {
    hasRealDOMRef.current = false; // reset on symbol change so sim DOM can run
    simBookRef.current    = null;  // force sim book rebuild for new symbol
    if (CME_SYMBOLS.has(symbol.toLowerCase())) return; // Binance has no CME listings
    const unsub = binanceWS.subscribeDepth20(symbol.toLowerCase(), (snap) => {
      hasRealDOMRef.current = true; // real data arrived — sim DOM will back off
      const bids = new Map<number, number>();
      const asks = new Map<number, number>();
      snap.bids.forEach(([p, q]) => { const qty = parseFloat(q); if (qty > 0) bids.set(parseFloat(p), qty); });
      snap.asks.forEach(([p, q]) => { const qty = parseFloat(q); if (qty > 0) asks.set(parseFloat(p), qty); });
      domBidsRef.current = bids;
      domAsksRef.current = asks;
      dirtyRef.current = true;
    }, 'futures', '100ms');
    return unsub;
  }, [symbol]);

  // ── Unified tick — DOM simulation + live candle in one loop (no race) ────────
  // A single 200ms interval owns both the order book state and the candle update.
  // `book` is a closure-local variable — never shared via ref between two loops,
  // so there are zero race conditions between DOM updates and footprint prints.
  //
  // Correlation rule (plan: proud-conjuring-hennessy):
  //   DOM limit SELL (ask) consumed by market BUY → footprint ASK += qty × fillRate
  //   DOM limit BUY  (bid) consumed by market SELL → footprint BID += qty × fillRate
  //   fillRate = 40–80% per sweep tick (direct, not sqrt-compressed)
  //   Price flat → passive fills 3–8% of spread depth, ratio weighted by DOM depth
  useEffect(() => {
    const nowSec = () => Math.floor(Date.now() / 1000);
    let startTime    = nowSec();
    let flowMomentum = 0; // order flow autocorrelation ∈ [-1, +1] (Bouchaud et al.)

    // ── Markov volatility regime ──────────────────────────────────────────────
    // trend  : strong directional flow, momentum dominant, wide swings
    // range  : mean-reversion, VWAP pull, lower momentum persistence
    function rInt(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
    let regime     : 'trend' | 'range' = 'range';
    let regimeLeft = rInt(30, 70);      // ticks until next possible regime transition
    // VWAP accumulator — persists across the full session, never reset per candle
    let vwapNum = 0, vwapDen = 0;
    // Hawkes self-exciting process: burst arrival rate rises after large fills
    // half-life = 5 ticks → decay factor = exp(-ln2/5) ≈ 0.871
    let excitation = 0;                 // ∈ [0,1]
    // Persistent absorption zones: consecutive failed breaks raise absorption prob
    const failedBreaks = new Map<number, number>();
    // EMA of near-price DOM depth — adaptive absorption threshold
    let avgNearDepth = 20;
    // GARCH(1,1) stochastic volatility state — mean-reverts to 1.0
    let volVar = 1.0;

    // ── DOM state (closure-local, not a shared ref) ───────────────────────────
    const DEPTH         = 30;        // 30 levels each side — matches ATAS "scale 20" default
    const icebergLevels = new Set<number>();
    let book: { bids: Map<number, number>; asks: Map<number, number>; price: number } | null = null;
    let perturbCounter  = 0;         // only perturb DOM every N ticks (~300ms cadence)

    // Log-normal sampler (Box-Muller)
    function lnSample(mu: number, sigma: number): number {
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.exp(mu + sigma * z);
    }

    // Realistic order size: log-normal base + additive wall bonus at key levels
    //   Near-price (dist ≤ 3): thin, no walls — real books are sparse at spread
    //   Regular levels : 2–15 contracts (median ≈ 4)
    //   10-tick nodes  : 8–35   | 25-tick : 15–60
    //   50-tick nodes  : 30–110 | 100-tick: 60–200  (institutional walls)
    function levelQty(distTicks: number, lp: number): number {
      const base = lnSample(1.3, 0.55); // median ≈ 3.7, tighter spread than before
      // Near spread: thin liquidity, no structural walls
      if (distTicks <= 3) {
        return Math.max(1, Math.round(base * (0.6 + Math.random() * 0.7)));
      }
      let wall = 0;
      if      (distTicks % 100 === 0) wall = lnSample(4.2, 0.40);  // large institutional wall
      else if (distTicks % 50  === 0) wall = lnSample(3.5, 0.40);
      else if (distTicks % 25  === 0) wall = lnSample(2.8, 0.40);
      else if (distTicks % 10  === 0) wall = lnSample(2.1, 0.40);
      // Iceberg: larger and more persistent (real icebergs refresh in place)
      const iceMult = distTicks > 5 && icebergLevels.has(lp) ? 3.0 + Math.random() * 4.0 : 1;
      return Math.max(1, Math.round((base + wall) * iceMult));
    }

    // Build the initial order book (~5% of levels seeded as icebergs for dist > 5)
    function buildBook(price: number) {
      const bids = new Map<number, number>();
      const asks = new Map<number, number>();
      for (let i = 1; i <= DEPTH; i++) {
        const bp = Math.round((price - i * tickSize) / tickSize) * tickSize;
        const ap = Math.round((price + i * tickSize) / tickSize) * tickSize;
        if (i > 5 && Math.random() < 0.05) icebergLevels.add(bp);
        if (i > 5 && Math.random() < 0.05) icebergLevels.add(ap);
        bids.set(bp, levelQty(i, bp));
        asks.set(ap, levelQty(i, ap));
      }
      book = { bids, asks, price };
    }

    const tick = () => {
      const all = candlesRef.current;
      if (all.length === 0) return;
      const last = all[all.length - 1];

      // [0] Initialize book on first tick
      if (!book) {
        buildBook(last.close);
        domBidsRef.current = book!.bids;
        domAsksRef.current = book!.asks;
        simBookRef.current = book;
        dirtyRef.current   = true;
        return;
      }

      // [1] Candle rotation — timeframe elapsed
      const elapsed = nowSec() - startTime;
      if (elapsed >= tfSecondsRef.current) {
        startTime = nowSec();
        // VWAP intentionally NOT reset — accumulates across the full session
        const newOpen = last.close;
        const newCandle: SimCandle = {
          time    : startTime,
          open    : newOpen, close: newOpen, high: newOpen, low: newOpen,
          totalVol: 0, delta: 0,
          levels  : [{ price: newOpen, bidVol: 0, askVol: 0 }],
          poc     : newOpen,
        };
        candlesRef.current = [...all.slice(-199), newCandle];
        dirtyRef.current   = true;
        return;
      }

      // [1b] Markov regime transition
      if (--regimeLeft <= 0) {
        if (regime === 'range' && Math.random() < 0.22) {
          regime = 'trend'; regimeLeft = rInt(15, 45);
        } else if (regime === 'trend' && Math.random() < 0.40) {
          regime = 'range'; regimeLeft = rInt(35, 90);
        } else {
          regimeLeft = regime === 'trend' ? rInt(5, 20) : rInt(20, 50);
        }
      }

      // Hawkes decay: exponential kernel, half-life = 5 ticks (exp(-ln2/5) ≈ 0.871)
      excitation *= 0.871;

      // [2] Price movement: Bouchaud autocorrelation + DOM imbalance + VWAP pull
      const prevClose = last.close;

      // DOM imbalance: sum qty of 5 nearest bid vs ask levels
      let bidNear = 0, askNear = 0;
      for (let i = 1; i <= 5; i++) {
        bidNear += book.bids.get(Math.round((prevClose - i * tickSize) / tickSize) * tickSize) ?? 0;
        askNear += book.asks.get(Math.round((prevClose + i * tickSize) / tickSize) * tickSize) ?? 0;
      }
      // Normalize to [-1, +1]: positive = bids dominate → bullish
      const domImbalance = (bidNear - askNear) / Math.max(bidNear + askNear, 1);

      // Adaptive absorption threshold: EMA of near-price depth (auto-calibrates per symbol)
      const nearTotalDepth = bidNear + askNear;
      avgNearDepth = 0.95 * avgNearDepth + 0.05 * (nearTotalDepth / 6);
      const absThresh = Math.max(5, avgNearDepth * 0.60);

      // VWAP mean-reversion signal (clipped at ±8 basis points)
      const vwap       = vwapDen > 0 ? vwapNum / vwapDen : prevClose;
      const vwapDiff   = (vwap - prevClose) / (tickSize * 10);
      const vwapBlend  = regime === 'trend' ? 0.02 : 0.09; // range pulls harder toward VWAP
      const vwapSignal = Math.max(-0.08, Math.min(0.08, vwapDiff * vwapBlend));

      // Regime-dependent momentum persistence
      const momDecay = regime === 'trend' ? 0.82 : 0.62;

      // GARCH(1,1) stochastic volatility: σ²_t = 0.10 + 0.15*ε²_{t-1} + 0.75*σ²_{t-1}
      // ε_{t-1} = flowMomentum (proxy for normalised return)
      volVar = 0.10 + 0.15 * (flowMomentum * flowMomentum) + 0.75 * volVar;
      volVar = Math.max(0.5, Math.min(4.0, volVar));
      const volScale = Math.sqrt(volVar);

      // Price move amplitude: regime × stochastic vol (trend → wider, GARCH → clustering)
      const amplitude = (regime === 'trend' ? 1.4 : 1.0) * volScale;
      // DOM signal: tanh curve-in-S — weak imbalances ≈ 0, extremes → ±0.12
      const domSignal    = Math.tanh(domImbalance * 2.5) * 0.12;
      const momentumBias = flowMomentum * 0.10 + domSignal + vwapSignal;
      const move   = (Math.random() - (0.485 - momentumBias)) * tickSize * amplitude;
      let newClose = Math.round((prevClose + move) / tickSize) * tickSize;
      let tickDir  = newClose > prevClose ? 1 : newClose < prevClose ? -1 : 0;
      flowMomentum = momDecay * flowMomentum + (1 - momDecay) * tickDir;

      // Footprint accumulators for this tick
      const levelsMap = new Map<number, SimLevel>();
      last.levels.forEach(lv => levelsMap.set(lv.price, { ...lv }));
      let tickAskVol = 0;
      let tickBidVol = 0;

      const addToLevel = (p: number, avol: number, bvol: number) => {
        const cur = levelsMap.get(p) ?? { price: p, bidVol: 0, askVol: 0 };
        levelsMap.set(p, { price: p, askVol: cur.askVol + avol, bidVol: cur.bidVol + bvol });
        tickAskVol += avol;
        tickBidVol += bvol;
      };

      // Which DOM to read: real Binance (read-only) or simulated (read+write)
      const domBids = hasRealDOMRef.current ? domBidsRef.current : book.bids;
      const domAsks = hasRealDOMRef.current ? domAsksRef.current : book.asks;

      // ── Absorption gate: large DOM wall stalls price + persistent failed breaks ──
      // Repeated failed breaks at the same price accumulate probability (up to 78%).
      // On absorption: extra passive prints accumulate at that level in the footprint.
      if (newClose !== prevClose) {
        const wallPrice = newClose > prevClose
          ? Math.round((prevClose + tickSize) / tickSize) * tickSize
          : Math.round((prevClose - tickSize) / tickSize) * tickSize;
        const wallMap  = newClose > prevClose ? domAsks : domBids;
        const wallQty  = wallMap.get(wallPrice) ?? 0;
        const prevFails = failedBreaks.get(wallPrice) ?? 0;
        if (wallQty > absThresh || prevFails > 0) {
          const baseProb  = wallQty > absThresh
            ? Math.min(0.65, (wallQty - absThresh) / (absThresh * 3))
            : 0;
          const failBonus = Math.min(0.20, prevFails * 0.07); // +7% per prior fail, cap 20%
          if (Math.random() < Math.min(0.78, baseProb + failBonus)) {
            newClose = prevClose;
            tickDir  = 0;
            flowMomentum = momDecay * flowMomentum; // dampen but preserve direction
            failedBreaks.set(wallPrice, prevFails + 1);
            // Passive absorption cluster: visible accumulation in footprint cell
            const absPrinted = Math.max(0.5, wallQty * (0.03 + Math.random() * 0.05));
            const absAskR    = newClose > prevClose ? 0.85 : 0.15;
            addToLevel(wallPrice, absPrinted * absAskR, absPrinted * (1 - absAskR));
          } else {
            failedBreaks.delete(wallPrice); // broke through — zone cleared
          }
        }
      }

      // [3] DOM → Footprint: market orders consume resting limit orders
      //     Hawkes process: excitation scales burst probability (base 4%, +up to 8%)
      if (newClose > prevClose) {
        // ── Aggressive BUY: lifts DOM asks from prevClose+tick to newClose ──
        for (
          let p = Math.round((prevClose + tickSize) / tickSize) * tickSize;
          p <= newClose;
          p = Math.round((p + tickSize) / tickSize) * tickSize
        ) {
          const domQty    = domAsks.get(p) ?? 0;
          const burstProb = 0.04 + excitation * 0.08;       // Hawkes-boosted burst rate
          const isBurst   = Math.random() < burstProb;
          const fillRate  = isBurst ? 0.85 + Math.random() * 0.15 : 0.40 + Math.random() * 0.40;
          let   printed   = domQty > 0 ? Math.max(1, domQty * fillRate) : 0.3 + Math.random() * 1.5;
          if (isBurst) printed *= (2 + Math.random() * 3);  // 2–5× institutional spike
          const pAskR = 0.88 + Math.random() * 0.10;        // 88-98% ask in footprint
          addToLevel(p, printed * pAskR, printed * (1 - pAskR));
          excitation = Math.min(1, excitation + Math.min(printed, 80) * 0.008); // excite Hawkes process
          if (!hasRealDOMRef.current && domQty > 0) {
            const remaining = Math.max(0, Math.round(domQty - printed));
            if (remaining > 0) book.asks.set(p, remaining);
            else               book.asks.delete(p);
            icebergLevels.delete(p);
          }
        }

      } else if (newClose < prevClose) {
        // ── Aggressive SELL: hits DOM bids from prevClose-tick to newClose ──
        for (
          let p = Math.round((prevClose - tickSize) / tickSize) * tickSize;
          p >= newClose;
          p = Math.round((p - tickSize) / tickSize) * tickSize
        ) {
          const domQty    = domBids.get(p) ?? 0;
          const burstProb = 0.04 + excitation * 0.08;
          const isBurst   = Math.random() < burstProb;
          const fillRate  = isBurst ? 0.85 + Math.random() * 0.15 : 0.40 + Math.random() * 0.40;
          let   printed   = domQty > 0 ? Math.max(1, domQty * fillRate) : 0.3 + Math.random() * 1.5;
          if (isBurst) printed *= (2 + Math.random() * 3);
          const pAskR = 0.02 + Math.random() * 0.10;        // 2-12% ask (bid dominant)
          addToLevel(p, printed * pAskR, printed * (1 - pAskR));
          excitation = Math.min(1, excitation + Math.min(printed, 80) * 0.008);
          if (!hasRealDOMRef.current && domQty > 0) {
            const remaining = Math.max(0, Math.round(domQty - printed));
            if (remaining > 0) book.bids.set(p, remaining);
            else               book.bids.delete(p);
            icebergLevels.delete(p);
          }
        }

      } else {
        // ── Flat: passive fills at spread, ratio weighted by DOM depth ────────
        const bidDepth   = domBids.get(newClose - tickSize) ?? 3;
        const askDepth   = domAsks.get(newClose + tickSize) ?? 3;
        const totalDepth = Math.max(bidDepth + askDepth, 1);
        const pVol  = Math.max(0.15, totalDepth * (0.007 + Math.random() * 0.013));
        const pAskR = askDepth / totalDepth;
        addToLevel(newClose, pVol * pAskR, pVol * (1 - pAskR));
        // Minimal top-of-book erosion (real books replenish almost instantly)
        if (!hasRealDOMRef.current) {
          const ba = newClose + tickSize;
          const bb = newClose - tickSize;
          if (book.asks.has(ba)) book.asks.set(ba, Math.max(1, Math.round(book.asks.get(ba)! * (0.997 + Math.random() * 0.003))));
          if (book.bids.has(bb)) book.bids.set(bb, Math.max(1, Math.round(book.bids.get(bb)! * (0.997 + Math.random() * 0.003))));
        }
      }

      // [4] DOM organic evolution (simulated book only)
      if (!hasRealDOMRef.current) {
        perturbCounter++;

        // Structural pruning: enforce bid/ask separation around current price
        // Bids: strictly below price (p < newClose)
        // Asks: strictly above price by at least 1 tick (p > newClose, i.e. p >= newClose+tick)
        book.bids.forEach((_, p) => { if (p >= newClose)         book!.bids.delete(p); });
        book.asks.forEach((_, p) => { if (p <= newClose)         book!.asks.delete(p); });
        // Also prune stale far levels
        book.bids.forEach((_, p) => { if (p < newClose - DEPTH * tickSize * 1.5) book!.bids.delete(p); });
        book.asks.forEach((_, p) => { if (p > newClose + DEPTH * tickSize * 1.5) book!.asks.delete(p); });

        // Replenishment: always ensure top 5 levels exist; deeper levels fill in gradually
        for (let i = 1; i <= DEPTH; i++) {
          const bp   = Math.round((newClose - i * tickSize) / tickSize) * tickSize;
          const ap   = Math.round((newClose + i * tickSize) / tickSize) * tickSize;
          // Near levels refill fast; deep levels refill slowly
          const prob = i <= 5 ? 1.0 : i <= 10 ? 0.70 : i <= 20 ? 0.25 : 0.08;
          if (!book.bids.has(bp) && Math.random() < prob) book.bids.set(bp, levelQty(i, bp));
          if (!book.asks.has(ap) && Math.random() < prob) book.asks.set(ap, levelQty(i, ap));
        }

        // failedBreaks decay: half-life ~8 ticks so old absorption zones fade naturally
        if (perturbCounter % 3 === 0) {
          failedBreaks.forEach((count, price) => {
            const decayed = count * 0.88;
            if (decayed < 0.5) failedBreaks.delete(price);
            else failedBreaks.set(price, decayed);
          });
        }

        // Post-trade DOM clustering: momentum buyers/sellers reinforce the near side
        // Strong buy momentum → bids pile up at best bid (FOMO buyers)
        // Strong sell momentum → asks pile up at best ask (sellers defending)
        if (tickDir !== 0 && Math.abs(flowMomentum) > 0.30) {
          const clusterSide  = tickDir > 0 ? book.bids : book.asks;
          const clusterPrice = tickDir > 0
            ? Math.round((newClose - tickSize) / tickSize) * tickSize
            : Math.round((newClose + tickSize) / tickSize) * tickSize;
          const existing = clusterSide.get(clusterPrice) ?? 0;
          const boost    = Math.round(existing * (0.10 + Math.abs(flowMomentum) * 0.18));
          if (existing > 0 && boost > 0) clusterSide.set(clusterPrice, existing + boost);
        }

        // Directional perturbations: run every 6 ticks (~300ms) so DOM feels stable
        // Real market: deep levels change on order of seconds, near-price on 200-500ms
        if (perturbCounter % 6 === 0) {
          const perturbSide = (map: Map<number, number>, underPressure: boolean) => {
            map.forEach((qty, lp) => {
              const dist = Math.abs(Math.round((lp - newClose) / tickSize));
              // Far levels are very stable (real institutional walls persist minutes)
              if (dist > 20 && Math.random() > 0.04) return;
              if (dist > 10 && Math.random() > 0.12) return;

              const r = Math.random();
              // Cancel/replace (spoof): rare, more frequent on pressured side
              const cancelRate = underPressure
                ? (dist <= 5 ? 0.06 : 0.02)    // pressured: 6% near, 2% far
                : (dist <= 5 ? 0.03 : 0.008);  // relaxed: 3% near, <1% far
              // Iceberg refresh (partial replenishment showing new hidden qty)
              const iceRate = icebergLevels.has(lp) ? 0.12 : 0.015;
              // Tiny drift: qty ±2-6% — real book "breathes" slowly
              const driftRate = dist <= 3 ? 0.25 : 0.08;

              if (r < cancelRate) {
                // Full cancel/replace with new size
                map.set(lp, levelQty(dist, lp));
              } else if (r < cancelRate + iceRate) {
                // Iceberg refresh: partial fill visible, hidden qty restores
                const target = levelQty(dist, lp) * (2 + Math.floor(Math.random() * 3));
                map.set(lp, target);
                if (Math.random() < 0.25) icebergLevels.add(lp);
              } else if (r < cancelRate + iceRate + driftRate) {
                // Smooth drift: tiny change, exponential toward stable level
                const drift = 0.96 + Math.random() * 0.08; // ±4%
                map.set(lp, Math.max(1, Math.round(qty * drift)));
              }
            });
          };
          perturbSide(book.bids, tickDir < 0);
          perturbSide(book.asks, tickDir > 0);
        }

        book.price = newClose;

        // [5] Sync DOM refs — renderer reads every animation frame
        domBidsRef.current = book.bids;
        domAsksRef.current = book.asks;
        simBookRef.current = book;
      }

      // Update session VWAP accumulator
      const tickVol = tickAskVol + tickBidVol;
      if (tickVol > 0) { vwapNum += newClose * tickVol; vwapDen += tickVol; }

      // [6] Update candle
      let poc = last.poc;
      let maxLvlVol = 0;
      levelsMap.forEach(lv => {
        const tv = lv.bidVol + lv.askVol;
        if (tv > maxLvlVol) { maxLvlVol = tv; poc = lv.price; }
      });
      const updated: SimCandle = {
        ...last,
        close   : newClose,
        high    : Math.max(last.high, newClose),
        low     : Math.min(last.low,  newClose),
        totalVol: last.totalVol + tickVol,
        delta   : last.delta + tickAskVol - tickBidVol,
        levels  : Array.from(levelsMap.values()).sort((a, b) => a.price - b.price),
        poc,
      };
      candlesRef.current = [...all.slice(0, -1), updated];
      dirtyRef.current   = true;
    };

    tick();
    const id = setInterval(tick, 50);
    return () => { clearInterval(id); book = null; simBookRef.current = null; };
  }, [tickSize, tfSeconds]);

  // Sync settings to ref for render loop access
  useEffect(() => { settingsRef.current = settings; dirtyRef.current = true; }, [settings]);
  // Sync tfSeconds to ref for render loop access
  useEffect(() => { tfSecondsRef.current = tfSeconds; dirtyRef.current = true; }, [tfSeconds]);

  // Generate simulation data once per symbol/tickSize
  const startPrice = symbol.toUpperCase().startsWith('MNQ') ? 21500
    : symbol.toUpperCase().startsWith('MES') ? 5400
    : 95000;
  const candles = useMemo(() => generateSimCandles(60, startPrice, tickSize, tfSeconds), [symbol, tickSize, tfSeconds]);
  useEffect(() => {
    candlesRef.current = candles;
    const canvas = canvasRef.current;
    if (canvas) {
      const chartW = canvas.clientWidth - PRICE_W;
      const total  = candles.length * stateRef.current.candleW;
      const ox = Math.max(0, total - chartW * 0.95);
      stateRef.current.offsetX  = ox;
      targetRef.current.offsetX = ox;
    }
    dirtyRef.current = true;
  }, [candles]);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      // Use the true devicePixelRatio so the canvas internal buffer matches
      // physical pixels 1:1.  Forcing a minimum of 2 caused the browser to
      // downscale a 2× buffer onto a 1× screen, which introduced blur.
      const dpr  = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      dprRef.current = dpr;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.round(rect.width);
      const cssH = Math.round(rect.height);
      canvas.width  = cssW * dpr;
      canvas.height = cssH * dpr;
      // Do NOT touch canvas.style.width/height — CSS width:100% height:100%
      // controls the layout.  DPR only scales the internal pixel buffer.
      clampOffset(cssW - PRICE_W);
      dirtyRef.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Chrome zoom changes window.devicePixelRatio but doesn't resize the canvas
    // element → ResizeObserver won't fire → we must also listen to window resize.
    const onWindowResize = () => requestAnimationFrame(resize);
    window.addEventListener('resize', onWindowResize);
    resize();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const s   = stateRef.current;
      const t   = targetRef.current;
      const vel = velRef.current;
      let   need = dirtyRef.current;
      dirtyRef.current = false;

      // ── Inertia ──
      if (Math.abs(vel.x) > 0.15) {
        t.offsetX += vel.x;
        vel.x     *= 0.88;
        if (Math.abs(vel.x) <= 0.15) vel.x = 0;
        need = true;
      }

      // ── Lerp state → target (L=0.16 ≈ snappy but smooth) ──
      const L = 0.16;
      const lerp = (a: number, b: number) => a + (b - a) * L;

      const cwD = t.candleW - s.candleW;
      if (Math.abs(cwD) > 0.05)       { s.candleW = lerp(s.candleW, t.candleW); need = true; }
      else if (s.candleW !== t.candleW) { s.candleW = t.candleW; need = true; }

      const oxD = t.offsetX - s.offsetX;
      if (Math.abs(oxD) > 0.1)         { s.offsetX = lerp(s.offsetX, t.offsetX); need = true; }
      else if (s.offsetX !== t.offsetX) { s.offsetX = t.offsetX; need = true; }

      const vzD = t.vZoom - s.vZoom;
      if (Math.abs(vzD) > 0.0005)      { s.vZoom = lerp(s.vZoom, t.vZoom); need = true; }
      else if (s.vZoom !== t.vZoom)    { s.vZoom = t.vZoom; need = true; }

      if (t.priceCenter !== null) {
        if (s.priceCenter === null) {
          s.priceCenter = lastViewRef.current
            ? lastViewRef.current.priceMin + lastViewRef.current.pRange / 2
            : t.priceCenter;
        }
        const pcD = t.priceCenter - s.priceCenter;
        if (Math.abs(pcD) > 0.0001)               { s.priceCenter += pcD * L; need = true; }
        else if (s.priceCenter !== t.priceCenter)  { s.priceCenter = t.priceCenter; need = true; }
      } else if (s.priceCenter !== null) { s.priceCenter = null; need = true; }

      if (need) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = dprRef.current;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          // Disable anti-aliasing for all drawImage calls and pattern fills.
          // Line / text sharpness is governed by coordinate precision, not this.
          ctx.imageSmoothingEnabled = false;
          // Use canvas.width/dpr (exact logical size) — not clientWidth which
          // can differ by 1px due to browser rounding, causing edge clipping.
          renderAll(ctx, canvas.width / dpr, canvas.height / dpr);
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); window.removeEventListener('resize', onWindowResize); };
  }, [tickSize]);

  // ── Clamp ─────────────────────────────────────────────────────────────────
  function clampOffset(chartW: number) {
    const { candleW } = targetRef.current;
    const total = candlesRef.current.length * candleW;
    targetRef.current.offsetX = Math.max(
      -(chartW * 0.15),
      Math.min(total - chartW * 0.85, targetRef.current.offsetX)
    );
  }

  // ── Navigation handlers (all write to targetRef — RAF lerps to it) ─────────

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const t    = targetRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    if (e.shiftKey) {
      // Shift+scroll → vertical zoom anchored to price under cursor
      const factor = e.deltaY > 0 ? 0.78 : 1.28;
      const lv = lastViewRef.current;
      if (lv) {
        const mouseY     = e.clientY - rect.top;
        const mousePrice = lv.priceMin + (1 - (mouseY - lv.chartY) / lv.chartH) * lv.pRange;
        t.priceCenter    = mousePrice;
      }
      t.vZoom = Math.max(1, t.vZoom * factor);
    } else {
      // Plain scroll → horizontal zoom anchored to mouse (no cap)
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const newCW  = Math.max(14, t.candleW * factor);
      const anchor = (mouseX + t.offsetX) / t.candleW;
      t.offsetX    = anchor * newCW - mouseX;
      t.candleW    = newCW;
    }
    dirtyRef.current = true;
  }, []);

  const onMouseDown = useCallback((e: MouseEvent) => {
    velRef.current.x = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    const onPriceScale = e.button === 0 && mouseX >= W - PRICE_W;
    const onTimeAxis   = e.button === 0 && mouseY >= H - TIME_H && mouseX < W - PRICE_W;

    if (onPriceScale) {
      // ── Y-axis drag → vertical zoom ─────────────────────────────────────────
      const lv           = lastViewRef.current;
      const anchorPrice  = lv
        ? lv.priceMin + (1 - (mouseY - lv.chartY) / lv.chartH) * lv.pRange
        : targetRef.current.priceCenter ?? 0;
      axisZoomRef.current = {
        active: true, mode: 'y',
        startX: e.clientX, startY: e.clientY,
        startCandleW: targetRef.current.candleW,
        startOffsetX: targetRef.current.offsetX,
        startVZoom  : targetRef.current.vZoom,
        anchorPrice, anchorPixel: mouseX,
        anchorCandle: (mouseX + targetRef.current.offsetX) / targetRef.current.candleW,
      };
      canvas.style.cursor = 'ns-resize';

    } else if (onTimeAxis) {
      // ── X-axis drag → horizontal zoom ───────────────────────────────────────
      axisZoomRef.current = {
        active: true, mode: 'x',
        startX: e.clientX, startY: e.clientY,
        startCandleW: targetRef.current.candleW,
        startOffsetX: targetRef.current.offsetX,
        startVZoom  : targetRef.current.vZoom,
        anchorPrice : 0, anchorPixel: mouseX,
        anchorCandle: (mouseX + targetRef.current.offsetX) / targetRef.current.candleW,
      };
      canvas.style.cursor = 'ew-resize';

    } else if (e.button === 0) {
      // ── Normal left drag → 2D pan (X + Y) ───────────────────────────────────
      const lv = lastViewRef.current;
      const startCenter = targetRef.current.priceCenter ?? (lv ? lv.priceMin + lv.pRange / 2 : 0);
      dragRef.current     = { active: true, startX: e.clientX, startY: e.clientY, startOff: targetRef.current.offsetX, startCenter, button: 0 };
      velTrackRef.current = [{ t: performance.now(), x: e.clientX }];
      canvas.style.cursor = 'grabbing';

    } else if (e.button === 2) {
      // ── Right drag → vertical pan ────────────────────────────────────────────
      const lv     = lastViewRef.current;
      const center = targetRef.current.priceCenter ?? (lv ? lv.priceMin + lv.pRange / 2 : 0);
      vPanRef.current = { active: true, moved: false, startY: e.clientY, startCenter: center };
      dragRef.current = { ...dragRef.current, button: 2 };
      canvas.style.cursor = 'ns-resize';
    }
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    const rect   = canvas?.getBoundingClientRect();
    if (!rect || !canvas) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    hoverRef.current = { x: mouseX, y: mouseY };

    // ── Axis zoom (price scale drag / time axis drag) ──────────────────────
    const az = axisZoomRef.current;
    if (az.active) {
      if (az.mode === 'y') {
        // Up = zoom in (vZoom ↑), price under cursor stays fixed
        const dy     = az.startY - e.clientY;
        const factor = Math.exp(dy * 0.009);
        targetRef.current.vZoom       = Math.max(1, az.startVZoom * factor);
        targetRef.current.priceCenter = az.anchorPrice;
      } else {
        // Right = zoom in (candleW ↑), candle under cursor stays fixed
        const dx         = az.startX - e.clientX;   // right → negative → factor > 1
        const factor     = Math.exp(-dx * 0.008);
        const newCandleW = Math.max(14, az.startCandleW * factor);
        targetRef.current.candleW = newCandleW;
        targetRef.current.offsetX = az.anchorCandle * newCandleW - az.anchorPixel;
      }
      dirtyRef.current = true;
      return; // skip pan logic
    }

    // ── Left drag → 2D pan (X + Y libre, aucune restriction) ─────────────
    if (dragRef.current.active && dragRef.current.button === 0) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      targetRef.current.offsetX = dragRef.current.startOff - dx;

      // Y: drag up (dy<0) → prices monte, drag down (dy>0) → prix descend
      const lv = lastViewRef.current;
      if (lv) {
        const dprice = (dy / lv.chartH) * lv.pRange;
        targetRef.current.priceCenter = dragRef.current.startCenter + dprice;
      }

      velTrackRef.current.push({ t: performance.now(), x: e.clientX });
      if (velTrackRef.current.length > 8) velTrackRef.current.shift();
    }

    // ── Right drag → vertical pan (fallback / alternative) ────────────────
    if (vPanRef.current.active) {
      const dy = e.clientY - vPanRef.current.startY;
      if (Math.abs(dy) > 3) vPanRef.current.moved = true;
      if (vPanRef.current.moved) {
        const lv = lastViewRef.current;
        if (lv) {
          const dprice = (dy / lv.chartH) * lv.pRange;
          targetRef.current.priceCenter = vPanRef.current.startCenter + dprice;
        }
      }
    }

    // ── Hover cursor — change based on zone ───────────────────────────────
    if (!dragRef.current.active && !vPanRef.current.active) {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (mouseX >= W - PRICE_W)                         canvas.style.cursor = 'ns-resize';
      else if (mouseY >= H - TIME_H && mouseX < W - PRICE_W) canvas.style.cursor = 'ew-resize';
      else                                                canvas.style.cursor = 'crosshair';
    }

    dirtyRef.current = true;
  }, []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    // Stop axis zoom
    if (axisZoomRef.current.active) {
      axisZoomRef.current.active = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
    if (e.button === 0 && dragRef.current.active && dragRef.current.button === 0) {
      // Compute inertia from velocity samples
      const samples = velTrackRef.current;
      if (samples.length >= 2) {
        const last = samples[samples.length - 1];
        const prev = samples[Math.max(0, samples.length - 4)];
        const dt   = last.t - prev.t;
        const dx   = last.x - prev.x;
        if (dt > 0 && dt < 150) {
          const raw = -(dx / dt) * 16; // px/frame @60fps
          velRef.current.x = Math.max(-70, Math.min(70, raw));
        }
      }
      velTrackRef.current  = [];
      dragRef.current.active = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
    if (e.button === 2) {
      vPanRef.current.active = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
    dirtyRef.current = true;
  }, []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    if (vPanRef.current.moved) { vPanRef.current.moved = false; return; }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const onDblClick = useCallback(() => {
    const canvas = canvasRef.current;
    const total  = candlesRef.current.length * 88;
    const chartW = canvas ? canvas.clientWidth - PRICE_W : 0;
    Object.assign(targetRef.current, { candleW: 88, rowH: 13, vZoom: 1, priceCenter: null, offsetX: Math.max(0, total - chartW * 0.95) });
    dirtyRef.current = true;
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const t      = targetRef.current;
      const lv     = lastViewRef.current;
      const chartW = (canvasRef.current?.clientWidth ?? 800) - PRICE_W;
      switch (e.key) {
        case 'ArrowLeft':  t.offsetX -= t.candleW * 5; break;
        case 'ArrowRight': t.offsetX += t.candleW * 5; break;
        case 'ArrowUp': {
          if (lv) { if (t.priceCenter === null) t.priceCenter = lv.priceMin + lv.pRange / 2; t.priceCenter += lv.pRange * 0.10; }
          break;
        }
        case 'ArrowDown': {
          if (lv) { if (t.priceCenter === null) t.priceCenter = lv.priceMin + lv.pRange / 2; t.priceCenter -= lv.pRange * 0.10; }
          break;
        }
        case '=': case '+': {
          const f = 1.20; const a = (chartW / 2 + t.offsetX) / t.candleW;
          t.candleW = Math.max(14, t.candleW * f); t.offsetX = a * t.candleW - chartW / 2; break;
        }
        case '-': case '_': {
          const f = 1 / 1.20; const a = (chartW / 2 + t.offsetX) / t.candleW;
          t.candleW = Math.max(14, t.candleW * f); t.offsetX = a * t.candleW - chartW / 2; break;
        }
        case 'Home': t.offsetX = -(chartW * 0.1); break;
        case 'End': { const tot = candlesRef.current.length * t.candleW; t.offsetX = Math.max(0, tot - chartW * 0.9); break; }
        case 'Escape': case '0': {
          const tot = candlesRef.current.length * 88;
          Object.assign(t, { candleW: 88, rowH: 13, vZoom: 1, priceCenter: null, offsetX: Math.max(0, tot - chartW * 0.95) });
          break;
        }
        default: return;
      }
      e.preventDefault();
      dirtyRef.current = true;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Native event binding ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel',       onWheel,      { passive: false });
    canvas.addEventListener('mousedown',   onMouseDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('dblclick',    onDblClick);
    window.addEventListener('mousemove',   onMouseMove);
    window.addEventListener('mouseup',     onMouseUp);
    return () => {
      canvas.removeEventListener('wheel',       onWheel);
      canvas.removeEventListener('mousedown',   onMouseDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('dblclick',    onDblClick);
      window.removeEventListener('mousemove',   onMouseMove);
      window.removeEventListener('mouseup',     onMouseUp);
    };
  }, [onWheel, onMouseDown, onMouseMove, onMouseUp, onContextMenu, onDblClick]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  function renderAll(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const { candleW, rowH, offsetX } = stateRef.current;
    const candles = candlesRef.current;
    const cfg = settingsRef.current;
    // Apply environment overrides so all sub-functions see the live colors
    C.bg   = cfg.customBg;
    C.grid = cfg.customGrid;
    const scheme    = getSchemeColors(cfg);
    const bidColor  = scheme.bid;
    const askColor  = scheme.ask;
    const pocColor  = scheme.poc;
    const vwapColor = scheme.vwap;
    // wick/border: use custom if set, else fall back to the body color per candle
    const wickOverride   = scheme.wick;
    const borderOverride = scheme.border;

    const chartX      = 0;
    const chartY      = HDR_H;
    const chartW      = W - PRICE_W;
    const cvdH        = cfg.showCVD ? CVD_H : 0;
    const chartH      = H - HDR_H - SESSION_BAR_H - INFO_H - cvdH - TIME_H;
    const sessionBarY = HDR_H + chartH;
    const infoY       = sessionBarY + SESSION_BAR_H;
    const cvdY        = infoY + INFO_H;
    const timeY   = cvdY + cvdH;

    // ── Setup ────────────────────────────────────────────────────────────────
    // Disable image smoothing every frame — setTransform resets it in some
    // browsers, and it must stay off to prevent blur on drawImage / pattern calls.
    ctx.imageSmoothingEnabled = false;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (candles.length === 0) return;

    // ── Visible range ────────────────────────────────────────────────────────
    const firstIdx = Math.max(0, Math.floor(offsetX / candleW));
    const lastIdx  = Math.min(candles.length - 1, Math.ceil((offsetX + chartW) / candleW));
    const visible  = candles.slice(firstIdx, lastIdx + 1);

    if (visible.length === 0) return;

    // ── Price range ───────────────────────────────────────────────────────────
    let priceMin =  Infinity;
    let priceMax = -Infinity;
    visible.forEach(c => { priceMin = Math.min(priceMin, c.low); priceMax = Math.max(priceMax, c.high); });
    const pad = (priceMax - priceMin) * 0.08;
    priceMin -= pad; priceMax += pad;
    // Snap to tick boundaries so cells align exactly with price lines
    priceMin = Math.floor(priceMin / tickSize) * tickSize;
    priceMax = Math.ceil(priceMax  / tickSize) * tickSize;

    // Vertical zoom / pan (priceCenter + vZoom — both independent)
    const { vZoom, priceCenter } = stateRef.current;
    if (priceCenter !== null || vZoom > 1) {
      const center    = priceCenter ?? (priceMin + priceMax) / 2;
      const halfRange = (priceMax - priceMin) / 2 / Math.max(1, vZoom);
      priceMin = center - halfRange;
      priceMax = center + halfRange;
    }

    const pRange = priceMax - priceMin || 1;
    // toY snaps to whole CSS-integer pixels. With DPR≥2 that guarantees
    // every coordinate lands on a physical-pixel boundary → crisp lines.
    const toY = (p: number) => Math.round(chartY + chartH - ((p - priceMin) / pRange) * chartH);

    // Store for onWheel (price-under-cursor computation)
    lastViewRef.current = { priceMin, pRange, chartY, chartH };

    // ── Session aggregation (full day — all candles) ──────────────────────────
    const sessionBid   = new Map<number, number>();
    const sessionAsk   = new Map<number, number>();
    const sessionDelta = new Map<number, number>();
    for (let i = 0; i < candles.length; i++) {
      for (const lv of candles[i].levels) {
        sessionBid.set(lv.price, (sessionBid.get(lv.price) ?? 0) + lv.bidVol);
        sessionAsk.set(lv.price, (sessionAsk.get(lv.price) ?? 0) + lv.askVol);
        sessionDelta.set(lv.price, (sessionDelta.get(lv.price) ?? 0) + (lv.askVol - lv.bidVol));
      }
    }
    let sessionPOC = 0; let maxSessionVol = 0;
    sessionBid.forEach((bid, price) => {
      const total = bid + (sessionAsk.get(price) ?? 0);
      if (total > maxSessionVol) { maxSessionVol = total; sessionPOC = price; }
    });

    // ── Grid lines ────────────────────────────────────────────────────────────
    // px(n) snaps to the nearest half-pixel so 1px strokes land on a physical
    // pixel boundary and stay crisp at every devicePixelRatio.
    const px = (n: number) => Math.round(n) + 0.5;
    const gridStep = Math.ceil(pRange / 8 / tickSize) * tickSize;
    const gridStart = Math.ceil(priceMin / gridStep) * gridStep;
    if (cfg.showGrid) {
      ctx.strokeStyle = C.grid;
      ctx.globalAlpha = cfg.gridOpacity;
      ctx.lineWidth = 1;
      for (let p = gridStart; p <= priceMax; p += gridStep) {
        const y = px(toY(p));
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Clip to chart area ────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chartY, chartW, chartH);
    ctx.clip();

    // ── Global cap for normalization (90th-percentile cell volume across visible candles)
    // Used only as a ceiling — each candle normalises bars against its own max,
    // so low-volume candles are not squeezed flat by one outlier candle.
    const allCellVols: number[] = [];
    visible.forEach(c => c.levels.forEach(l => allCellVols.push(l.bidVol + l.askVol)));
    allCellVols.sort((a, b) => a - b);
    const p90idx = Math.floor(allCellVols.length * 0.90);
    const globalVolCap = Math.max(1, allCellVols[p90idx] ?? 1);   // 90th pct = bar "full width"

    // ── Render each candle ────────────────────────────────────────────────────
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c  = candles[i];
      const cx = Math.round(i * candleW - offsetX);
      const gap = candleW >= 20 ? Math.max(1, Math.round(candleW * 0.025)) : Math.max(2, Math.round(candleW * 0.22));
      const cw  = Math.max(1, Math.round(candleW - gap));  // integer → no sub-pixel blur
      // Layout: [cs: candle] [fpW: footprint]  —  cs=0 when zoomed out
      const cs  = candleW >= 20 ? Math.min(18, Math.max(8, Math.round(cw * 0.17))) : 0;
      const fpX = cx + cs;
      const fpW = cw - cs;  // integer (cw and cs are both integers)
      const isZoomedOut = candleW < 20;

      // Session separator
      if (c.sessionStart) {
        ctx.strokeStyle = C.separator;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(px(cx), chartY);
        ctx.lineTo(px(cx), chartY + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Zoomed-out mode: plain OHLC candle, skip footprint cells ─────────
      if (isZoomedOut) {
        const openY   = toY(c.open);
        const closeY  = toY(c.close);
        const highY   = toY(c.high);
        const lowY    = toY(c.low);
        const isBull  = c.close >= c.open;
        const bodyClr = isBull ? askColor : bidColor;
        const wkClr   = wickOverride   ?? bodyClr;
        const bdClr   = borderOverride ?? bodyClr;
        const wickX   = Math.round(cx + cw / 2);
        const bodyTop = Math.min(openY, closeY);
        const bodyH   = Math.max(1, Math.abs(closeY - openY));
        const bodyW   = cw;

        ctx.fillStyle   = bodyClr;
        ctx.globalAlpha = isBull ? 0.65 : 0.75;
        ctx.fillRect(cx, bodyTop, bodyW, bodyH);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = wkClr;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(wickX, highY);  ctx.lineTo(wickX, bodyTop);
        ctx.moveTo(wickX, bodyTop + bodyH); ctx.lineTo(wickX, lowY);
        ctx.stroke();

        ctx.strokeStyle = bdClr;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(cx, bodyTop, bodyW, bodyH);
        ctx.globalAlpha = 1;
        continue;
      }

      // Per-candle max for bar normalisation — capped at global 90th pct so
      // low-volume candles aren't flat but outlier candles don't dominate.
      let candleMaxVol = 1;
      c.levels.forEach(l => { candleMaxVol = Math.max(candleMaxVol, l.bidVol + l.askVol); });
      const normRef = Math.min(candleMaxVol, globalVolCap);

      // ── Price level cells ─────────────────────────────────────────────────
      for (const lv of c.levels) {
        const y1    = toY(lv.price + tickSize);
        const y2    = toY(lv.price);
        const cellH = y2 - y1 - 1;
        if (cellH < 1) continue;
        if (y1 + cellH < chartY || y1 > chartY + chartH) continue;

        const isPOC          = lv.price === c.poc;
        const isCurrentPrice = lv.price === Math.round(candlesRef.current[candlesRef.current.length - 1]?.close / tickSize) * tickSize;
        const cellTotalVol   = lv.bidVol + lv.askVol;
        const halfW          = Math.floor(fpW / 2);
        const midX           = fpX + halfW;
        const passesVolFilter = cfg.minCellVolPct === 0 || cellTotalVol >= (cfg.minCellVolPct / 100) * candleMaxVol;

        // ── BID bar: left half only — clamped strictly to halfW (never overflows) ──
        // ── ASK bar: right half only — clamped strictly to halfW ──────────────────
        if (cfg.cellMode !== 'numbers' && passesVolFilter) {
          const volShare = cellTotalVol / candleMaxVol;      // 0–1 within this candle
          const barAlpha = Math.min(1, cfg.barOpacity * (0.55 + 0.45 * volShare));

          // Clamp to halfW so bars never cross the centre line into the other half
          const bidBarW = Math.min(halfW, Math.max(1, Math.round((lv.bidVol / normRef) * halfW)));
          ctx.fillStyle   = bidColor;
          ctx.globalAlpha = barAlpha;
          ctx.fillRect(midX - bidBarW, y1, bidBarW, cellH);

          const askBarW = Math.min(halfW, Math.max(1, Math.round((lv.askVol / normRef) * halfW)));
          ctx.fillStyle   = askColor;
          ctx.globalAlpha = barAlpha;
          ctx.fillRect(midX, y1, askBarW, cellH);
          ctx.globalAlpha = 1;
        }

        // ── POC: gold full-width bottom border (2px) ─────────────────────────
        if (isPOC && cfg.showPOC) {
          ctx.fillStyle   = pocColor;
          ctx.globalAlpha = 0.95;
          ctx.fillRect(fpX, y2 - 2, fpW, 2);
          ctx.globalAlpha = 1;
        }

        // ── Current price row: blue border highlight (ATAS active row) ───────
        if (isCurrentPrice) {
          ctx.strokeStyle = '#4a90d9';
          ctx.lineWidth   = 1.5;
          ctx.globalAlpha = 0.90;
          ctx.strokeRect(fpX + 0.5, y1 + 0.5, fpW - 1, Math.max(1, cellH - 1));
          ctx.globalAlpha = 1;
        }

        // ── Row separator ────────────────────────────────────────────────────
        ctx.strokeStyle = C.grid;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(fpX, y2);
        ctx.lineTo(cx + cw, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // ── BID / ASK numbers ────────────────────────────────────────────────
        if (cfg.cellMode !== 'bars' && fpW >= 38 && cellH >= 8) {
          const fs = Math.min(11, Math.max(9, Math.floor(cellH - 2)));
          ctx.font         = `bold ${fs}px ${FONT}`;
          ctx.textBaseline = 'middle';
          const ty         = Math.round(y1 + cellH / 2);
          ctx.globalAlpha  = 1;
          ctx.textAlign    = 'right';
          ctx.fillStyle   = isPOC ? '#ffffff' : bidColor;
          ctx.fillText(fmtVol(lv.bidVol), midX - 3, ty);
          ctx.textAlign   = 'left';
          ctx.fillStyle   = isPOC ? '#ffffff' : askColor;
          ctx.fillText(fmtVol(lv.askVol), midX + 3, ty);
        }
      }

      // ── Imbalance markers — edge bars + diagonal for stacked sequences ───────
      if (cfg.showImbalance && c.levels.length >= 2) {
        const lvMap  = new Map<number, SimLevel>();
        c.levels.forEach(lv => lvMap.set(Math.round(lv.price / tickSize), lv));
        const thresh = cfg.imbalanceThresh;

        // 3px edge bars on cells with diagonal imbalance (ATAS standard)
        c.levels.forEach(lv => {
          const y1    = toY(lv.price + tickSize);
          const y2    = toY(lv.price);
          const cellH = y2 - y1 - 1;
          if (cellH < 3 || y1 + cellH < chartY || y1 > chartY + chartH) return;
          const key   = Math.round(lv.price / tickSize);
          const above = lvMap.get(key + 1);
          const below = lvMap.get(key - 1);
          if (above && above.bidVol > 0 && lv.askVol / above.bidVol >= thresh) {
            ctx.fillStyle = askColor; ctx.globalAlpha = 0.60;
            ctx.fillRect(fpX + fpW - 3, y1, 3, cellH); ctx.globalAlpha = 1;
          }
          if (below && below.askVol > 0 && lv.bidVol / below.askVol >= thresh) {
            ctx.fillStyle = bidColor; ctx.globalAlpha = 0.60;
            ctx.fillRect(fpX, y1, 3, cellH); ctx.globalAlpha = 1;
          }
        });

      }

      // ── OHLC candle — left strip [cx … fpX] ──────────────────────────────────
      if (cs >= 6) {
        const openY   = toY(c.open);
        const closeY  = toY(c.close);
        const highY   = toY(c.high);
        const lowY    = toY(c.low);
        const isBull  = c.close >= c.open;
        const bodyClr = isBull ? askColor : bidColor;
        const wkClr   = wickOverride   ?? bodyClr;
        const bdClr   = borderOverride ?? bodyClr;
        const wickX   = Math.round(cx + cs / 2);
        const bodyTop = Math.min(openY, closeY);
        const bodyH   = Math.max(1, Math.abs(closeY - openY));
        const bodyW   = Math.max(3, cs - 4);
        const bodyL   = Math.round(cx + 2);

        // Body fill
        ctx.fillStyle   = bodyClr;
        ctx.globalAlpha = isBull ? 0.65 : 0.75;
        ctx.fillRect(bodyL, bodyTop, bodyW, bodyH);
        ctx.globalAlpha = 1;

        // Wicks
        ctx.strokeStyle = wkClr;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(wickX, highY);  ctx.lineTo(wickX, bodyTop);
        ctx.moveTo(wickX, bodyTop + bodyH); ctx.lineTo(wickX, lowY);
        ctx.stroke();

        // Body border
        ctx.strokeStyle = bdClr;
        ctx.lineWidth   = 1;
        ctx.strokeRect(bodyL, bodyTop, bodyW, bodyH);

        // Subtle separator between candle strip and footprint
        ctx.strokeStyle = 'rgba(30,45,74,0.8)';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(fpX, chartY);
        ctx.lineTo(fpX, chartY + chartH);
        ctx.stroke();
      }

      // Delta + volume callout above candle
      if (cfg.showDeltaCallout && cw >= 38) {
        const highY  = toY(c.high);
        const labelY = Math.max(chartY + 22, highY - 6);
        ctx.textAlign = 'center';
        ctx.font      = `bold 9px ${FONT}`;
        ctx.fillStyle = c.delta >= 0 ? C.deltaPos : C.deltaNeg;
        ctx.fillText((c.delta >= 0 ? '+' : '') + fmtVol(c.delta), cx + cw * 0.5, labelY);
        ctx.font      = `7px ${FONT}`;
        ctx.fillStyle = C.textMuted;
        ctx.fillText(fmtVol(c.totalVol), cx + cw * 0.5, labelY + 10);
      }

      // Candle separator (footprint mode only, faint)
      if (!isZoomedOut) {
        ctx.strokeStyle = C.grid;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        const sepX = Math.round(cx + candleW - 1);
        ctx.moveTo(sepX, chartY);
        ctx.lineTo(sepX, chartY + chartH);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Dezoom threshold: below 20px/candle use clean OHLC view (no profile overlays)
    const globalIsZoomedOut = candleW < 20;

    // ── Session delta profile bars (left side of price scale) ────────────────
    if (cfg.showDeltaBars && !globalIsZoomedOut) {
      renderSessionDeltaProfile(ctx, chartW, chartH, chartY, sessionDelta, priceMin, pRange, tickSize, toY, bidColor, askColor);
    }

    // ── Volume profile overlay (left-anchored) ────────────────────────────────
    if (cfg.showVolProfile && !globalIsZoomedOut) {
      renderVolumeProfileOverlay(ctx, chartW, chartH, chartY, sessionBid, sessionAsk, sessionPOC, priceMin, pRange, tickSize, toY, pocColor);
    }

    // ── DOM overlay (right-anchored, same clip) ───────────────────────────────
    if (cfg.showDOMOverlay) {
      // Pre-filter before render: build clean Maps guaranteed to respect price boundary.
      // This is the definitive guard — no ask can be at or below current price.
      const domCp   = Math.round((candles[candles.length - 1]?.close ?? 0) / tickSize) * tickSize;
      const safeBids = new Map<number, number>();
      const safeAsks = new Map<number, number>();
      domBidsRef.current.forEach((qty, p) => { if (p <  domCp) safeBids.set(p, qty); });
      domAsksRef.current.forEach((qty, p) => { if (p >  domCp) safeAsks.set(p, qty); });
      renderDOMOverlay(ctx, chartW, chartH, chartY, priceMin, pRange, tickSize, toY, bidColor, askColor, safeBids, safeAsks, domCp);
    }

    ctx.restore(); // end chart clip

    // ── VWAP ─────────────────────────────────────────────────────────────────
    if (cfg.showVWAP) {
      renderVWAP(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartY, chartH, priceMin, pRange, chartW, vwapColor);
    }

    // ── Session High / Low dashed lines ──────────────────────────────────────
    if (cfg.showHighLow) {
      let sHigh = -Infinity, sLow = Infinity;
      for (let i = firstIdx; i <= lastIdx; i++) {
        sHigh = Math.max(sHigh, candles[i].high);
        sLow  = Math.min(sLow,  candles[i].low);
      }
      ctx.save();
      ctx.strokeStyle = cfg.customHighLow;
      ctx.lineWidth   = 1;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.75;
      [sHigh, sLow].forEach(p => {
        const py = px(toY(p));
        if (py >= chartY && py <= chartY + chartH) {
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(W - PRICE_W, py);
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Session Open line ─────────────────────────────────────────────────────
    if (cfg.showSessionOpen && candles.length > 0) {
      const soY = px(toY(candles[firstIdx].open));
      if (soY >= chartY && soY <= chartY + chartH) {
        ctx.save();
        ctx.strokeStyle = cfg.customSessionOpen;
        ctx.lineWidth   = 1;
        ctx.setLineDash([8, 4]);
        ctx.globalAlpha = 0.70;
        ctx.beginPath();
        ctx.moveTo(0, soY);
        ctx.lineTo(W - PRICE_W, soY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Session summary bar (between chart and info strip) ───────────────────
    renderSessionBar(ctx, candles, chartW, sessionBarY, SESSION_BAR_H, bidColor, askColor);

    // ── Ask / Bid / Delta / Volume info strip ────────────────────────────────
    renderInfoStrip(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartW, infoY, INFO_H, bidColor, askColor);

    // ── CVD panel ────────────────────────────────────────────────────────────
    if (cfg.showCVD) renderCVD(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartW, cvdY, CVD_H);

    // ── Time axis ────────────────────────────────────────────────────────────
    renderTimeAxis(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartW, timeY);


    // ── Price scale ───────────────────────────────────────────────────────────
    // ── Current price line ────────────────────────────────────────────────────
    const lastClose = candles[candles.length - 1].close;
    const lastY     = px(toY(lastClose));
    if (lastY >= chartY && lastY <= chartY + chartH) {
      const isBull  = candles[candles.length - 1].close >= candles[candles.length - 1].open;
      const lineClr = isBull ? askColor : bidColor;
      ctx.strokeStyle = lineClr;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(W - PRICE_W, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // Price tag on scale
      const tagH = 16;
      ctx.fillStyle = lineClr;
      ctx.globalAlpha = 0.90;
      ctx.fillRect(W - PRICE_W + 1, Math.round(lastY - tagH / 2), PRICE_W - 2, tagH);
      ctx.globalAlpha = 1;
      ctx.font      = `bold 9px ${FONT}`;
      ctx.fillStyle  = '#ffffff';
      ctx.textAlign  = 'center';
      ctx.fillText(fmtPrice(lastClose, tickSize), W - PRICE_W + PRICE_W / 2, lastY + 3);
    }

    renderPriceScale(ctx, W, chartY, chartH, gridStart, gridStep, priceMax, toY, tickSize, priceMin, pRange);

    // ── Header ────────────────────────────────────────────────────────────────
    renderHeader(ctx, W, symbol, visible, TF_LABEL[tfSecondsRef.current] ?? '?');

    // ── Crosshair ─────────────────────────────────────────────────────────────
    renderCrosshair(ctx, W, H, chartX, chartW, chartY, chartH, priceMin, pRange, toY, tickSize, timeY);
  }

  // ─── VWAP ────────────────────────────────────────────────────────────────────

  function renderVWAP(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartY: number, chartH: number,
    priceMin: number, pRange: number,
    chartW: number,
    vwapClr: string,
  ) {
    let cumVol = 0, cumVwap = 0;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= lastIdx; i++) {
      const c = candles[i];
      if (c.sessionStart && i > 0) { cumVol = 0; cumVwap = 0; }
      const typical = (c.high + c.low + c.close) / 3;
      cumVol  += c.totalVol;
      cumVwap += typical * c.totalVol;
      if (i < firstIdx) continue;
      const vwap = cumVwap / (cumVol || 1);
      const x = i * candleW - offsetX + candleW * 0.5;
      const y = chartY + chartH - ((vwap - priceMin) / pRange) * chartH;
      if (x >= 0 && x <= chartW) pts.push({ x, y });
    }

    if (pts.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chartY, chartW, chartH);
    ctx.clip();

    ctx.strokeStyle = vwapClr;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Store for crosshair hover detection
    vwapPtsRef.current = pts;
  }

  // ─── DOM Overlay — integrated into chart, right-anchored like volume profile ──
  // Rendered inside the chart clip. Bars grow leftward from the right edge.
  // Uses toY() so levels align perfectly with the price scale.

  function renderDOMOverlay(
    ctx: CanvasRenderingContext2D,
    chartW: number, chartH: number, chartY: number,
    priceMin: number, pRange: number, tick: number,
    toY: (p: number) => number,
    bidClr: string, askClr: string,
    domBids: Map<number, number>,
    domAsks: Map<number, number>,
    currentPrice: number,
  ) {
    if (domBids.size === 0 && domAsks.size === 0) return;

    const barMaxW = Math.min(chartW * 0.28, 200);
    const domLeft = chartW - barMaxW;
    const cpSnap  = currentPrice;   // already snapped and pre-filtered by caller

    // Sort nearest-first (caller guarantees correct side already)
    const bidEntries = Array.from(domBids.entries()).sort(([a], [b]) => b - a);  // desc
    const askEntries = Array.from(domAsks.entries()).sort(([a], [b]) => a - b);  // asc

    // Separate max per side
    let maxBidQty = 1, maxAskQty = 1;
    bidEntries.forEach(([, q]) => { maxBidQty = Math.max(maxBidQty, q); });
    askEntries.forEach(([, q]) => { maxAskQty = Math.max(maxAskQty, q); });

    // ── Clip ALL DOM drawing strictly to the DOM panel ────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(domLeft, chartY, barMaxW, chartH);
    ctx.clip();

    // Subtle dark background
    ctx.fillStyle   = '#000000';
    ctx.globalAlpha = 0.20;
    ctx.fillRect(domLeft, chartY, barMaxW, chartH);
    ctx.globalAlpha = 1;

    const fmtQty = (q: number) => q >= 1000 ? `${(q / 1000).toFixed(1)}k` : `${Math.round(q)}`;

    const cpY = toY(cpSnap);   // pixel position of current price line

    const drawSide = (
      entries: [number, number][], clr: string, nearClr: string, maxQty: number,
      side: 'bid' | 'ask',
    ) => {
      entries.forEach(([price, qty], rank) => {
        const y1 = toY(price + tick);
        const y2 = toY(price);
        // Pixel-level guard: bids must be entirely BELOW cpY, asks entirely ABOVE
        // (y increases downward, so bids have y1 >= cpY, asks have y2 <= cpY)
        if (side === 'bid' && y1 < cpY) return;
        if (side === 'ask' && y2 > cpY) return;
        if (y2 < chartY || y1 > chartY + chartH) return;
        const barH   = Math.max(1, y2 - y1 - 1);
        const ratio  = Math.min(1, qty / maxQty);    // clamped — no overflow
        const barW   = Math.min(barMaxW, Math.max(3, Math.round(ratio * barMaxW)));
        const isNear = rank < 2;

        // Opacity: 100% for all levels
        const distFade = 1;
        const alpha    = 1.0;

        ctx.fillStyle   = isNear ? nearClr : clr;
        ctx.globalAlpha = alpha;
        ctx.fillRect(chartW - barW, y1, barW, barH);

        // Bright border on best 2 levels
        if (isNear) {
          ctx.strokeStyle = nearClr;
          ctx.lineWidth   = 1.5;
          ctx.globalAlpha = 1;
          ctx.strokeRect(chartW - barW + 0.5, y1 + 0.5, barW - 1, Math.max(1, barH - 1));
        }

        // Qty label — only if bar is tall and wide enough to be legible
        if (barH >= 7 && barW > 24) {
          ctx.fillStyle    = '#ffffff';
          ctx.globalAlpha  = 1.0;
          ctx.font         = `${isNear ? 'bold ' : ''}${Math.min(10, barH - 1)}px ${FONT}`;
          ctx.textAlign    = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(fmtQty(qty), chartW - 4, y1 + barH / 2);
        }
        ctx.globalAlpha = 1;
      });
    };

    drawSide(bidEntries, bidClr, '#ff8a87', maxBidQty, 'bid');   // bids: red, strictly below price
    drawSide(askEntries, askClr, '#4ddecf', maxAskQty, 'ask');  // asks: teal, strictly above price

    // ── Current price divider line ─────────────────────────────────────────────
    if (cpY >= chartY && cpY <= chartY + chartH) {
      ctx.strokeStyle = 'rgba(200,215,255,0.55)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(domLeft, cpY);
      ctx.lineTo(chartW, cpY);
      ctx.stroke();

      // Best ask qty label just above divider
      if (askEntries[0]) {
        ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#4ddecf'; ctx.globalAlpha = 0.95;
        ctx.fillText(`A ${fmtQty(askEntries[0][1])}`, chartW - 4, cpY - 2);
      }
      // Best bid qty label just below divider
      if (bidEntries[0]) {
        ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#ff8a87'; ctx.globalAlpha = 0.95;
        ctx.fillText(`B ${fmtQty(bidEntries[0][1])}`, chartW - 4, cpY + 2);
      }
    }

    // Thin left-edge separator line of DOM panel
    ctx.strokeStyle = 'rgba(90,110,160,0.40)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(domLeft + 0.5, chartY); ctx.lineTo(domLeft + 0.5, chartY + chartH); ctx.stroke();

    // "DOM" label
    ctx.font = `bold 7px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(160,185,220,0.55)'; ctx.globalAlpha = 1;
    ctx.fillText('DOM', chartW - 4, chartY + 3);

    ctx.restore();  // end DOM clip
    ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ─── Session delta profile (right-anchored, inside chart clip) ─────────────
  // Green bars = positive session delta (ask dominated), red = bid dominated.

  function renderSessionDeltaProfile(
    ctx: CanvasRenderingContext2D,
    chartW: number, chartH: number, chartY: number,
    deltaMap: Map<number, number>,
    priceMin: number, pRange: number, tick: number,
    toY: (p: number) => number,
    bidClr: string, askClr: string,
  ) {
    if (deltaMap.size === 0) return;

    let maxAbsDelta = 1;
    deltaMap.forEach(d => { maxAbsDelta = Math.max(maxAbsDelta, Math.abs(d)); });

    const barMaxW  = Math.min(chartW * 0.14, 70);

    // Label
    ctx.font      = `bold 7px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(100,150,220,0.45)';
    ctx.fillText('Δ', chartW - 3, chartY + 9);

    deltaMap.forEach((delta, price) => {
      // Use integer cell boundaries (same formula as footprint cells)
      const y1 = toY(price + tick);
      const y2 = toY(price);
      if (y2 < chartY || y1 > chartY + chartH) return;
      const barH  = Math.max(1, y2 - y1 - 1);
      const ratio = Math.abs(delta) / maxAbsDelta;
      const barW  = Math.max(2, Math.round(ratio * barMaxW));
      ctx.fillStyle   = delta >= 0 ? askClr : bidClr;
      ctx.globalAlpha = 0.22 + ratio * 0.42;
      ctx.fillRect(chartW - barW, y1, barW, barH);
      ctx.globalAlpha = 1;
    });
  }

  // ─── Volume profile overlay (integrated into chart area) ────────────────────
  // Called inside the chart clip — bars anchored at right edge, semi-transparent.

  function renderVolumeProfileOverlay(
    ctx: CanvasRenderingContext2D,
    chartW: number, chartH: number, chartY: number,
    bid: Map<number, number>, ask: Map<number, number>,
    poc: number,
    priceMin: number, pRange: number, tick: number,
    toY: (p: number) => number,
    pocClr: string,
  ) {
    if (bid.size === 0) return;

    // Total volume per level + value area computation
    const totalVol = new Map<number, number>();
    let sessionTotal = 0;
    bid.forEach((bvol, price) => {
      const t = bvol + (ask.get(price) ?? 0);
      totalVol.set(price, t);
      sessionTotal += t;
    });
    let maxVol = 1;
    totalVol.forEach(v => { maxVol = Math.max(maxVol, v); });

    const sorted = Array.from(totalVol.entries()).sort((a, b) => b[1] - a[1]);
    let vaVol = 0; let vaH = poc; let vaL = poc;
    const va70 = sessionTotal * 0.70;
    for (const [price, vol] of sorted) {
      vaVol += vol; vaH = Math.max(vaH, price); vaL = Math.min(vaL, price);
      if (vaVol >= va70) break;
    }

    const barMaxW = Math.min(chartW * 0.22, 120); // max 22% of chart width

    // VAH / VAL full-width solid lines
    ctx.strokeStyle = 'rgba(100,150,220,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, toY(vaH)); ctx.lineTo(chartW, toY(vaH));
    ctx.moveTo(0, toY(vaL)); ctx.lineTo(chartW, toY(vaL));
    ctx.stroke();

    // VPOC full-width solid line — prominent gold with label
    const pocY = toY(poc);
    if (pocY >= chartY && pocY <= chartY + chartH) {
      ctx.strokeStyle = pocClr;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(0, pocY); ctx.lineTo(chartW, pocY);
      ctx.stroke();
      ctx.font         = `bold 8px ${FONT}`;
      ctx.textAlign    = 'left';
      ctx.fillStyle    = pocClr;
      ctx.globalAlpha  = 0.85;
      ctx.fillText('POC', barMaxW + 3, pocY - 2);
      ctx.globalAlpha = 1;
    }

    // Volume bars — left-anchored, integer cell boundaries (same as footprint cells)
    totalVol.forEach((vol, price) => {
      const y1 = toY(price + tick);
      const y2 = toY(price);
      if (y2 < chartY || y1 > chartY + chartH) return;
      const barH = Math.max(1, y2 - y1 - 1);
      const isPOC = price === poc;
      const isVA  = price >= vaL && price <= vaH;
      const barW  = Math.max(2, (vol / maxVol) * barMaxW);

      ctx.globalAlpha = isPOC ? 0.70 : isVA ? 0.38 : 0.22;
      ctx.fillStyle   = isPOC ? pocClr : isVA ? '#4a7abf' : '#2a4870';
      ctx.fillRect(0, y1, barW, barH);
      ctx.globalAlpha = 1;
    });

    // VAH / VAL labels (left edge)
    ctx.font      = `bold 7px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(100,150,220,0.55)';
    const vahY = toY(vaH); const valY = toY(vaL);
    if (vahY > chartY + 10)          ctx.fillText('VAH', barMaxW + 3, vahY - 2);
    if (valY < chartY + chartH - 4)  ctx.fillText('VAL', barMaxW + 3, valY + 8);
  }

  // ─── Price scale ─────────────────────────────────────────────────────────────

  function renderPriceScale(
    ctx: CanvasRenderingContext2D,
    W: number, chartY: number, chartH: number,
    gridStart: number, gridStep: number, priceMax: number,
    toY: (p: number) => number, tick: number,
    priceMin: number, pRange: number,
  ) {
    const scaleX  = W - PRICE_W;

    // Background
    ctx.fillStyle = C.surface;
    ctx.fillRect(scaleX, chartY - 2, PRICE_W, chartH + 4);

    // Left border
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(scaleX) + 0.5, chartY);
    ctx.lineTo(Math.round(scaleX) + 0.5, chartY + chartH);
    ctx.stroke();

    // ── Price labels ──────────────────────────────────────────────────────────
    ctx.font      = `9px ${FONT}`;
    ctx.textAlign  = 'left';
    for (let p = gridStart; p <= priceMax; p += gridStep) {
      const y = Math.round(toY(p)) + 0.5;
      if (y < chartY || y > chartY + chartH) continue;
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(scaleX, y);
      ctx.lineTo(scaleX + 4, y);
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.fillText(fmtPrice(p, tick), scaleX + 7, y + 3);
    }
  }

  // ─── Session summary bar ─────────────────────────────────────────────────────
  // Horizontal bar between footprint and info strip: "Bid XXK | Ask XXK | Total YYK Lots"
  // Red section = bid proportion, green = ask proportion, gray dividers.

  function renderSessionBar(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    chartW: number,
    y: number,
    h: number,
    bidClr: string,
    askClr: string,
  ) {
    // Aggregate full session totals
    let totalBid = 0, totalAsk = 0;
    for (const c of candles) {
      for (const lv of c.levels) {
        totalBid += lv.bidVol;
        totalAsk += lv.askVol;
      }
    }
    const totalVol = totalBid + totalAsk;
    if (totalVol === 0) return;

    // Background
    ctx.fillStyle   = '#181b22';
    ctx.globalAlpha = 1;
    ctx.fillRect(0, y, chartW, h);

    // Top separator line
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.60;
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(chartW, y + 0.5); ctx.stroke();
    ctx.globalAlpha = 1;

    // Proportional colored sections (bid=red left, ask=green right)
    const bidFrac = totalBid / totalVol;
    const bidW    = Math.round(chartW * bidFrac);
    const askW    = chartW - bidW;

    ctx.fillStyle   = bidClr;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, y + 1, bidW, h - 1);

    ctx.fillStyle   = askClr;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(bidW, y + 1, askW, h - 1);
    ctx.globalAlpha = 1;

    // Text: "Bid 1.2K | Ask 1.5K | Total 2.7K Lots"
    const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${Math.round(v)}`;
    const label = `Bid ${fmtK(totalBid)}  |  Ask ${fmtK(totalAsk)}  |  Total ${fmtK(totalVol)} Lots`;

    ctx.font         = `bold 9px ${FONT}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Shadow for readability
    ctx.fillStyle   = '#000000';
    ctx.globalAlpha = 0.50;
    ctx.fillText(label, chartW / 2 + 1, y + h / 2 + 1);

    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#c8d8e8';
    ctx.fillText(label, chartW / 2, y + h / 2);

    // Bottom separator
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.40;
    ctx.beginPath(); ctx.moveTo(0, y + h - 0.5); ctx.lineTo(chartW, y + h - 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ─── CVD panel ───────────────────────────────────────────────────────────────

  // ─── Ask / Bid / Delta / Volume info strip (ATAS bottom table) ──────────────
  // One column per visible candle, 4 rows: Ask, Bid, Delta, Volume.

  function renderInfoStrip(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartW: number, stripY: number, stripH: number,
    bidClr: string, askClr: string,
  ) {
    const rowH    = Math.floor(stripH / 4);
    const LABEL_W = 36; // fixed left column for row labels

    // Pre-compute per-row max values for relative intensity scaling
    let maxAsk = 1, maxBid = 1, maxAbsDelta = 1, maxVol = 1;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      const ask = c.levels.reduce((s, l) => s + l.askVol, 0);
      const bid = c.levels.reduce((s, l) => s + l.bidVol, 0);
      maxAsk      = Math.max(maxAsk, ask);
      maxBid      = Math.max(maxBid, bid);
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(c.delta));
      maxVol      = Math.max(maxVol, c.totalVol);
    }

    // Full-width base row backgrounds (very dark tint)
    const rowBases = ['#0d2018', '#1e0c0c', '#0d1020', '#080e18'];
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = rowBases[r];
      ctx.fillRect(0, stripY + r * rowH, chartW, rowH);
    }

    // Top border
    ctx.strokeStyle = '#404858';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, stripY); ctx.lineTo(chartW, stripY); ctx.stroke();

    // Row labels (left fixed column)
    const labels = ['Ask', 'Bid', 'Delta', 'Volume'];
    const labelClrs = [askClr, bidClr, '#8899bb', '#5588cc'];
    ctx.font      = `bold 8px ${FONT}`;
    ctx.textAlign = 'left';
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = labelClrs[r];
      ctx.globalAlpha = 0.70;
      ctx.fillText(labels[r], 4, stripY + r * rowH + rowH * 0.5 + 3);
      ctx.globalAlpha = 1;
    }

    // Per-candle colored cells
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'center';
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c   = candles[i];
      const cx  = i * candleW - offsetX;
      const cw  = Math.max(1, Math.round(candleW));
      if (cx + cw < 0 || cx > chartW) continue;
      const isLast  = i === candles.length - 1;
      const cellX   = Math.round(cx);
      const centerX = Math.round(cx + cw * 0.5);

      const askVal   = c.levels.reduce((s, l) => s + l.askVol, 0);
      const bidVal   = c.levels.reduce((s, l) => s + l.bidVol, 0);
      const deltaVal = c.delta;
      const volVal   = c.totalVol;

      // Row 0 — Ask: green intensity fill
      const askIntensity = askVal / maxAsk;
      ctx.fillStyle   = askClr;
      ctx.globalAlpha = 0.15 + askIntensity * 0.50;
      ctx.fillRect(cellX, stripY, cw, rowH);

      // Row 1 — Bid: red intensity fill
      const bidIntensity = bidVal / maxBid;
      ctx.fillStyle   = bidClr;
      ctx.globalAlpha = 0.15 + bidIntensity * 0.50;
      ctx.fillRect(cellX, stripY + rowH, cw, rowH);

      // Row 2 — Delta: green if positive, red if negative, intensity by magnitude
      const deltaIntensity = Math.abs(deltaVal) / maxAbsDelta;
      ctx.fillStyle   = deltaVal >= 0 ? askClr : bidClr;
      ctx.globalAlpha = 0.12 + deltaIntensity * 0.55;
      ctx.fillRect(cellX, stripY + rowH * 2, cw, rowH);

      // Row 3 — Volume: blue intensity fill
      const volIntensity = volVal / maxVol;
      ctx.fillStyle   = '#3d6bb0';
      ctx.globalAlpha = 0.15 + volIntensity * 0.55;
      ctx.fillRect(cellX, stripY + rowH * 3, cw, rowH);

      // Highlight current (last) candle column with brighter fill
      if (isLast) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.06;
        ctx.fillRect(cellX, stripY, cw, stripH);
      }
      ctx.globalAlpha = 1;

      // Text values
      const vals   = [askVal, bidVal, deltaVal, volVal];
      const txtClr = ['#ffffff', '#ffffff', deltaVal >= 0 ? askClr : bidClr, '#88aadd'];
      for (let r = 0; r < 4; r++) {
        ctx.fillStyle   = txtClr[r];
        ctx.globalAlpha = 0.92;
        ctx.fillText(fmtVol(vals[r]), centerX, stripY + r * rowH + rowH * 0.5 + 3);
      }
      ctx.globalAlpha = 1;

      // Column separator
      if (i < lastIdx) {
        const sepX = Math.round(cx + cw) + 0.5;
        ctx.strokeStyle = '#303848';
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(sepX, stripY); ctx.lineTo(sepX, stripY + stripH); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function renderCVD(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartW: number, cvdY: number, cvdH: number,
  ) {
    // Background + top border
    ctx.fillStyle = C.cvdBg;
    ctx.fillRect(0, cvdY, chartW, cvdH);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cvdY); ctx.lineTo(chartW, cvdY); ctx.stroke();

    // Build per-candle cumulative delta OHLC:
    //   open  = cumDelta at start of candle (= prev close)
    //   close = cumDelta at end of candle
    //   high  = max(open, close) + wick approx (use candle delta range)
    //   low   = min(open, close) - wick approx
    let cumDelta = 0;
    interface CVDBar { x: number; open: number; close: number; high: number; low: number; }
    const bars: CVDBar[] = [];

    for (let i = 0; i <= lastIdx; i++) {
      const c = candles[i];
      if (c.sessionStart && i > 0) cumDelta = 0;
      const barOpen  = cumDelta;
      const barClose = cumDelta + c.delta;
      // Intra-bar range: approximate with ±15% of candle delta for wick depth
      const swing    = Math.abs(c.delta) * 0.15;
      cumDelta = barClose;
      if (i < firstIdx) continue;
      const x = i * candleW - offsetX;
      if (x + candleW < 0 || x > chartW) continue;
      bars.push({
        x,
        open : barOpen,
        close: barClose,
        high : Math.max(barOpen, barClose) + swing,
        low  : Math.min(barOpen, barClose) - swing,
      });
    }
    if (bars.length === 0) { renderCVDLabel(ctx, 0, cvdY, cvdH); return; }

    let minV = Infinity, maxV = -Infinity;
    bars.forEach(b => { minV = Math.min(minV, b.low); maxV = Math.max(maxV, b.high); });
    // Ensure zero is always visible in range
    minV = Math.min(minV, 0); maxV = Math.max(maxV, 0);
    const vRange = maxV - minV || 1;
    const pad    = 5;
    const drawH  = cvdH - pad * 2;
    const toVY   = (v: number) => Math.round(cvdY + pad + drawH - ((v - minV) / vRange) * drawH);

    // Zero line
    const zeroY = toVY(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(chartW, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, cvdY, chartW, cvdH); ctx.clip();

    const gap  = Math.max(1, Math.round(candleW * 0.12));
    const barW = Math.max(2, Math.round(candleW - gap));

    for (const b of bars) {
      const isBull   = b.close >= b.open;
      const bodyTop  = Math.min(toVY(b.open), toVY(b.close));
      const bodyBot  = Math.max(toVY(b.open), toVY(b.close));
      const bodyH    = Math.max(1, bodyBot - bodyTop);
      const wickX    = Math.round(b.x + barW / 2);
      const highY    = toVY(b.high);
      const lowY     = toVY(b.low);

      // Body fill: white for bullish delta, dark gray for bearish
      ctx.fillStyle   = isBull ? '#d4d4d4' : '#3a3a3a';
      ctx.globalAlpha = 0.92;
      ctx.fillRect(b.x, bodyTop, barW, bodyH);

      // Body border
      ctx.strokeStyle = isBull ? '#e8e8e8' : '#666666';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.80;
      ctx.strokeRect(b.x + 0.5, bodyTop + 0.5, barW - 1, Math.max(0, bodyH - 1));

      // Wicks
      ctx.strokeStyle = isBull ? '#c0c0c0' : '#555555';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.70;
      ctx.beginPath();
      ctx.moveTo(wickX, highY); ctx.lineTo(wickX, bodyTop);
      ctx.moveTo(wickX, bodyBot); ctx.lineTo(wickX, lowY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    renderCVDLabel(ctx, bars[bars.length - 1].close, cvdY, cvdH);
  }

  function renderCVDLabel(ctx: CanvasRenderingContext2D, lastVal: number, cvdY: number, cvdH: number) {
    ctx.font      = `bold 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle  = 'rgba(255,255,255,0.25)';
    ctx.fillText('CVD', 6, cvdY + 11);
    ctx.fillStyle  = lastVal >= 0 ? C.ask : C.bid;
    ctx.fillText(fmtVol(lastVal), 32, cvdY + 11);
  }

  // ─── Time axis ───────────────────────────────────────────────────────────────

  function renderTimeAxis(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartW: number, timeY: number,
  ) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, timeY, chartW, TIME_H);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, timeY);
    ctx.lineTo(chartW, timeY);
    ctx.stroke();

    const minSpacing = 80;
    const step = Math.max(1, Math.ceil(minSpacing / candleW));

    ctx.font      = `8px ${FONT}`;
    ctx.fillStyle  = C.text;
    ctx.textAlign  = 'center';

    for (let i = firstIdx; i <= lastIdx; i += step) {
      const x = i * candleW - offsetX + candleW * 0.5;
      if (x < 20 || x > chartW - 10) continue;
      ctx.fillText(fmtTime(candles[i].time), x, timeY + 14);
    }
  }

  // ─── Header ───────────────────────────────────────────────────────────────────

  function renderHeader(
    ctx: CanvasRenderingContext2D,
    W: number, sym: string, visible: SimCandle[], tfLabel: string,
  ) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, HDR_H);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HDR_H);
    ctx.lineTo(W, HDR_H);
    ctx.stroke();

    // Symbol
    ctx.font      = `bold 11px ${FONT}`;
    ctx.fillStyle  = C.price;
    ctx.textAlign  = 'left';
    ctx.fillText(sym.toUpperCase(), 10, 19);

    // Timeframe badge
    ctx.font      = `8px ${FONT}`;
    ctx.fillStyle  = '#2a3a5a';
    ctx.fillText(`${tfLabel}  LIVE`, 92, 19);

    // Last candle stats
    if (visible.length > 0) {
      const last = visible[visible.length - 1];
      const stats = [
        { label: 'O', val: fmtPrice(last.open,  tickSize), color: C.text },
        { label: 'H', val: fmtPrice(last.high,  tickSize), color: C.ask },
        { label: 'L', val: fmtPrice(last.low,   tickSize), color: C.bid },
        { label: 'C', val: fmtPrice(last.close, tickSize), color: last.close >= last.open ? C.ask : C.bid },
        { label: 'VOL', val: fmtVol(last.totalVol), color: C.text },
        { label: 'Δ',  val: (last.delta >= 0 ? '+' : '') + fmtVol(last.delta), color: last.delta >= 0 ? C.deltaPos : C.deltaNeg },
      ];

      let ox = 175;
      for (const s of stats) {
        ctx.font      = `8px ${FONT}`;
        ctx.fillStyle  = C.textMuted;
        ctx.textAlign  = 'left';
        ctx.fillText(s.label, ox, 13);
        ctx.font      = `9px ${FONT}`;
        ctx.fillStyle  = s.color;
        ctx.fillText(s.val, ox, 24);
        ox += 68;
      }
    }
  }

  // ─── Crosshair ────────────────────────────────────────────────────────────────

  function renderCrosshair(
    ctx: CanvasRenderingContext2D,
    W: number, _H: number,
    chartX: number, chartW: number, chartY: number, chartH: number,
    priceMin: number, pRange: number,
    toY: (p: number) => number,
    tick: number,
    _timeY: number,
  ) {
    const pos = hoverRef.current;
    if (!pos || pos.x < chartX || pos.x > chartX + chartW || pos.y < chartY || pos.y > chartY + chartH) return;

    const cx = Math.round(pos.x) + 0.5;
    const cy = Math.round(pos.y) + 0.5;

    ctx.strokeStyle = 'rgba(140,170,220,0.22)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(cx, chartY);
    ctx.lineTo(cx, chartY + chartH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(chartX, cy);
    ctx.lineTo(chartX + chartW, cy);
    ctx.stroke();

    ctx.setLineDash([]);

    // VWAP label — show only when cursor is within 6px of VWAP line
    const vpts = vwapPtsRef.current;
    if (vpts.length >= 2) {
      // Find nearest VWAP point by x
      let nearestY: number | null = null;
      let minDx = Infinity;
      for (const pt of vpts) {
        const dx = Math.abs(pt.x - pos.x);
        if (dx < minDx) { minDx = dx; nearestY = pt.y; }
      }
      if (nearestY !== null && Math.abs(pos.y - nearestY) <= 6) {
        ctx.font      = `bold 9px ${FONT}`;
        ctx.fillStyle  = C.vwap;
        ctx.globalAlpha = 1;
        ctx.textAlign  = 'left';
        const lx = Math.min(pos.x + 6, chartX + chartW - 40);
        ctx.fillText('VWAP', lx, nearestY - 4);
      }
    }

    // Price tag on scale
    const hPrice  = priceMin + (1 - (pos.y - chartY) / chartH) * pRange;
    const scaleX  = W - PRICE_W;
    const tagH    = 18;
    const tagY    = pos.y - tagH / 2;
    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(scaleX + 1, tagY, PRICE_W - 2, tagH);
    ctx.strokeStyle = 'rgba(100,140,220,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(scaleX + 1, tagY, PRICE_W - 2, tagH);
    ctx.font      = `bold 9px ${FONT}`;
    ctx.fillStyle  = C.price;
    ctx.textAlign  = 'center';
    ctx.fillText(fmtPrice(hPrice, tick), scaleX + PRICE_W / 2, tagY + 12);
  }

  // ─── Context menu actions ─────────────────────────────────────────────────────

  const menuActions = [
    {
      label: 'Reset View',
      icon: '↺',
      action: () => {
        const canvas = canvasRef.current;
        const total  = candlesRef.current.length * 88;
        const chartW = canvas ? canvas.clientWidth - PRICE_W : 0;
        const ox     = Math.max(0, total - chartW * 0.95);
        Object.assign(targetRef.current, { candleW: 88, rowH: 13, vZoom: 1, priceCenter: null, offsetX: ox });
        dirtyRef.current = true;
      },
    },
    {
      label: 'Zoom In',
      icon: '+',
      hint: 'Scroll ↑',
      action: () => {
        stateRef.current.candleW = Math.min(260, stateRef.current.candleW * 1.25);
        dirtyRef.current = true;
      },
    },
    {
      label: 'Zoom Out',
      icon: '−',
      hint: 'Scroll ↓',
      action: () => {
        stateRef.current.candleW = Math.max(28, stateRef.current.candleW * 0.8);
        dirtyRef.current = true;
      },
    },
    { separator: true },
    {
      label: 'Fit All Bars',
      icon: '⊞',
      action: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const chartW = canvas.clientWidth - PRICE_W;
        const n = candlesRef.current.length;
        stateRef.current.candleW  = Math.max(28, Math.min(260, chartW / n));
        stateRef.current.offsetX  = 0;
        dirtyRef.current = true;
      },
    },
    { separator: true },
    {
      label: 'Save PNG',
      icon: '↓',
      action: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const a = document.createElement('a');
        a.href     = canvas.toDataURL('image/png');
        a.download = `${symbol}_footprint.png`;
        a.click();
      },
    },
    { separator: true },
    {
      label: 'Settings',
      icon: '⚙',
      action: () => { setSettingsOpen(true); },
    },
  ] as const;

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  const TF_OPTIONS = [
    { label: '1m',  s: 60    },
    { label: '3m',  s: 180   },
    { label: '5m',  s: 300   },
    { label: '15m', s: 900   },
    { label: '30m', s: 1800  },
    { label: '1H',  s: 3600  },
    { label: '2H',  s: 7200  },
    { label: '4H',  s: 14400 },
    { label: '1D',  s: 86400 },
    { label: '1W',  s: 604800},
  ] as const;

  const currentSym = symbol.toLowerCase();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        height: 28, flexShrink: 0, overflow: 'hidden',
        background: '#07090f', borderBottom: '1px solid #0d1525',
      }}>

        {/* Symbol picker button */}
        {(() => {
          const allSymbols: { key: string; label: string }[] = SYMBOL_GROUPS.flatMap(g => [...g.symbols]);
          const activeLabel = allSymbols.find(s => s.key === currentSym)?.label ?? symbol;
          return (
            <div style={{ position: 'relative', padding: '0 6px' }}>
              <button
                onClick={() => setSymbolPanelOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                  fontFamily: FONT, fontSize: 11, letterSpacing: '0.05em', fontWeight: 'bold',
                  background: symbolPanelOpen ? '#162a4a' : 'transparent',
                  border: `1px solid ${symbolPanelOpen ? '#3a6abf' : '#1a2a44'}`,
                  color: '#c8dff8',
                }}
              >
                {activeLabel}
                <span style={{ fontSize: 8, color: '#4a7aaf', marginLeft: 1 }}>{symbolPanelOpen ? '▲' : '▼'}</span>
              </button>
            </div>
          );
        })()}

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: '#1a2a44', margin: '0 4px' }} />

        {/* TF buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {TF_OPTIONS.map(tf => (
            <button
              key={tf.s}
              onClick={() => setTfSeconds(tf.s)}
              style={{
                padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                fontFamily: FONT, fontSize: 10, letterSpacing: '0.04em',
                background: tfSeconds === tf.s ? '#162a4a' : 'transparent',
                border: `1px solid ${tfSeconds === tf.s ? '#3a6abf' : 'transparent'}`,
                color: tfSeconds === tf.s ? '#c8dff8' : '#3a5272',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (tfSeconds !== tf.s) (e.currentTarget as HTMLButtonElement).style.color = '#7a9fc0'; }}
              onMouseLeave={e => { if (tfSeconds !== tf.s) (e.currentTarget as HTMLButtonElement).style.color = '#3a5272'; }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Symbol panel ────────────────────────────────────────────────────── */}
      {symbolPanelOpen && (() => {
        const tabGroups: Record<string, typeof SYMBOL_GROUPS[number] | null> = {
          all    : null,
          cme    : SYMBOL_GROUPS.find(g => g.label === 'CME')    ?? null,
          majors : SYMBOL_GROUPS.find(g => g.label === 'Majors') ?? null,
          alts   : SYMBOL_GROUPS.find(g => g.label === 'Alts')   ?? null,
        };
        const allSyms: { key: string; label: string; group: string }[] = SYMBOL_GROUPS.flatMap(g =>
          (g.symbols as readonly { key: string; label: string }[]).map(s => ({ ...s, group: g.label }))
        );
        const query = symbolSearch.toLowerCase().trim();
        const poolByTab = symbolTab === 'all' ? allSyms
          : allSyms.filter(s => s.group.toLowerCase() === (tabGroups[symbolTab]?.label.toLowerCase() ?? ''));
        const filtered = query ? poolByTab.filter(s => s.label.toLowerCase().includes(query) || s.key.includes(query)) : poolByTab;

        const SUBTITLE: Record<string, string> = {
          CME: 'CME Micro',  Majors: 'Binance Futures', Alts: 'Binance Futures',
        };
        const TABS: { id: typeof symbolTab; label: string }[] = [
          { id: 'all',    label: 'ALL'    },
          { id: 'cme',    label: 'CME'    },
          { id: 'majors', label: 'MAJORS' },
          { id: 'alts',   label: 'ALTS'   },
        ];

        return (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'absolute', inset: 0, zIndex: 24 }}
              onMouseDown={() => { setSymbolPanelOpen(false); setSymbolSearch(''); }}
            />
            {/* Panel */}
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'absolute', top: 0, left: 6, zIndex: 25,
                width: 240, maxHeight: 400,
                background: '#080e1c',
                border: '1px solid #1a2d4a',
                borderRadius: 6,
                boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
                fontFamily: FONT,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px 6px',
                background: '#060b16',
                borderBottom: '1px solid #121e30',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 9, fontWeight: 'bold', color: '#3a6080', letterSpacing: '0.12em' }}>
                  INSTRUMENTS
                </span>
                <button
                  onClick={() => { setSymbolPanelOpen(false); setSymbolSearch(''); }}
                  style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#7a9fc0')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#2a4060')}
                >✕</button>
              </div>

              {/* Search */}
              <div style={{ padding: '7px 10px 5px', flexShrink: 0, borderBottom: '1px solid #0e1a2a' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 10, color: '#2a4060', pointerEvents: 'none',
                  }}>⌕</span>
                  <input
                    autoFocus
                    value={symbolSearch}
                    onChange={e => { setSymbolSearch(e.target.value); setSymbolTab('all'); }}
                    placeholder="Search..."
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0a1525', border: '1px solid #1a2d4a',
                      borderRadius: 4, padding: '5px 8px 5px 22px',
                      fontFamily: FONT, fontSize: 10, color: '#c8dff8',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Category tabs */}
              {!query && (
                <div style={{
                  display: 'flex', gap: 0,
                  padding: '5px 10px 0',
                  flexShrink: 0,
                }}>
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSymbolTab(t.id)}
                      style={{
                        flex: 1, padding: '4px 0',
                        background: 'none',
                        border: 'none',
                        borderBottom: `2px solid ${symbolTab === t.id ? '#3a6abf' : 'transparent'}`,
                        color: symbolTab === t.id ? '#8ab8e8' : '#2a4060',
                        fontFamily: FONT, fontSize: 9, letterSpacing: '0.08em',
                        cursor: 'pointer',
                        transition: 'color 0.12s',
                      }}
                      onMouseEnter={e => { if (symbolTab !== t.id) (e.currentTarget.style.color = '#5a8aaa'); }}
                      onMouseLeave={e => { if (symbolTab !== t.id) (e.currentTarget.style.color = '#2a4060'); }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: '#0e1a2a', margin: '5px 0 0', flexShrink: 0 }} />

              {/* Symbol list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filtered.length === 0 && (
                  <div style={{ padding: '16px 14px', fontSize: 10, color: '#2a4060', textAlign: 'center' }}>
                    No results
                  </div>
                )}
                {filtered.map(s => {
                  const active = currentSym === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => { onSymbolChange?.(s.key); setSymbolPanelOpen(false); setSymbolSearch(''); }}
                      style={{
                        display: 'flex', alignItems: 'center',
                        width: '100%', padding: '0',
                        background: active ? 'rgba(58,106,191,0.12)' : 'none',
                        border: 'none', cursor: 'pointer',
                        textAlign: 'left',
                        borderLeft: `2px solid ${active ? '#3a6abf' : 'transparent'}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
                    >
                      <div style={{ flex: 1, padding: '7px 12px 7px 10px' }}>
                        <div style={{
                          fontSize: 11, fontWeight: 'bold',
                          color: active ? '#c8dff8' : '#6a9abe',
                          letterSpacing: '0.04em',
                        }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 8, color: '#2a4060', letterSpacing: '0.06em', marginTop: 1 }}>
                          {SUBTITLE[s.group] ?? ''}
                        </div>
                      </div>
                      {active && (
                        <div style={{ paddingRight: 10, color: '#3a6abf', fontSize: 10 }}>●</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Chart canvas ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }} onMouseDown={() => setSymbolPanelOpen(false)}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: '100%', display: 'block', cursor: 'crosshair',
          // Prevent the browser from smooth-interpolating the buffer when
          // CSS size and internal buffer size diverge (e.g. mid-resize frame).
          imageRendering: 'pixelated',
        }}
      />


      {/* ── Settings modal ──────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
        >
          <div style={{ width: 400, background: '#0a1220', border: '1px solid #1e2d4a', borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,0.8)', fontFamily: FONT, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#080c18', borderBottom: '1px solid #1e2d4a' }}>
              <span style={{ fontSize: 11, fontWeight: 'bold', color: '#c8dff8', letterSpacing: '0.07em' }}>CHART SETTINGS</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: '#4a6a9a', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1e2d4a', background: '#080c18' }}>
              {([
                { id: 'visual',    icon: '◈', label: 'VISUAL'    },
                { id: 'footprint', icon: '▦', label: 'FOOTPRINT' },
                { id: 'trading',   icon: '◎', label: 'TRADING'   },
                { id: 'templates', icon: '▣', label: 'TEMPLATES' },
              ] as { id: SettingsTab; icon: string; label: string }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  style={{
                    flex: 1, padding: '8px 4px 7px', background: 'none', border: 'none', cursor: 'pointer',
                    color: settingsTab === tab.id ? '#c8dff8' : '#3a5070',
                    borderBottom: settingsTab === tab.id ? '2px solid #5a9af0' : '2px solid transparent',
                    fontSize: 9, letterSpacing: '0.08em', fontFamily: FONT,
                  }}
                  onMouseEnter={e => { if (settingsTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#7a9fc0'; }}
                  onMouseLeave={e => { if (settingsTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#3a5070'; }}
                >
                  <div style={{ fontSize: 13, marginBottom: 3 }}>{tab.icon}</div>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ padding: '14px 16px', minHeight: 220, maxHeight: 400, overflowY: 'auto' }}>

              {/* ── VISUAL TAB ── */}
              {settingsTab === 'visual' && (() => {
                const schemeColors = settings.colorScheme !== 'custom' ? COLOR_SCHEMES[settings.colorScheme] : null;
                const bidPreview   = settings.colorScheme === 'custom' ? settings.customBid  : schemeColors!.bid;
                const askPreview   = settings.colorScheme === 'custom' ? settings.customAsk  : schemeColors!.ask;
                const Toggle = ({ k, label }: { k: keyof ChartSettings; label: string }) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#7a9fc0' }}>{label}</span>
                    <div onClick={() => setSettings(p => ({ ...p, [k]: !p[k] }))}
                      style={{ width: 34, height: 18, borderRadius: 9, background: settings[k] ? '#5a9af0' : '#1e2d4a', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: settings[k] ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                );
                const Slider = ({ label, valLabel, min, max, step, value, onChange }: { label: string; valLabel: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: '#7a9fc0' }}>{label}</span>
                      <span style={{ fontSize: 10, color: '#5a9af0', fontFamily: FONT }}>{valLabel}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={value}
                      onChange={e => onChange(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: '#5a9af0', cursor: 'pointer' }} />
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Color scheme presets */}
                    <div>
                      <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em', marginBottom: 7 }}>COLOR SCHEME</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {(['atas', 'bookmap', 'mono', 'custom'] as const).map(s => {
                          const c = s !== 'custom' ? COLOR_SCHEMES[s] : { bid: settings.customBid, ask: settings.customAsk };
                          return (
                            <button key={s} onClick={() => setSettings(p => ({ ...p, colorScheme: s }))}
                              style={{ flex: 1, padding: '6px 4px', borderRadius: 4, cursor: 'pointer', fontSize: 9,
                                fontFamily: FONT, letterSpacing: '0.04em',
                                background: settings.colorScheme === s ? '#162a4a' : '#0d1828',
                                border: `1px solid ${settings.colorScheme === s ? '#5a9af0' : '#1e2d4a'}`,
                                color: settings.colorScheme === s ? '#c8dff8' : '#4a6a8a' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bid, display: 'inline-block' }} />
                                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.ask, display: 'inline-block' }} />
                              </div>
                              {s === 'atas' ? 'ATAS' : s === 'bookmap' ? 'BKMAP' : s === 'mono' ? 'MONO' : 'CUSTOM'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom color pickers — only when custom is selected */}
                    {settings.colorScheme === 'custom' && (
                      <div style={{ background: '#0a0f1c', border: '1px solid #1a2a40', borderRadius: 5, padding: '10px 12px' }}>
                        <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em', marginBottom: 10 }}>CUSTOM COLORS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {([
                            { label: 'Body Bear',  key: 'customBid'    as const },
                            { label: 'Body Bull',  key: 'customAsk'    as const },
                            { label: 'Wick',       key: 'customWick'   as const },
                            { label: 'Border',     key: 'customBorder' as const },
                            { label: 'POC Line',   key: 'customPOC'    as const },
                            { label: 'VWAP Line',  key: 'customVWAP'   as const },
                          ] as { label: string; key: keyof ChartSettings }[]).map(({ label, key }) => (
                            <ColorPicker
                              key={key}
                              value={settings[key] as string}
                              label={label}
                              onChange={c => setSettings(p => ({ ...p, [key]: c }))}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bid / Ask live preview */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 2, background: bidPreview, opacity: 0.8 }} />
                      <div style={{ flex: 1, height: 8, borderRadius: 2, background: askPreview, opacity: 0.8 }} />
                    </div>

                    <Toggle k="showVWAP" label="Show VWAP line" />
                    <Toggle k="showGrid" label="Show grid lines" />
                    <Toggle k="showCVD"  label="Show CVD panel" />

                    {/* Cell mode selector */}
                    <div>
                      <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em', marginBottom: 7 }}>CELL DISPLAY</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {(['both', 'numbers', 'bars'] as const).map(m => (
                          <button key={m} onClick={() => setSettings(p => ({ ...p, cellMode: m }))}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer', fontSize: 9,
                              fontFamily: FONT, letterSpacing: '0.04em',
                              background: settings.cellMode === m ? '#162a4a' : '#0d1828',
                              border: `1px solid ${settings.cellMode === m ? '#5a9af0' : '#1e2d4a'}`,
                              color: settings.cellMode === m ? '#c8dff8' : '#4a6a8a' }}>
                            {m === 'both' ? 'BOTH' : m === 'numbers' ? 'NUMS' : 'BARS'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Slider label="Bar opacity" valLabel={`${Math.round(settings.barOpacity * 100)}%`}
                      min={20} max={80} step={5} value={Math.round(settings.barOpacity * 100)}
                      onChange={v => setSettings(p => ({ ...p, barOpacity: v / 100 }))} />

                    <Slider label="Grid opacity" valLabel={`${Math.round(settings.gridOpacity * 100)}%`}
                      min={5} max={40} step={1} value={Math.round(settings.gridOpacity * 100)}
                      onChange={v => setSettings(p => ({ ...p, gridOpacity: v / 100 }))} />

                    {/* Environment colors */}
                    <div style={{ height: 1, background: '#1a2a3a', margin: '2px 0' }} />
                    <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em' }}>ENVIRONMENT</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <ColorPicker
                        value={settings.customBg}
                        label="Background"
                        onChange={c => setSettings(p => ({ ...p, customBg: c }))}
                      />
                      <ColorPicker
                        value={settings.customGrid}
                        label="Grid / Lines"
                        onChange={c => setSettings(p => ({ ...p, customGrid: c }))}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* ── FOOTPRINT TAB ── */}
              {settingsTab === 'footprint' && (() => {
                const Toggle = ({ k, label }: { k: keyof ChartSettings; label: string }) => (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#7a9fc0' }}>{label}</span>
                    <div onClick={() => setSettings(p => ({ ...p, [k]: !p[k] }))}
                      style={{ width: 34, height: 18, borderRadius: 9, background: settings[k] ? '#5a9af0' : '#1e2d4a', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: settings[k] ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em' }}>OVERLAYS</div>
                    <Toggle k="showPOC"          label="POC line (gold)"         />
                    <Toggle k="showDeltaCallout" label="Delta callout above candle" />
                    <Toggle k="showVolProfile"   label="Volume profile (left)"   />
                    <Toggle k="showDeltaBars"    label="Session delta bars"      />
                    <Toggle k="showDOMOverlay"   label="DOM depth overlay"       />

                    <div style={{ height: 1, background: '#1a2a3a', margin: '2px 0' }} />
                    <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em' }}>IMBALANCE</div>

                    <Toggle k="showImbalance" label="Show imbalance markers" />

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: '#7a9fc0' }}>Imbalance threshold</span>
                        <span style={{ fontSize: 10, color: '#5a9af0', fontFamily: FONT }}>{settings.imbalanceThresh.toFixed(1)}×</span>
                      </div>
                      <input type="range" min={15} max={100} step={5}
                        value={Math.round(settings.imbalanceThresh * 10)}
                        onChange={e => setSettings(p => ({ ...p, imbalanceThresh: parseInt(e.target.value) / 10 }))}
                        style={{ width: '100%', accentColor: '#5a9af0', cursor: 'pointer' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#2a3a5a', marginTop: 2 }}>
                        <span>1.5× sensitive</span><span>10× strong only</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: '#7a9fc0' }}>Min cell volume</span>
                        <span style={{ fontSize: 10, color: '#5a9af0', fontFamily: FONT }}>{settings.minCellVolPct}%</span>
                      </div>
                      <input type="range" min={0} max={20} step={1}
                        value={settings.minCellVolPct}
                        onChange={e => setSettings(p => ({ ...p, minCellVolPct: parseInt(e.target.value) }))}
                        style={{ width: '100%', accentColor: '#5a9af0', cursor: 'pointer' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#2a3a5a', marginTop: 2 }}>
                        <span>0% show all</span><span>20% high vol only</span>
                      </div>
                    </div>

                    <div style={{ height: 1, background: '#1a2a3a', margin: '2px 0' }} />
                    <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em' }}>LEVEL LINES</div>

                    <Toggle k="showHighLow"     label="Session High / Low lines" />
                    {settings.showHighLow && (
                      <div style={{ paddingLeft: 8 }}>
                        <ColorPicker value={settings.customHighLow}
                          label="H/L color"
                          onChange={c => setSettings(p => ({ ...p, customHighLow: c }))} />
                      </div>
                    )}

                    <Toggle k="showSessionOpen" label="Session Open line" />
                    {settings.showSessionOpen && (
                      <div style={{ paddingLeft: 8 }}>
                        <ColorPicker value={settings.customSessionOpen}
                          label="Open color"
                          onChange={c => setSettings(p => ({ ...p, customSessionOpen: c }))} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── TRADING TAB ── */}
              {settingsTab === 'trading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  <div>
                    <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em', marginBottom: 7 }}>DEFAULT QUANTITY</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {[1, 2, 5, 10].map(q => (
                        <button key={q} onClick={() => setSettings(p => ({ ...p, defaultQty: q }))}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: FONT,
                            background: settings.defaultQty === q ? '#162a4a' : '#0d1828',
                            border: `1px solid ${settings.defaultQty === q ? '#5a9af0' : '#1e2d4a'}`,
                            color: settings.defaultQty === q ? '#c8dff8' : '#4a6a8a' }}>{q}</button>
                      ))}
                      <input type="number" min={1} max={999} value={settings.defaultQty}
                        onChange={e => setSettings(p => ({ ...p, defaultQty: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: 50, padding: '5px 6px', borderRadius: 4, border: '1px solid #1e2d4a', background: '#0d1828', color: '#c8dff8', fontFamily: FONT, fontSize: 11, textAlign: 'center' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: '#7a9fc0' }}>Risk per trade</span>
                      <span style={{ fontSize: 10, color: '#5a9af0', fontFamily: FONT }}>{settings.riskPercent.toFixed(1)}%</span>
                    </div>
                    <input type="range" min={1} max={50} step={1} value={Math.round(settings.riskPercent * 10)}
                      onChange={e => setSettings(p => ({ ...p, riskPercent: parseInt(e.target.value) / 10 }))}
                      style={{ width: '100%', accentColor: '#5a9af0', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#2a3a5a', marginTop: 2 }}>
                      <span>0.1%</span><span>5.0%</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#7a9fc0' }}>Show P&amp;L overlay</span>
                    <div onClick={() => setSettings(p => ({ ...p, showPnLOverlay: !p.showPnLOverlay }))}
                      style={{ width: 34, height: 18, borderRadius: 9, background: settings.showPnLOverlay ? '#5a9af0' : '#1e2d4a', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: settings.showPnLOverlay ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TEMPLATES TAB ── */}
              {settingsTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, color: '#4a6a8a', letterSpacing: '0.08em', marginBottom: 2 }}>PRESETS</div>
                  {TEMPLATES.map(tpl => {
                    const c = tpl.settings.colorScheme !== 'custom'
                      ? COLOR_SCHEMES[tpl.settings.colorScheme ?? 'atas']
                      : { bid: tpl.settings.customBid ?? '#ef5350', ask: tpl.settings.customAsk ?? '#26a69a' };
                    return (
                      <button key={tpl.name} onClick={() => setSettings(p => ({ ...p, ...tpl.settings }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: '#0d1828', border: '1px solid #1e2d4a', borderRadius: 4,
                          cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#5a9af0')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2d4a')}>
                        <span style={{ fontSize: 15, color: '#5a9af0', width: 18, textAlign: 'center' }}>{tpl.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: '#c8dff8', marginBottom: 3 }}>{tpl.name}</div>
                          <div style={{ fontSize: 9, color: '#3a5070' }}>{tpl.desc}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 1, background: c.bid, display: 'inline-block', marginTop: 1 }} />
                          <span style={{ width: 8, height: 8, borderRadius: 1, background: c.ask, display: 'inline-block', marginTop: 1 }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #1e2d4a', background: '#080c18' }}>
              <button
                onClick={() => setSettings(DEFAULT_SETTINGS)}
                style={{ background: 'none', border: '1px solid #1e2d4a', borderRadius: 3, padding: '4px 10px', color: '#4a6a8a', cursor: 'pointer', fontSize: 10, fontFamily: FONT }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#5a9af0')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2d4a')}
              >Reset all</button>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{ background: '#162a4a', border: '1px solid #5a9af0', borderRadius: 3, padding: '4px 14px', color: '#c8dff8', cursor: 'pointer', fontSize: 10, fontFamily: FONT }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context menu ────────────────────────────────────────────────────── */}
      {ctxMenu && (
        <>
          {/* Backdrop — click anywhere to close */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 9 }}
            onMouseDown={() => setCtxMenu(null)}
          />
          <div
            style={{
              position    : 'absolute',
              left        : Math.min(ctxMenu.x, (canvasRef.current?.clientWidth ?? 400) - 170),
              top         : Math.min(ctxMenu.y, (canvasRef.current?.clientHeight ?? 400) - 220),
              zIndex      : 10,
              width       : 162,
              background  : '#0d1525',
              border      : '1px solid #1e2d4a',
              borderRadius: 4,
              boxShadow   : '0 8px 24px rgba(0,0,0,0.6)',
              fontFamily  : FONT,
              fontSize    : 11,
              padding     : '4px 0',
              userSelect  : 'none',
            }}
          >
            {menuActions.map((item, idx) =>
              'separator' in item ? (
                <div key={idx} style={{ height: 1, background: '#1e2d4a', margin: '3px 0' }} />
              ) : (
                <button
                  key={idx}
                  onMouseDown={(e) => { e.stopPropagation(); item.action(); setCtxMenu(null); }}
                  style={{
                    display        : 'flex',
                    alignItems     : 'center',
                    justifyContent : 'space-between',
                    width          : '100%',
                    padding        : '5px 12px',
                    background     : 'none',
                    border         : 'none',
                    color          : '#c8dff8',
                    cursor         : 'pointer',
                    textAlign      : 'left',
                    gap            : 6,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#162040')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#5a7aaa', width: 14, textAlign: 'center' }}>{item.icon}</span>
                    {item.label}
                  </span>
                  {'hint' in item && item.hint && (
                    <span style={{ color: '#2a3a5a', fontSize: 9 }}>{item.hint}</span>
                  )}
                </button>
              )
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
