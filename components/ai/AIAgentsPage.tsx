'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Radio, Activity, MessageSquare, ScanEye } from 'lucide-react';
import VisionPanel from '@/components/ai/VisionPanel';
import type { MarketData, OptionsExpiration } from '@/lib/ai/agents/analysisAgent';
import { LiveAgentPanel } from '@/components/ai/LiveAgentPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  // Core signals (deterministic engine)
  bias:              'LONG' | 'SHORT' | 'NEUTRAL';
  confidence:        number;   // 0–1
  gamma_regime:      string;
  volatility_regime: string;
  flow_direction:    string;
  key_levels:        { support: number[]; resistance: number[]; gamma_flip: number };
  explanation:       string;
  // Advanced dynamics
  gamma_squeeze:     boolean;
  squeeze_strength:  number;
  dealer_state:      string;
  confluence_score:  number;   // –8 to +8
  regime:            string;
  setup:             { entry: string; target: string; invalidation: string };
  // LLM layer (optional)
  llm_explanation:   string | null;
  // Provenance
  source:            'python' | 'js_fallback';
  meta?:             { symbol: string; price: number; timestamp: string };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const BIAS_CFG = {
  LONG:    { label: 'LONG',    color: '#22c55e', glow: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.3)',  icon: '↑' },
  SHORT:   { label: 'SHORT',   color: '#ef4444', glow: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  icon: '↓' },
  NEUTRAL: { label: 'NEUTRAL', color: '#eab308', glow: 'rgba(234,179,8,0.15)',  border: 'rgba(234,179,8,0.3)',  icon: '→' },
};

const REGIME_COLOR: Record<string, string> = {
  LONG_GAMMA:             '#22c55e',
  SHORT_GAMMA:            '#ef4444',
  NEAR_FLIP:              '#f97316',
  BULLISH:                '#22c55e',
  BEARISH:                '#ef4444',
  NEUTRAL:                '#64748b',
  EXPANSION:              '#a855f7',
  COMPRESSION:            '#3b82f6',
  TRAPPED_SHORT:          '#ef4444',
  TRAPPED_LONG:           '#ef4444',
  STABLE:                 '#22c55e',
  TRANSITION:             '#f97316',
  HIGH_PROBABILITY_TREND: '#22c55e',
  RANGE_MARKET:           '#3b82f6',
  BREAKOUT_WATCH:         '#f97316',
  GAMMA_SQUEEZE:          '#ef4444',
  VOLATILE_TREND:         '#a855f7',
  DISTRIBUTION:           '#ef4444',
  AMBIGUOUS:              '#64748b',
};

const SUGGESTED = [
  "C'est quoi le GEX ?", "Comment lire le skew ?",
  "Qu'est-ce que le flip level ?", "Expliquer le PCR",
  "Difference entre GEX+ et GEX- ?", "C'est quoi l'option flow ?",
];

const OPTIONS_SYMBOLS = [
  { label: 'SPY',  name: 'S&P 500 ETF',      price: 525 },
  { label: 'QQQ',  name: 'Nasdaq 100 ETF',    price: 445 },
  { label: 'NDX',  name: 'Nasdaq 100 Index',  price: 19400 },
  { label: 'SPX',  name: 'S&P 500 Index',     price: 5250 },
  { label: 'IWM',  name: 'Russell 2000 ETF',  price: 205 },
  { label: 'AAPL', name: 'Apple',             price: 195 },
  { label: 'TSLA', name: 'Tesla',             price: 175 },
  { label: 'NVDA', name: 'NVIDIA',            price: 875 },
  { label: 'AMZN', name: 'Amazon',            price: 185 },
  { label: 'MSFT', name: 'Microsoft',         price: 415 },
  { label: 'META', name: 'Meta',              price: 510 },
  { label: 'GOOGL',name: 'Alphabet',          price: 170 },
  { label: 'GLD',  name: 'Gold ETF',          price: 225 },
  { label: 'TLT',  name: 'Treasury Bond ETF', price: 88  },
];

