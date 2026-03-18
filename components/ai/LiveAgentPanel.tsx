'use client';

import {
  TrendingUp, TrendingDown, Minus,
  Zap, WifiOff, RefreshCw, Activity,
  Target, AlertTriangle, ArrowRight, Radio,
} from 'lucide-react';
import { useLiveAgent, type AgentSignal, type AgentSource } from '@/hooks/useLiveAgent';
import { LiveFeed } from '@/components/ai/LiveFeed';

// ─── Style maps ───────────────────────────────────────────────────────────────

const BIAS = {
  LONG:    { label: 'LONG',    color: '#22c55e', bg: 'rgba(34,197,94,.08)',   border: 'rgba(34,197,94,.20)',  Icon: TrendingUp  },
  SHORT:   { label: 'SHORT',   color: '#ef4444', bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.20)',  Icon: TrendingDown },
  NEUTRAL: { label: 'NEUTRAL', color: '#eab308', bg: 'rgba(234,179,8,.08)',   border: 'rgba(234,179,8,.20)',  Icon: Minus       },
} as const;

const REGIME_COLOR: Record<string, string> = {
  LONG_GAMMA:             '#22c55e',
  SHORT_GAMMA:            '#ef4444',
  NEAR_FLIP:              '#f97316',
  BULLISH:                '#22c55e',
  BEARISH:                '#ef4444',
  NEUTRAL:                '#64748b',
  EXPANSION:              '#a855f7',
  COMPRESSION:            '#3b82f6',
  CALM:                   '#64748b',
  EVENT_RISK:             '#f97316',
  BREAKOUT_ZONE:          '#f97316',
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

const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f97316',
  LOW:    '#64748b',
};

const STATUS_COLOR: Record<string, string> = {
  live:         '#22c55e',
  connecting:   '#eab308',
  reconnecting: '#eab308',
  offline:      '#ef4444',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RegimeChip({ label, value }: { label: string; value: string }) {
  const color = REGIME_COLOR[value] ?? '#64748b';
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold truncate"
        style={{
          background: `${color}15`,
          border:     `1px solid ${color}35`,
          color,
        }}>
        {value.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

function EventPill({ event }: { event: { type: string; severity: string } }) {
  const color = SEVERITY_COLOR[event.severity] ?? '#64748b';
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}>
      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
      {event.type.replace(/_/g, ' ')}
    </div>
  );
}

function ConfidenceArc({ value, color }: { value: number; color: string }) {
  const r   = 32;
  const cx  = 40;
  const cy  = 40;
  const arc = 2 * Math.PI * r * value;
  const tot = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  return (
    <svg width="80" height="80" className="flex-shrink-0">
      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={r + 4} fill="none"
        stroke={color} strokeWidth="1" opacity="0.08" />
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="var(--border)" strokeWidth="4" />
      {/* Progress */}
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${arc} ${tot}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.34,1.56,.64,1)', filter: `drop-shadow(0 0 4px ${color}80)` }}
      />
      {/* Value */}
      <text x={cx} y={cy - 4} textAnchor="middle"
        style={{ fontSize: 16, fontWeight: 800, fill: color, fontFamily: 'monospace' }}>
        {pct}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        style={{ fontSize: 8, fontWeight: 600, fill: 'var(--text-muted)', fontFamily: 'sans-serif' }}>
        CONF
      </text>
    </svg>
  );
}

function ConfluenceBar({ score }: { score: number }) {
  const MAX    = 8;
  const bullPct = score > 0 ? Math.min((score / MAX) * 100, 100) : 0;
  const bearPct = score < 0 ? Math.min((Math.abs(score) / MAX) * 100, 100) : 0;
  const color   = score > 3 ? '#22c55e' : score < -3 ? '#ef4444' : score > 0 ? '#86efac' : score < 0 ? '#fca5a5' : '#64748b';
  const label   = score > 5 ? 'STRONG BULL' : score > 3 ? 'BULL' : score < -5 ? 'STRONG BEAR' : score < -3 ? 'BEAR' : 'NEUTRAL';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest">
        <span style={{ color: 'var(--text-muted)' }}>Confluence</span>
        <span style={{ color }}>{score > 0 ? '+' : ''}{score.toFixed(1)} — {label}</span>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--text-muted)', opacity: 0.4 }} />
        {bullPct > 0 && (
          <div className="absolute top-0 bottom-0 rounded-full"
            style={{ left: '50%', width: `${bullPct / 2}%`, background: '#22c55e', transition: 'width 0.5s ease' }} />
        )}
        {bearPct > 0 && (
          <div className="absolute top-0 bottom-0 rounded-full"
            style={{ right: '50%', width: `${bearPct / 2}%`, background: '#ef4444', transition: 'width 0.5s ease' }} />
        )}
      </div>
    </div>
  );
}

