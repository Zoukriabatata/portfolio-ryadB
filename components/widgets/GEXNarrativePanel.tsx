'use client';

import { useState, useMemo } from 'react';
import { generateNarrative, type NarrativeSection } from '@/lib/intelligence/gexNarrative';
import type { MultiGreekSummary } from '@/types/options';

interface GEXNarrativePanelProps {
  summary: MultiGreekSummary;
  spotPrice: number;
}

function SectionCard({ section, isExpanded, onToggle }: {
  section: NarrativeSection;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const implColor = section.implication === 'bullish' ? '#22c55e'
    : section.implication === 'bearish' ? '#ef4444' : '#6b7280';

  return (
    <div
      className="rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer hover:border-opacity-50"
      style={{ borderColor: `${section.color}30`, backgroundColor: `${section.color}08` }}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold w-5 text-center"
            style={{ color: section.color }}
          >
            {section.symbol}
          </span>
          <span className="text-[11px] text-[var(--text-primary)] font-medium">
            {section.greek}
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase"
            style={{
              backgroundColor: `${implColor}15`,
              color: implColor,
            }}
          >
            {section.implication}
          </span>
        </div>
        <span className="text-[var(--text-muted)] text-xs transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </div>

      {isExpanded && (
        <div className="px-3 pb-2.5 pt-0">
          <p className="text-[10px] font-medium mb-1" style={{ color: section.color }}>
            {section.title}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            {section.body}
          </p>
        </div>
      )}
    </div>
  );
}

export function GEXNarrativePanel({ summary, spotPrice }: GEXNarrativePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));

  const narrative = useMemo(() =>
    generateNarrative(summary, spotPrice),
  [summary, spotPrice]);

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const severityBg = narrative.severity === 'high' ? 'animate-pulse' : '';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${severityBg}`}
            style={{ backgroundColor: narrative.headlineColor }}
          />
          <span
            className="text-[11px] font-bold"
            style={{ color: narrative.headlineColor }}
          >
            {narrative.headline}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--text-muted)]">
            Updated {new Date(narrative.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[var(--text-muted)] text-xs transition-transform duration-200"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            ▾
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Greek sections */}
          {narrative.sections.map((section, i) => (
            <SectionCard
              key={section.greek}
              section={section}
              isExpanded={expandedSections.has(i)}
              onToggle={() => toggleSection(i)}
            />
          ))}

          {/* Key Levels */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--surface-elevated)] rounded-lg text-[9px] text-[var(--text-muted)] font-mono">
            <span className="text-[var(--text-secondary)]">Key Levels:</span>
            {narrative.keyLevels}
          </div>
        </div>
      )}
    </div>
  );
}