const EXPIRATIONS: { value: OptionsExpiration; label: string; sublabel: string }[] = [
  { value: '0DTE',    label: '0DTE',    sublabel: 'Aujourd\'hui' },
  { value: '1DTE',    label: '1DTE',    sublabel: 'Demain'       },
  { value: 'Weekly',  label: 'Weekly',  sublabel: '~7 jours'     },
  { value: 'Monthly', label: 'Monthly', sublabel: '~30 jours'    },
];

const EXPIRATION_HINT: Record<OptionsExpiration, string> = {
  '0DTE':    'Gamma maximal · Pin risk · Intraday seulement',
  '1DTE':    'Gamma élevé · Risque gap overnight · Sweeps amplifiés',
  'Weekly':  'Court terme · Momentum · GEX stable',
  'Monthly': 'Structurel · Institutionnel · Tendance longue',
};

const DEFAULT_FORM: Partial<MarketData> = {
  symbol: 'SPY', price: 525,
  gex: 1.5, gexFlipLevel: 520, skew25d: -2.5,
  callFlowPercent: 55, putFlowPercent: 45,
  putCallRatio: 0.82, expiration: '0DTE',
};

// ─── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsed(active: boolean): number {
  const [secs, setSecs] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      start.current = Date.now();
      setSecs(0);
      const id = setInterval(() => {
        setSecs(Math.floor((Date.now() - start.current!) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      start.current = null;
      setSecs(0);
    }
  }, [active]);

  return secs;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Badge({ ok }: { ok: 'checking' | 'ok' | 'offline' }) {
  const map = {
    checking: { text: 'Connexion…',         bg: 'rgba(234,179,8,.12)',  border: 'rgba(234,179,8,.3)',  dot: '#eab308' },
    ok:       { text: 'Python Engine · Live',bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.3)', dot: '#22c55e' },
    offline:  { text: 'JS Engine · Local',  bg: 'rgba(59,130,246,.12)', border: 'rgba(59,130,246,.3)', dot: '#3b82f6' },
  }[ok];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: map.bg, border: `1px solid ${map.border}`, color: map.dot }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: map.dot,
        boxShadow: ok === 'ok' ? `0 0 6px ${map.dot}` : 'none',
        animation: ok === 'ok' ? 'pulse 2s infinite' : 'none' }} />
      {map.text}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

