'use client';

/**
 * TRADING BIAS WIDGET
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the AI analysis agent result.
 * Includes a form to input market data and trigger analysis.
 */

import React, { useState } from 'react';
import type { MarketData, OptionsExpiration } from '@/lib/ai/agents/analysisAgent';

const EXPIRATIONS: { value: OptionsExpiration; label: string }[] = [
  { value: '0DTE',    label: '0DTE'    },
  { value: '1DTE',    label: '1DTE'    },
  { value: 'Weekly',  label: 'Weekly'  },
  { value: 'Monthly', label: 'Monthly' },
];

interface AnalysisResult {
  bias:          'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence:    number;
  reasoning:     string[];
  keyLevels:     { support: number[]; resistance: number[] };
  mmPositioning: string;
  action:        string;
  riskFactors:   string[];
  meta?: {
    symbol:    string;
    price:     number;
    model:     string;
    timestamp: string;
  };
}

interface TradingBiasProps {
  /** Pre-filled market data from live chart (optional) */
  defaultData?: Partial<MarketData>;
  colors?: {
    background?:        string;
    surface?:           string;
    textPrimary?:       string;
    textSecondary?:     string;
    textMuted?:         string;
    currentPriceColor?: string;
    gridColor?:         string;
    deltaPositive?:     string;
    deltaNegative?:     string;
  };
  className?: string;
}

const BIAS_CONFIG = {
  BULLISH: { label: 'BULLISH', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: '↑' },
  BEARISH: { label: 'BEARISH', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: '↓' },
  NEUTRAL: { label: 'NEUTRAL', color: '#eab308', bg: 'rgba(234,179,8,0.1)',  icon: '→' },
};

