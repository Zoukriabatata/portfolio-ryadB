'use client';

import { useState } from 'react';
import type { TradePlan, BiasType, DirectionBias } from '@/lib/analysis/institutionalBias';

interface TradePlanPanelProps {
  plan: TradePlan;
  bias: BiasType;
  direction: DirectionBias;
  biasScore: number;
}

function PlanSection({ title, content, color, defaultOpen = false }: {
  title: string;
  content: string;
  color: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg border overflow-hidden cursor-pointer transition-all duration-200"
      style={{ borderColor: `${color}25`, backgroundColor: `${color}06` }}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium" style={{ color }}>
          {title}
        </span>
        <span
          className="text-xs text-[var(--text-muted)] transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#x25BE;
        </span>
      </div>
      {isOpen && (
        <div className="px-3 pb-2.5 pt-0">
          <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

export function TradePlanPanel({ plan, bias, direction, biasScore }: TradePlanPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const biasColor = bias === 'counter-trend' ? '#22c55e'
    : bias === 'continuation' ? '#f97316' : '#6b7280';

  const dirColor = direction === 'long' ? '#22c55e'
    : direction === 'short' ? '#ef4444' : '#6b7280';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: biasColor }} />
          <span className="text-[11px] font-bold" style={{ color: biasColor }}>
            {plan.headline}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Direction badge */}
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded uppercase"
            style={{ backgroundColor: `${dirColor}15`, color: dirColor }}
          >
            {direction}
          </span>
          {/* Score badge */}
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${biasColor}15`, color: biasColor }}
          >
            {biasScore > 0 ? '+' : ''}{biasScore.toFixed(0)}
          </span>
          <span
            className="text-xs text-[var(--text-muted)] transition-transform duration-200"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            &#x25BE;
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Strategy overview */}
          <div className="rounded-lg bg-[var(--surface-elevated)] px-3 py-2">
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              {plan.strategy}
            </p>
          </div>

          {/* Trade setups */}
          <PlanSection
            title="Long Setup"
            content={plan.longSetup}
            color="#22c55e"
            defaultOpen={direction === 'long'}
          />
          <PlanSection
            title="Short Setup"
            content={plan.shortSetup}
            color="#ef4444"
            defaultOpen={direction === 'short'}
          />
          <PlanSection
            title="Stop Zone"
            content={plan.stopZone}
            color="#eab308"
          />
          <PlanSection
            title="Target Zone"
            content={plan.targetZone}
            color="#3b82f6"
          />

          {/* Reasoning */}
          <div className="rounded-lg border border-[var(--border)] px-3 py-2 space-y-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">Reasoning</span>
            {plan.reasoning.map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[9px] text-[var(--text-muted)] mt-0.5">&#x2022;</span>
                <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