function GammaSqueezeAlert({ strength }: { strength: number }) {
  const pct = Math.round(strength * 100);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md"
      style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.3)' }}>
      <Zap size={12} color="#ef4444" className="flex-shrink-0 animate-pulse" />
      <span className="text-[10px] font-black" style={{ color: '#ef4444' }}>GAMMA SQUEEZE</span>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#ef4444', transition: 'width 0.5s ease' }} />
      </div>
      <span className="text-[10px] font-bold font-mono flex-shrink-0" style={{ color: '#ef4444' }}>{pct}%</span>
    </div>
  );
}

function SetupBlock({ setup }: { setup: { entry: string; target: string; invalidation: string } }) {
  const rows = [
    { label: 'Entry',        value: setup.entry,        color: '#60a5fa', Icon: ArrowRight   },
    { label: 'Target',       value: setup.target,       color: '#22c55e', Icon: Target       },
    { label: 'Invalidation', value: setup.invalidation, color: '#ef4444', Icon: AlertTriangle },
  ];
  return (
    <div className="space-y-2">
      {rows.map(({ label, value, color, Icon }) => (
        <div key={label} className="flex items-start gap-2 text-[10px]">
          <Icon size={10} color={color} className="flex-shrink-0 mt-0.5" />
          <span className="flex-shrink-0 font-bold w-[72px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span className="leading-relaxed" style={{ color }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="h-1 w-12 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full"
            style={{ width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
        </div>
        <span className="text-[10px] font-bold font-mono" style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: AgentSource }) {
  if (!source) return null;
  const isPython = source === 'python_agent';
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{
        background: isPython ? 'rgba(168,85,247,.12)' : 'rgba(59,130,246,.12)',
        border:     isPython ? '1px solid rgba(168,85,247,.3)' : '1px solid rgba(59,130,246,.3)',
        color:      isPython ? '#a855f7' : '#3b82f6',
      }}>
      {isPython ? '🐍 Python' : '⚡ JS Sim'}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LiveAgentPanel() {
  const { signal, status, source, history, feedLog, lastUpdate } = useLiveAgent({
    interval:   3000,
    historyLen: 30,
  });

  const bias   = signal?.bias ?? 'NEUTRAL';
  const bStyle = BIAS[bias];
  const conf   = signal?.confidence ?? 0;
  const BiasIcon = bStyle.Icon;

  const secAgo = lastUpdate
    ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    : null;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 h-10 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-2 h-2 flex-shrink-0">
            {status === 'live' && (
              <div className="absolute inset-0 rounded-full animate-ping opacity-50"
                style={{ background: STATUS_COLOR[status] }} />
            )}
            <div className="absolute inset-0 rounded-full"
              style={{ background: STATUS_COLOR[status] }} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: STATUS_COLOR[status] }}>
            {status === 'live' ? 'Live' : status}
          </span>
        </div>

        {status === 'offline' && <WifiOff size={12} color="#ef4444" />}
        {status === 'reconnecting' && <RefreshCw size={12} color="#eab308" className="animate-spin" />}

        <div className="h-3 w-px" style={{ background: 'var(--border)' }} />

        <Radio size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Agent Continu
        </span>

        <SourceBadge source={source} />

        {signal?.mode && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{
              background: signal.mode === 'SIGNAL' ? 'rgba(239,68,68,.12)' : 'rgba(59,130,246,.10)',
              color:      signal.mode === 'SIGNAL' ? '#ef4444' : '#60a5fa',
              border:     `1px solid ${signal.mode === 'SIGNAL' ? 'rgba(239,68,68,.3)' : 'rgba(59,130,246,.25)'}`,
            }}>
            {signal.mode}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {history.length > 0 && <span>{history.length} signaux</span>}
          {secAgo !== null && <span>{secAgo < 5 ? 'Maintenant' : `${secAgo}s`}</span>}
          {signal?.tick && <span className="font-mono">tick #{signal.tick}</span>}
        </div>
      </div>

      {/* ── Signal body ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-stretch" style={{ minHeight: 120 }}>

        {/* Col 1 — Bias + Confidence ─────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-4 flex-shrink-0 w-[200px] border-r"
          style={{ background: bStyle.bg, borderColor: 'var(--border)' }}>
          <ConfidenceArc value={conf} color={bStyle.color} />
          <div className="flex items-center gap-1.5">
            <BiasIcon size={18} color={bStyle.color} />
            <span className="text-xl font-black tracking-tight"
              style={{ color: bStyle.color, textShadow: `0 0 16px ${bStyle.color}40` }}>
              {bStyle.label}
            </span>
          </div>
        </div>

        {/* Col 2 — Regime grid ────────────────────────────────────────────── */}
        <div className="px-5 py-4 flex-shrink-0 w-[300px] border-r flex flex-col justify-between"
          style={{ borderColor: 'var(--border)' }}>
          {signal ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <RegimeChip label="Gamma"      value={signal.gamma_regime} />
              <RegimeChip label="Volatilité" value={signal.volatility_regime} />
              <RegimeChip label="Flow"       value={signal.flow_state} />
              <RegimeChip label="Dealer"     value={signal.dealer_state ?? signal.context_state} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[11px]"
              style={{ color: 'var(--text-muted)' }}>
              {status === 'connecting' ? 'Connexion…' : 'En attente du premier signal…'}
            </div>
          )}

          {signal?.key_levels && (
            <div className="flex items-center gap-3 mt-3 pt-2 border-t text-[10px]"
              style={{ borderColor: 'var(--border)' }}>
              {signal.key_levels.support.length > 0 && (
                <span style={{ color: '#22c55e' }}>
                  S: {signal.key_levels.support.map(v => v.toFixed(0)).join(' · ')}
                </span>
              )}
              {signal.key_levels.resistance.length > 0 && (
                <span style={{ color: '#ef4444' }}>
                  R: {signal.key_levels.resistance.map(v => v.toFixed(0)).join(' · ')}
                </span>
              )}
              {signal.key_levels.gamma_flip > 0 && (
                <span style={{ color: '#f97316' }}>
                  Flip: {signal.key_levels.gamma_flip.toFixed(0)}
                </span>
              )}
            </div>
          )}

          {signal?.delta && (
            <div className="mt-2 pt-2 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: 'Flow',    value: signal.delta.flow_change },
                { label: 'Skew',    value: signal.delta.skew_change },
                { label: 'vs Flip', value: signal.delta.price_vs_flip },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline gap-1.5 text-[10px]">
                  <span className="font-bold flex-shrink-0" style={{ color: 'var(--text-muted)', minWidth: 44 }}>{label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Col 3 — Dynamics ───────────────────────────────────────────────── */}
        <div className="flex-1 px-5 py-4 min-w-0 flex flex-col gap-2.5">

          {signal?.gamma_squeeze && signal.squeeze_strength !== undefined && (
            <GammaSqueezeAlert strength={signal.squeeze_strength} />
          )}

          {signal?.regime && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}>Régime</span>
              <span className="text-[11px] font-bold"
                style={{ color: REGIME_COLOR[signal.regime] ?? '#64748b' }}>
                {signal.regime.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          {signal?.confluence_score !== undefined && (
            <ConfluenceBar score={signal.confluence_score} />
          )}

          {(signal?.signal_confidence !== undefined || signal?.signal_quality !== undefined) && (
            <div className="flex items-center gap-4">
              {signal.signal_confidence !== undefined && (
                <MiniMetric label="Sig Conf" value={signal.signal_confidence} color="#60a5fa" />
              )}
              {signal.persistence_score !== undefined && (
                <MiniMetric label="Persist" value={signal.persistence_score} color="#a855f7" />
              )}
              {signal.signal_quality !== undefined && (
                <MiniMetric label="Quality" value={signal.signal_quality} color="#22c55e" />
              )}
            </div>
          )}

          {signal?.events && signal.events.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {signal.events.map((ev, i) => (
                <EventPill key={i} event={ev} />
              ))}
            </div>
          )}

          {signal?.reason && !signal?.regime && (
            <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {signal.reason}
            </div>
          )}

          {history.length > 2 && (
            <div className="mt-auto pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest mb-1"
                style={{ color: 'var(--text-muted)' }}>
                <Activity size={9} />
                <span>Historique confiance</span>
              </div>
              <svg width="100%" height="22" preserveAspectRatio="none" className="overflow-visible">
                {history.slice(-20).map((s, i, arr) => {
                  const x = (i / Math.max(arr.length - 1, 1)) * 100;
                  const y = 22 - s.confidence * 18;
                  return <circle key={i} cx={`${x}%`} cy={y} r="2"
                    fill={BIAS[s.bias]?.color ?? '#64748b'} opacity="0.85" />;
                })}
                {history.slice(-20).map((s, i, arr) => {
                  if (i === 0) return null;
                  const p  = arr[i - 1];
                  const x1 = ((i - 1) / Math.max(arr.length - 1, 1)) * 100;
                  const x2 = (i / Math.max(arr.length - 1, 1)) * 100;
                  return <line key={`l${i}`} x1={`${x1}%`} y1={22 - p.confidence * 18}
                    x2={`${x2}%`} y2={22 - s.confidence * 18}
                    stroke="var(--border)" strokeWidth="1" />;
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Col 4 — Setup (optional) ───────────────────────────────────────── */}
        {signal?.setup && (
          <div className="flex-shrink-0 w-[240px] px-4 py-4 border-l flex flex-col"
            style={{ borderColor: 'var(--border)' }}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
              style={{ color: 'var(--text-muted)' }}>
              <Target size={9} />
              <span>Setup</span>
            </div>
            <SetupBlock setup={signal.setup} />
          </div>
        )}
      </div>

      {/* ── Intelligence Feed (fills remaining height) ────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-t"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-1.5 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}>
            <Radio size={9} />
            <span>Intelligence Feed</span>
          </div>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {feedLog.length} événements
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <LiveFeed entries={feedLog} fill />
        </div>
      </div>

    </div>
  );
}