export default function TradingBias({ defaultData = {}, colors = {}, className = '' }: TradingBiasProps) {
  const {
    background         = '#0d0d0d',
    surface            = '#1a1a1a',
    textPrimary        = '#e2e8f0',
    textSecondary      = '#64748b',
    textMuted          = '#475569',
    currentPriceColor  = '#3b82f6',
    gridColor          = '#1e293b',
    deltaPositive      = '#22c55e',
    deltaNegative      = '#ef4444',
  } = colors;

  const [form, setForm] = useState<Partial<MarketData>>({
    symbol:          'BTCUSDT',
    price:           65000,
    gex:             1.5,
    gexFlipLevel:    63000,
    skew25d:         -2.5,
    callFlowPercent: 55,
    putFlowPercent:  45,
    putCallRatio:    0.82,
    dominantFlow:    'calls',
    expiration:      '0DTE' as OptionsExpiration,
    ...defaultData,
  });

  const [result,    setResult]    = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const updateField = <K extends keyof MarketData>(key: K, value: MarketData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);

    // Auto-compute dominantFlow from percentages
    const data: Partial<MarketData> = {
      ...form,
      dominantFlow:
        (form.callFlowPercent ?? 50) > 55 ? 'calls' :
        (form.putFlowPercent  ?? 50) > 55 ? 'puts'  :
        'neutral',
    };

    try {
      const res = await fetch('/api/ai/analysis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });

      const json = await res.json() as AnalysisResult & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  const biasConfig = result ? BIAS_CONFIG[result.bias] : null;

  // ─── Input field helper ───────────────────────────────────────────────────
  const Field = ({ label, fieldKey, type = 'number', step = '0.01' }: {
    label:    string;
    fieldKey: keyof MarketData;
    type?:    string;
    step?:    string;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[11px]" style={{ color: textMuted }}>{label}</label>
      <input
        type={type}
        step={step}
        value={form[fieldKey] as string | number ?? ''}
        onChange={e => updateField(fieldKey, (type === 'number' ? parseFloat(e.target.value) : e.target.value) as MarketData[typeof fieldKey])}
        className="w-full text-sm px-2 py-1.5 rounded outline-none"
        style={{ backgroundColor: background, color: textPrimary, border: `1px solid ${gridColor}` }}
      />
    </div>
  );

  return (
    <div
      className={`flex flex-col rounded-xl overflow-hidden ${className}`}
      style={{ backgroundColor: surface, border: `1px solid ${gridColor}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: gridColor, backgroundColor: background }}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={currentPriceColor} strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: textPrimary }}>
            Analyse IA — Bias de Marché
          </span>
        </div>
        {result?.meta && (
          <span className="text-[11px]" style={{ color: textMuted }}>
            {new Date(result.meta.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Input Form ─────────────────────────────────────────────────── */}
        <div
          className="w-56 flex-shrink-0 p-3 flex flex-col gap-2 overflow-y-auto border-r"
          style={{ borderColor: gridColor, backgroundColor: background }}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: textMuted }}>
            Données marché
          </p>
          <Field label="Symbole"      fieldKey="symbol"          type="text" />
          <Field label="Prix"         fieldKey="price"           step="1"    />
          <Field label="GEX (en B$)"  fieldKey="gex"             step="0.1"  />
          <Field label="GEX Flip"     fieldKey="gexFlipLevel"    step="100"  />
          <Field label="Skew 25δ (%)" fieldKey="skew25d"         step="0.5"  />
          <Field label="Calls %"      fieldKey="callFlowPercent" step="1"    />
          <Field label="Puts %"       fieldKey="putFlowPercent"  step="1"    />
          <Field label="PCR"          fieldKey="putCallRatio"    step="0.01" />

          <div className="flex flex-col gap-1 mt-1">
            <label className="text-[11px]" style={{ color: textMuted }}>Échéance</label>
            <div className="grid grid-cols-2 gap-1">
              {EXPIRATIONS.map(exp => (
                <button
                  key={exp.value}
                  onClick={() => updateField('expiration', exp.value)}
                  className="py-1 rounded text-xs font-bold transition-all"
                  style={{
                    background: form.expiration === exp.value ? currentPriceColor : surface,
                    color:      form.expiration === exp.value ? '#fff' : textSecondary,
                    border:     `1px solid ${form.expiration === exp.value ? currentPriceColor : gridColor}`,
                  }}
                >
                  {exp.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: textMuted }}>Contexte additionnel</label>
            <textarea
              rows={2}
              placeholder="Ex: NFP demain, support technique majeur..."
              value={form.additionalContext ?? ''}
              onChange={e => updateField('additionalContext', e.target.value)}
              className="text-xs px-2 py-1.5 rounded outline-none resize-none"
              style={{ backgroundColor: surface, color: textPrimary, border: `1px solid ${gridColor}` }}
            />
          </div>

          <button
            onClick={runAnalysis}
            disabled={isLoading}
            className="mt-2 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ backgroundColor: currentPriceColor, color: '#fff' }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Analyse...
              </span>
            ) : (
              'Analyser'
            )}
          </button>
        </div>

        {/* ── Result Panel ───────────────────────────────────────────────── */}
        <div className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: background }}>
          {error && (
            <div className="mb-3 p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: deltaNegative, border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {error}
            </div>
          )}

          {!result && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <p className="text-sm" style={{ color: textMuted }}>
                Remplissez les données et cliquez sur<br />Analyser pour obtenir le bias IA
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: currentPriceColor }} />
              <p className="text-sm" style={{ color: textSecondary }}>
                Analyse en cours…
              </p>
            </div>
          )}

          {result && biasConfig && !isLoading && (
            <div className="space-y-4">
              {/* Bias headline */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: biasConfig.bg, border: `2px solid ${biasConfig.color}40` }}
              >
                <div>
                  <div className="text-2xl font-bold flex items-center gap-2" style={{ color: biasConfig.color }}>
                    <span>{biasConfig.icon}</span>
                    <span>{biasConfig.label}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: textSecondary }}>
                    {result.meta?.symbol} · {result.meta?.price?.toLocaleString()}$
                  </div>
                </div>
                {/* Confidence meter */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-bold" style={{ color: biasConfig.color }}>
                    {result.confidence}%
                  </span>
                  <div className="w-20 h-2 rounded-full overflow-hidden" style={{ backgroundColor: gridColor }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${result.confidence}%`, backgroundColor: biasConfig.color }}
                    />
                  </div>
                  <span className="text-[10px]" style={{ color: textMuted }}>confiance</span>
                </div>
              </div>

              {/* MM Positioning */}
              {result.mmPositioning && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: surface, border: `1px solid ${gridColor}` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: textMuted }}>
                    Positionnement MM
                  </p>
                  <p className="text-sm" style={{ color: textPrimary }}>{result.mmPositioning}</p>
                </div>
              )}

              {/* Reasoning */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: textMuted }}>
                  Raisonnement
                </p>
                <div className="space-y-1.5">
                  {result.reasoning.map((point, i) => (
                    <div key={i} className="flex gap-2 text-sm items-start">
                      <span className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: biasConfig.color, marginTop: 6 }} />
                      <span style={{ color: textPrimary }}>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Levels */}
              {(result.keyLevels.support.length > 0 || result.keyLevels.resistance.length > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  {result.keyLevels.support.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: deltaPositive }}>SUPPORT</p>
                      {result.keyLevels.support.map((lvl, i) => (
                        <p key={i} className="text-sm font-mono" style={{ color: textPrimary }}>${lvl.toLocaleString()}</p>
                      ))}
                    </div>
                  )}
                  {result.keyLevels.resistance.length > 0 && (
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: deltaNegative }}>RÉSISTANCE</p>
                      {result.keyLevels.resistance.map((lvl, i) => (
                        <p key={i} className="text-sm font-mono" style={{ color: textPrimary }}>${lvl.toLocaleString()}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action */}
              {result.action && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: currentPriceColor }}>
                    Approche suggérée
                  </p>
                  <p className="text-sm" style={{ color: textPrimary }}>{result.action}</p>
                </div>
              )}

              {/* Risk Factors */}
              {result.riskFactors.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: textMuted }}>
                    Facteurs de risque / Invalidations
                  </p>
                  <div className="space-y-1">
                    {result.riskFactors.map((risk, i) => (
                      <div key={i} className="flex gap-2 text-sm items-start">
                        <span style={{ color: deltaNegative, marginTop: 2 }}>⚠</span>
                        <span style={{ color: textSecondary }}>{risk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model info */}
              {result.meta && (
                <p className="text-[10px] pt-1 border-t" style={{ color: textMuted, borderColor: gridColor }}>
                  Modèle: {result.meta.model} · {new Date(result.meta.timestamp).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
