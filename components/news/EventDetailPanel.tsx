import type { EconomicEvent, EventDetail } from '@/types/news';
import { getEventDetail } from '@/lib/news/eventDatabase';
import { generateImpactChart } from '@/lib/news/impactSimulation';
import { ImpactChart } from './ImpactChart';

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-widest font-semibold mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function EventDetailPanel({ event }: { event: EconomicEvent }) {
  const detail: EventDetail | null = getEventDetail(event.event);

  if (!detail) {
    return (
      <div className="mt-3 pt-3 border-t border-[var(--border)] animate-fadeIn">
        <p className="text-xs text-[var(--text-muted)] italic">
          No detailed information available for this event.
        </p>
      </div>
    );
  }

  const deviation = event.deviation || 'inline';
  const impactData = generateImpactChart(event.event, deviation, event.impact);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-4 animate-fadeIn">
      {/* Description */}
      <Section title="What is it?">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{detail.description}</p>
      </Section>

      {/* Why it matters */}
      <Section title="Why it matters">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{detail.whyItMatters}</p>
      </Section>

      {/* Event metadata */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          {detail.frequency}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
          {detail.releaseTime}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)]">
          {detail.source}
        </span>
      </div>

      {/* Affected pairs */}
      <Section title="Affected Pairs">
        <div className="flex flex-wrap gap-1.5">
          {detail.affectedPairs.map(pair => (
            <span key={pair} className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              {pair}
            </span>
          ))}
        </div>
      </Section>

      {/* Typical Reactions */}
      <Section title="Typical Reactions">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-[var(--bull-bg)] border border-[var(--bull)]/10">
            <span className="text-[10px] font-bold text-[var(--bull)] uppercase">Beat</span>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{detail.typicalReaction.beat}</p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bear-bg)] border border-[var(--bear)]/10">
            <span className="text-[10px] font-bold text-[var(--bear)] uppercase">Miss</span>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{detail.typicalReaction.miss}</p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)]">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Inline</span>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{detail.typicalReaction.inline}</p>
          </div>
        </div>
      </Section>

      {/* Risk Scenarios */}
      <Section title="Risk Analysis">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Bearish */}
          <div className="p-3 rounded-lg bg-[var(--bear-bg)] border border-[var(--bear)]/10">
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bear)" strokeWidth="2" strokeLinecap="round">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                <polyline points="17 18 23 18 23 12" />
              </svg>
              <span className="text-xs font-bold text-[var(--bear)]">Bearish Scenario</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                detail.riskScenarios.bearish.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                detail.riskScenarios.bearish.severity === 'medium' ? 'bg-orange-500/20 text-orange-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {detail.riskScenarios.bearish.severity}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--bear)] mb-1">{detail.riskScenarios.bearish.condition}</p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{detail.riskScenarios.bearish.explanation}</p>
          </div>

          {/* Bullish */}
          <div className="p-3 rounded-lg bg-[var(--bull-bg)] border border-[var(--bull)]/10">
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bull)" strokeWidth="2" strokeLinecap="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              <span className="text-xs font-bold text-[var(--bull)]">Bullish Scenario</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                detail.riskScenarios.bullish.severity === 'high' ? 'bg-green-500/20 text-green-400' :
                detail.riskScenarios.bullish.severity === 'medium' ? 'bg-orange-500/20 text-orange-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {detail.riskScenarios.bullish.severity}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--bull)] mb-1">{detail.riskScenarios.bullish.condition}</p>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{detail.riskScenarios.bullish.explanation}</p>
          </div>
        </div>

        {/* Key Level */}
        <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/15 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            <span className="font-semibold text-[var(--warning)]">Key Level: </span>
            {detail.keyLevelToWatch}
          </p>
        </div>
      </Section>

      {/* Impact Chart */}
      <Section title={`Simulated Impact Pattern (${deviation})`}>
        <div className="rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] p-2">
          <ImpactChart data={impactData} deviation={deviation} />
        </div>
      </Section>
    </div>
  );
}