function NumInput({ label, value, onChange, step = 1, hint }: {
  label: string; value: number | undefined; onChange: (v: number) => void;
  step?: number; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        {hint && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
      </div>
      <input
        type="number" step={step} value={value ?? ''}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-28 text-right text-xs px-2 py-1.5 rounded-md outline-none transition-colors"
        style={{
          background: 'var(--surface-elevated, var(--surface))',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
    </div>
  );
}

function SliderRow({ label, value, onChange, color }: {
  label: string; value: number; onChange: (v: number) => void; color: string;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-xs font-mono font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: 'var(--border)' }}>
        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-200"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 8px ${color}60` }} />
        <input type="range" min={0} max={100} value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
    </div>
  );
}

// ─── Analysis Panel ───────────────────────────────────────────────────────────

function AnalysisPanel() {
  const [form, setForm]       = useState<Partial<MarketData>>(DEFAULT_FORM);
  const [tab, setTab]         = useState<'gex' | 'flow' | 'context'>('gex');
  const [result, setResult]   = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [pulse, setPulse]     = useState(false);
  const elapsed               = useElapsed(loading);

  const set = <K extends keyof MarketData>(k: K, v: MarketData[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const analyse = async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/ai/analysis', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json() as AnalysisResult & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const bc = result ? BIAS_CFG[result.bias] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header + button */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Analyse de Marché
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              GEX · Skew · Option Flow
            </p>
          </div>
          <button onClick={analyse} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
            style={{ background: loading ? 'var(--surface)' : 'var(--primary)',
                     color: '#fff', boxShadow: loading ? 'none' : '0 0 16px var(--primary)60' }}>
            {loading ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
                Analyse…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Analyser
              </>
            )}
          </button>
        </div>

        {/* Symbol picker */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {OPTIONS_SYMBOLS.map(s => (
              <button key={s.label} onClick={() => { set('symbol', s.label); set('price', s.price); }}
                className="px-2 py-1 rounded-md text-[11px] font-bold transition-all"
                style={{
                  background: form.symbol === s.label ? 'var(--primary)' : 'var(--surface)',
                  color: form.symbol === s.label ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${form.symbol === s.label ? 'var(--primary)' : 'var(--border)'}`,
                  boxShadow: form.symbol === s.label ? '0 0 10px var(--primary)40' : 'none',
                }}>
                {s.label}
              </button>
            ))}
          </div>
          {/* Selected symbol info */}
          <div className="px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{form.symbol}</span>
                <span className="text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>
                  {OPTIONS_SYMBOLS.find(s => s.label === form.symbol)?.name ?? ''}
                </span>
              </div>
            </div>

            {/* Expiration selector */}
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5"
                style={{ color: 'var(--text-muted)' }}>
                Échéance
              </div>
              <div className="grid grid-cols-4 gap-1">
                {EXPIRATIONS.map(exp => (
                  <button
                    key={exp.value}
                    onClick={() => set('expiration', exp.value)}
                    className="flex flex-col items-center py-1.5 px-1 rounded-md transition-all"
                    style={{
                      background: form.expiration === exp.value ? 'var(--primary)' : 'var(--background)',
                      border:     `1px solid ${form.expiration === exp.value ? 'var(--primary)' : 'var(--border)'}`,
                      boxShadow:  form.expiration === exp.value ? '0 0 10px var(--primary)40' : 'none',
                    }}
                  >
                    <span className="text-[11px] font-bold"
                      style={{ color: form.expiration === exp.value ? '#fff' : 'var(--text-secondary)' }}>
                      {exp.label}
                    </span>
                    <span className="text-[9px] mt-0.5"
                      style={{ color: form.expiration === exp.value ? 'rgba(255,255,255,.7)' : 'var(--text-muted)' }}>
                      {exp.sublabel}
                    </span>
                  </button>
                ))}
              </div>
              {form.expiration && (
                <p className="text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {EXPIRATION_HINT[form.expiration as OptionsExpiration]}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface)' }}>
          {(['gex', 'flow', 'context'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all"
              style={{
                background: tab === t ? 'var(--surface-elevated, #1e293b)' : 'transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              }}>
              {t === 'gex' ? 'GEX' : t === 'flow' ? 'Volatilité / Flow' : 'Contexte'}
            </button>
          ))}
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4 custom-scrollbar">
        {tab === 'gex' && (
          <div className="space-y-3">
            <SectionLabel>Prix sous-jacent</SectionLabel>
            <NumInput label="Prix actuel" value={form.price} onChange={v => set('price', v)} step={1} hint="$" />

            <div className="h-px my-2" style={{ background: 'var(--border)' }} />
            <SectionLabel>Gamma Exposure</SectionLabel>

            {/* GEX gauge */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>GEX</span>
                <span className="text-xs font-mono font-bold"
                  style={{ color: (form.gex ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                  {(form.gex ?? 0) >= 0 ? '+' : ''}{form.gex ?? 0}B$
                </span>
              </div>
              <div className="relative h-2 rounded-full mb-1" style={{ background: 'var(--border)' }}>
                <div className="absolute top-0 h-full rounded-full transition-all duration-300"
                  style={{
                    left:  (form.gex ?? 0) >= 0 ? '50%' : `${50 + Math.max(-50, (form.gex ?? 0) * 5)}%`,
                    width: `${Math.min(50, Math.abs(form.gex ?? 0) * 5)}%`,
                    background: (form.gex ?? 0) >= 0 ? '#22c55e' : '#ef4444',
                    boxShadow: `0 0 8px ${(form.gex ?? 0) >= 0 ? '#22c55e' : '#ef4444'}80`,
                  }} />
                <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--text-muted)' }} />
              </div>
              <input type="range" min={-5} max={5} step={0.1} value={form.gex ?? 0}
                onChange={e => set('gex', parseFloat(e.target.value))}
                className="w-full cursor-pointer" style={{ accentColor: (form.gex ?? 0) >= 0 ? '#22c55e' : '#ef4444' }} />
            </div>

            <NumInput label="GEX Flip Level" value={form.gexFlipLevel} onChange={v => set('gexFlipLevel', v)} step={100} hint="$" />
          </div>
        )}

        {tab === 'flow' && (
          <div className="space-y-4">
            <SectionLabel>Skew de Volatilité</SectionLabel>

            {/* Skew gauge */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Skew 25δ</span>
                <span className="text-xs font-mono font-bold"
                  style={{ color: (form.skew25d ?? 0) > 2 ? '#22c55e' : (form.skew25d ?? 0) < -2 ? '#ef4444' : '#eab308' }}>
                  {(form.skew25d ?? 0) > 0 ? '+' : ''}{form.skew25d ?? 0}%
                </span>
              </div>
              <input type="range" min={-10} max={10} step={0.5} value={form.skew25d ?? 0}
                onChange={e => set('skew25d', parseFloat(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: (form.skew25d ?? 0) > 0 ? '#22c55e' : '#ef4444' }} />
              <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                <span>Put skew (baissier)</span><span>Neutre</span><span>Call skew (haussier)</span>
              </div>
            </div>

            <div className="h-px" style={{ background: 'var(--border)' }} />
            <SectionLabel>Option Flow</SectionLabel>

            <SliderRow label="Calls %" value={form.callFlowPercent ?? 50}
              onChange={v => { set('callFlowPercent', v); set('putFlowPercent', 100 - v); }}
              color="#22c55e" />
            <SliderRow label="Puts %"  value={form.putFlowPercent ?? 50}
              onChange={v => { set('putFlowPercent', v); set('callFlowPercent', 100 - v); }}
              color="#ef4444" />

            {/* Flow visual */}
            <div className="flex rounded-full overflow-hidden h-2.5">
              <div className="transition-all duration-300" style={{ width: `${form.callFlowPercent ?? 50}%`, background: '#22c55e' }} />
              <div className="transition-all duration-300" style={{ width: `${form.putFlowPercent ?? 50}%`, background: '#ef4444' }} />
            </div>

            <NumInput label="Put/Call Ratio" value={form.putCallRatio} onChange={v => set('putCallRatio', v)} step={0.01}
              hint={(form.putCallRatio ?? 0) < 0.6 ? '🟢 très bullish' : (form.putCallRatio ?? 0) > 1.2 ? '🔴 très bearish' : '🟡 neutre'} />
          </div>
        )}

        {tab === 'context' && (
          <div className="space-y-3">
            <SectionLabel>Contexte additionnel</SectionLabel>
            <textarea rows={5} value={form.additionalContext ?? ''}
              onChange={e => set('additionalContext', e.target.value)}
              placeholder="Ex: NFP demain à 14h30, prix sur support majeur 64800, résistance confluence 66200…"
              className="w-full text-xs px-3 py-2.5 rounded-lg outline-none resize-none leading-relaxed"
              style={{ background: 'var(--surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', minHeight: 120 }}
              onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Ajoutez catalyseurs macro, niveaux techniques, événements à venir…
            </p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div className="p-3 rounded-lg text-xs flex gap-2 items-start"
            style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#fca5a5' }}>
            <span className="flex-shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="font-semibold mb-1">Erreur</p>
              <p className="opacity-80">{error}</p>
              {error.includes('Python') && (
                <code className="block mt-1 text-[10px] opacity-70">py -m ml.agent.server</code>
              )}
            </div>
          </div>
        )}

        {/* ── Result ───────────────────────────────────────────────────────── */}
        {result && bc && !loading && (
          <div className={`space-y-3 transition-all duration-500 ${pulse ? 'scale-[1.01]' : 'scale-100'}`}
            style={{ animation: 'fadeSlideUp .4s ease' }}>

            {/* Bias hero */}
            <div className="relative overflow-hidden rounded-xl p-4"
              style={{ background: bc.glow, border: `1px solid ${bc.border}` }}>
              <div className="absolute inset-0 opacity-20"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${bc.color}, transparent 70%)` }} />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="text-3xl font-black tracking-tight flex items-center gap-2"
                    style={{ color: bc.color, textShadow: `0 0 20px ${bc.color}60` }}>
                    <span>{bc.icon}</span><span>{bc.label}</span>
                  </div>
                  <div className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
                    {result.meta?.symbol} · ${result.meta?.price?.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black" style={{ color: bc.color }}>
                    {Math.round(result.confidence * 100)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>confiance</div>
                  <div className="w-20 h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(0,0,0,.3)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${result.confidence * 100}%`, background: bc.color,
                               transition: 'width 1s cubic-bezier(.34,1.56,.64,1)',
                               boxShadow: `0 0 6px ${bc.color}` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Gamma squeeze alert */}
            {result.gamma_squeeze && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.3)' }}>
                <span className="text-[10px] font-black animate-pulse" style={{ color: '#ef4444' }}>
                  ⚡ GAMMA SQUEEZE
                </span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.round((result.squeeze_strength ?? 0) * 100)}%`, background: '#ef4444',
                             transition: 'width 0.5s ease' }} />
                </div>
                <span className="text-[10px] font-bold font-mono" style={{ color: '#ef4444' }}>
                  {Math.round((result.squeeze_strength ?? 0) * 100)}%
                </span>
              </div>
            )}

            {/* Regime chips — 2×2 grid */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: 'Gamma',      value: result.gamma_regime },
                { label: 'Volatilité', value: result.volatility_regime },
                { label: 'Flow',       value: result.flow_direction },
                { label: 'Dealer',     value: result.dealer_state },
              ] as const).filter(r => r.value).map(({ label, value }) => (
                <div key={label} className="px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
                    style={{ color: 'var(--text-muted)' }}>{label}</div>
                  <div className="text-[11px] font-bold"
                    style={{ color: REGIME_COLOR[value] ?? '#64748b' }}>
                    {value.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}
            </div>

            {/* Market regime + confluence score */}
            {(result.regime || result.confluence_score !== undefined) && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {result.regime && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
                      style={{ color: 'var(--text-muted)' }}>Régime Marché</div>
                    <div className="text-[11px] font-bold"
                      style={{ color: REGIME_COLOR[result.regime] ?? '#64748b' }}>
                      {result.regime.replace(/_/g, ' ')}
                    </div>
                  </div>
                )}
                {result.confluence_score !== undefined && (
                  <div className="text-right">
                    <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
                      style={{ color: 'var(--text-muted)' }}>Confluence</div>
                    <div className="text-lg font-black font-mono"
                      style={{ color: result.confluence_score > 0 ? '#22c55e'
                               : result.confluence_score < 0 ? '#ef4444' : '#64748b' }}>
                      {result.confluence_score > 0 ? '+' : ''}{result.confluence_score.toFixed(1)}
                      <span className="text-[10px] font-normal opacity-50">/8</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Key levels */}
            {result.key_levels && (
              <div>
                <SectionLabel>Niveaux Clés</SectionLabel>
                <div className="grid grid-cols-3 gap-1.5">
                  {result.key_levels.support.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.2)' }}>
                      <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#22c55e' }}>▲ Support</div>
                      {result.key_levels.support.map((l, i) => (
                        <div key={i} className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          ${l.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  )}
                  {result.key_levels.gamma_flip > 0 && (
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(249,115,22,.05)', border: '1px solid rgba(249,115,22,.2)' }}>
                      <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#f97316' }}>⊙ Flip</div>
                      <div className="text-xs font-mono font-semibold" style={{ color: '#f97316' }}>
                        ${result.key_levels.gamma_flip.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {result.key_levels.resistance.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.2)' }}>
                      <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#ef4444' }}>▼ Résistance</div>
                      {result.key_levels.resistance.map((l, i) => (
                        <div key={i} className="text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          ${l.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Setup */}
            {result.setup?.entry && (
              <div className="space-y-1.5">
                <SectionLabel>Setup</SectionLabel>
                {[
                  { label: 'Entrée',       value: result.setup.entry,        color: '#60a5fa' },
                  { label: 'Objectif',     value: result.setup.target,       color: '#22c55e' },
                  { label: 'Invalidation', value: result.setup.invalidation, color: '#ef4444' },
                ].map(({ label, value, color }) => value ? (
                  <div key={label} className="flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="flex-shrink-0 font-bold w-20 text-[10px] pt-px"
                      style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="leading-relaxed" style={{ color }}>{value}</span>
                  </div>
                ) : null)}
              </div>
            )}

            {/* Engine explanation (deterministic) */}
            {result.explanation && (
              <div className="p-3 rounded-lg flex gap-2.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <SectionLabel>Analyse Engine</SectionLabel>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {result.explanation}
                  </p>
                </div>
              </div>
            )}

            {/* LLM explanation (optional, secondary) */}
            {result.llm_explanation && (
              <div className="p-3 rounded-lg flex gap-2.5"
                style={{ background: 'rgba(168,85,247,.05)', border: '1px solid rgba(168,85,247,.2)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
                  <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z"/>
                </svg>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5"
                    style={{ color: '#a855f7' }}>Contexte IA</div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {result.llm_explanation}
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t text-[10px]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: result.source === 'python' ? '#22c55e' : '#3b82f6' }} />
                {result.source === 'python' ? 'Python Engine' : 'JS Engine'}
              </span>
              <span>{result.meta?.timestamp ? new Date(result.meta.timestamp).toLocaleTimeString() : ''}</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Prêt à analyser</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Ajustez les paramètres et cliquez sur Analyser
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="relative w-14 h-14">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)',
                         animationDuration: '1.1s' }} />
              {/* Inner ring (counter-rotate) */}
              <div className="absolute inset-2.5 rounded-full border animate-spin"
                style={{ borderColor: 'transparent', borderTopColor: 'var(--primary)',
                         opacity: 0.5, animationDuration: '2s', animationDirection: 'reverse' }} />
              {/* Center sparkle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/>
                </svg>
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Analyse en cours…
              </p>
              {/* Elapsed time + expected duration hint */}
              <p className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--primary)' }}>
                {elapsed}s
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {elapsed < 2
                  ? 'Calcul des signaux…'
                  : elapsed < 8
                  ? 'Génération de l\'explication IA…'
                  : 'Ollama hors ligne — résultat deterministe en cours…'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel() {
  const [messages,  setMessages]  = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Bonjour 👋 Je suis votre assistant trading. Posez-moi vos questions sur le GEX, le skew, l\'option flow, ou comment utiliser la plateforme.' },
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const endRef    = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const firstMsg  = messages.length === 1;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const history = messages.filter(m => !m.loading).slice(-10)
      .map(m => ({ role: m.role, content: m.content }));
    setMessages(p => [...p, { role: 'user', content: text.trim() }, { role: 'assistant', content: '', loading: true }]);
    setInput('');
    setLoading(true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/ai/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') break;
          try {
            full += (JSON.parse(d) as { token: string }).token;
            setMessages(p => { const u = [...p]; u[u.length - 1] = { role: 'assistant', content: full }; return u; });
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : 'Erreur';
      setMessages(p => { const u = [...p]; u[u.length - 1] = { role: 'assistant', content: `⚠️ ${msg}\n\n\`ollama serve\` puis \`ollama pull mistral\`` }; return u; });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Assistant Trading</h2>
          <button onClick={() => setMessages([messages[0]])}
            className="text-[11px] px-2 py-0.5 rounded transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Effacer la conversation">
            Effacer
          </button>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>GEX · Skew · Footprint · Option Flow</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 custom-scrollbar pb-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)40' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z"/>
                </svg>
              </div>
            )}
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: 'var(--surface-elevated, var(--surface))', border: '1px solid var(--border)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                  <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
                </svg>
              </div>
            )}

            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
              msg.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'
            }`} style={{
              background:   msg.role === 'user' ? 'var(--primary)' : 'var(--surface)',
              color:        msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              border:       msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              boxShadow:    msg.role === 'user' ? '0 2px 12px var(--primary)30' : 'none',
            }}>
              {msg.loading && !msg.content ? (
                <div className="flex gap-1 items-center py-0.5">
                  {[0,1,2].map(j => (
                    <div key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: 'var(--text-muted)', animationDelay: `${j*0.15}s` }} />
                  ))}
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Suggestions */}
      {firstMsg && (
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map(q => (
              <button key={q} onClick={() => send(q)}
                className="text-[11px] px-2.5 py-1 rounded-full transition-all hover:opacity-80 active:scale-95"
                style={{ background: 'var(--surface)', color: 'var(--text-secondary)',
                         border: '1px solid var(--border)' }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="flex items-end gap-2 rounded-xl p-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <textarea ref={inputRef} value={input} rows={1}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Posez votre question… (Entrée pour envoyer)"
            disabled={loading}
            className="flex-1 text-xs bg-transparent outline-none resize-none leading-relaxed"
            style={{ color: 'var(--text-primary)', minHeight: 20, maxHeight: 100 }} />
          {loading ? (
            <button onClick={() => { abortRef.current?.abort(); setLoading(false); }}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: '#ef4444', color: '#fff' }} title="Arrêter">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          ) : (
            <button onClick={() => send(input)} disabled={!input.trim()}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: input.trim() ? 'var(--primary)' : 'var(--border)',
                       color: '#fff', boxShadow: input.trim() ? '0 0 10px var(--primary)50' : 'none' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}
        </div>
        <p className="text-[9px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>
          Entrée → envoyer · Shift+Entrée → nouvelle ligne
        </p>
      </div>
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'signal' | 'analyse' | 'chat' | 'vision';

const TABS: { id: TabId; label: string; shortLabel: string }[] = [
  { id: 'signal',  label: 'Signal Live', shortLabel: 'Signal'  },
  { id: 'analyse', label: 'Analyse',     shortLabel: 'Analyse' },
  { id: 'chat',    label: 'Assistant',   shortLabel: 'Chat'    },
  { id: 'vision',  label: 'Vision',      shortLabel: 'Vision'  },
];

const TAB_ICONS: Record<TabId, React.FC<{ size: number }>> = {
  signal:  ({ size }) => <Radio size={size} />,
  analyse: ({ size }) => <Activity size={size} />,
  chat:    ({ size }) => <MessageSquare size={size} />,
  vision:  ({ size }) => <ScanEye size={size} />,
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AIAgentsPage() {
  const [status,    setStatus]    = useState<'checking' | 'ok' | 'offline'>('checking');
  const [activeTab, setActiveTab] = useState<TabId>('signal');

  useEffect(() => {
    fetch('/api/ai/analysis').then(r => r.json())
      .then((d: { python_online: boolean }) => setStatus(d.python_online ? 'ok' : 'offline'))
      .catch(() => setStatus('offline'));
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-11 flex items-center px-4 gap-3 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>

        {/* Left: icon + title + engine badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'var(--primary)', boxShadow: '0 0 10px var(--primary)50' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/>
              <path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/>
            </svg>
          </div>
          <span className="text-[13px] font-bold whitespace-nowrap"
            style={{ color: 'var(--text-primary)' }}>
            AI Trading Suite
          </span>
          <Badge ok={status} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: tab buttons */}
        <div className="flex items-center gap-0.5">
          {TABS.map(tab => {
            const active  = activeTab === tab.id;
            const IconCmp = TAB_ICONS[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-md
                            text-[11px] font-medium transition-all duration-150 ${
                  active
                    ? 'bg-[var(--surface)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)]/60'
                }`}
              >
                <IconCmp size={12} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {/* Active indicator dot */}
                {active && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2
                                   w-1 h-1 rounded-full bg-[var(--primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* Signal Live — LiveAgentPanel, full height */}
        <div className="w-full h-full"
          style={{ display: activeTab === 'signal' ? 'flex' : 'none', flexDirection: 'column' }}>
          {status === 'offline' && (
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b text-[11px]"
              style={{
                borderColor: 'var(--border)',
                background: 'rgba(59,130,246,.04)',
                color: 'var(--text-muted)',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"
                strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Engine JS actif —</span>
              <code className="px-1.5 py-0.5 rounded font-mono"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                py -m ml.agent.server
              </code>
              <span>pour activer Python</span>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <LiveAgentPanel />
          </div>
        </div>

        {/* Analyse — AnalysisPanel, full height */}
        <div className="w-full h-full"
          style={{ display: activeTab === 'analyse' ? 'flex' : 'none', flexDirection: 'column' }}>
          <AnalysisPanel />
        </div>

        {/* Assistant — ChatPanel, full height */}
        <div className="w-full h-full"
          style={{ display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
          <ChatPanel />
        </div>

        {/* Vision — VisionPanel, full height */}
        <div className="w-full h-full"
          style={{ display: activeTab === 'vision' ? 'flex' : 'none', flexDirection: 'column' }}>
          <VisionPanel />
        </div>

      </div>

      {/* CSS animation used by AnalysisPanel result */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
