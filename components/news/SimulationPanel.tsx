'use client';

import { useState, useMemo } from 'react';
import type { EconomicEvent } from '@/types/news';
import { getEventRange, simulateImpact } from '@/lib/news/impactSimulation';
import { ImpactChart } from './ImpactChart';

const SENTIMENT_COLORS = {
  bullish: 'text-[var(--bull)]',
  bearish: 'text-[var(--bear)]',
  neutral: 'text-[var(--text-muted)]',
};

const DEVIATION_STYLES = {
  beat: { text: 'text-[var(--bull)]', bg: 'bg-[var(--bull-bg)]' },
  miss: { text: 'text-[var(--bear)]', bg: 'bg-[var(--bear-bg)]' },
  inline: { text: 'text-[var(--text-muted)]', bg: 'bg-[var(--surface-elevated)]' },
};

export function SimulationPanel({ event }: { event: EconomicEvent }) {
  const range = getEventRange(event.event);
  const forecastNum = event.forecast ? parseFloat(event.forecast) : (range.min + range.max) / 2;
  const [value, setValue] = useState(forecastNum);

  const result = useMemo(
    () => simulateImpact(event.event, value, forecastNum, event.impact),
    [event.event, event.impact, value, forecastNum]
  );

  const isPositive = result.priceChange >= 0;
  const barWidth = Math.min(Math.abs(result.priceChange) * 15, 100);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--primary)]/20 space-y-4 animate-fadeIn">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <h4 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
          What-If Simulation
        </h4>
      </div>

      {/* Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">
            What if <span className="font-semibold text-[var(--text-primary)]">{event.event}</span> comes in at:
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={value}
              onChange={e => setValue(parseFloat(e.target.value) || range.min)}
              step={range.step}
              min={range.min}
              max={range.max}
              className="w-20 px-2 py-1 text-sm font-mono font-bold text-center bg-[var(--surface-elevated)] text-[var(--text-primary)] rounded-lg border border-[var(--border)] focus:border-[var(--primary)] focus:outline-none transition-colors"
            />
            <span className="text-xs text-[var(--text-muted)] font-mono">{range.unit}</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={value}
            onChange={e => setValue(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--bear) 0%, var(--surface-hover) 50%, var(--bull) 100%)`,
            }}
          />
          {/* Forecast marker */}
          <div
            className="absolute top-0 h-1.5 w-0.5 bg-[var(--warning)]"
            style={{ left: `${((forecastNum - range.min) / (range.max - range.min)) * 100}%` }}
            title={`Forecast: ${forecastNum}${range.unit}`}
          />
        </div>

        <div className="flex justify-between text-[9px] text-[var(--text-dimmed)] font-mono">
          <span>{range.min}{range.unit}</span>
          <span className="text-[var(--warning)]">Fcst: {forecastNum.toFixed(range.step < 1 ? 2 : 0)}{range.unit}</span>
          <span>{range.max}{range.unit}</span>
        </div>
      </div>

      {/* Result */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {/* Deviation */}
        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-1">Verdict</span>
          <span className={`text-sm font-bold uppercase ${DEVIATION_STYLES[result.deviation].text}`}>
            {result.deviation}
          </span>
        </div>

        {/* Price */}
        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-1">Price</span>
          <span className={`text-sm font-bold font-mono ${isPositive ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
            {isPositive ? '+' : ''}{result.priceChange.toFixed(1)}%
          </span>
          <div className="w-full h-1 rounded-full bg-[var(--surface)] mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isPositive ? 'bg-[var(--bull)]' : 'bg-[var(--bear)]'}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Volume */}
        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-1">Volume</span>
          <span className="text-sm font-bold font-mono text-[var(--accent)]">
            {result.volumeMultiplier}x
          </span>
        </div>

        {/* IV */}
        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-1">IV Change</span>
          <span className="text-sm font-bold font-mono text-[var(--primary)]">
            +{result.volatilityChange}pts
          </span>
        </div>

        {/* Sentiment */}
        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-1">Sentiment</span>
          <span className={`text-sm font-bold capitalize ${SENTIMENT_COLORS[result.sentiment]}`}>
            {result.sentiment}
          </span>
        </div>
      </div>

      {/* Impact Chart */}
      <div className="rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] p-2">
        <div className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-wider mb-1 px-1 font-semibold">
          Simulated Price Reaction
        </div>
        <ImpactChart data={result.chartData} deviation={result.deviation} />
      </div>
    </div>
  );
}
