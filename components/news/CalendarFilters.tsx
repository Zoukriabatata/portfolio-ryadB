import { SimulationIcon } from '@/components/ui/Icons';
import type { TimeFilter } from '@/types/news';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '\u{1F1FA}\u{1F1F8}', EUR: '\u{1F1EA}\u{1F1FA}', GBP: '\u{1F1EC}\u{1F1E7}',
  JPY: '\u{1F1EF}\u{1F1F5}', AUD: '\u{1F1E6}\u{1F1FA}', CAD: '\u{1F1E8}\u{1F1E6}',
  CHF: '\u{1F1E8}\u{1F1ED}', NZD: '\u{1F1F3}\u{1F1FF}',
};

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Week' },
  { value: 'all', label: 'All' },
];

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

const IMPACT_OPTIONS = [
  { value: 'All', color: '' },
  { value: 'High', color: 'bg-red-500' },
  { value: 'Medium', color: 'bg-orange-500' },
  { value: 'Low', color: 'bg-yellow-500' },
];

// ---------------------------------------------------------------------------
// Pill button
// ---------------------------------------------------------------------------

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 ${
        active
          ? 'bg-[var(--primary)] text-white shadow-md shadow-[var(--primary-glow)]'
          : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] active:scale-95'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CalendarFilters
// ---------------------------------------------------------------------------

export function CalendarFilters({
  time,
  currency,
  impact,
  simulationMode,
  onTimeChange,
  onCurrencyChange,
  onImpactChange,
  onSimulationToggle,
}: {
  time: TimeFilter;
  currency: string;
  impact: string;
  simulationMode: boolean;
  onTimeChange: (v: TimeFilter) => void;
  onCurrencyChange: (v: string) => void;
  onImpactChange: (v: string) => void;
  onSimulationToggle: () => void;
}) {
  return (
    <div className="flex-shrink-0 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Period */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-widest font-semibold pl-1">Period</span>
            <div className="flex items-center gap-1">
              {TIME_OPTIONS.map(opt => (
                <FilterPill key={opt.value} active={time === opt.value} onClick={() => onTimeChange(opt.value)}>
                  {opt.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="w-px h-8 bg-[var(--border)] hidden sm:block" />

          {/* Currency */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-widest font-semibold pl-1">Currency</span>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-[calc(100vw-2rem)] sm:max-w-none relative">
              {CURRENCIES.map(c => (
                <FilterPill key={c} active={currency === c} onClick={() => onCurrencyChange(c)}>
                  {c === 'All' ? 'All' : `${CURRENCY_FLAGS[c] || ''} ${c}`}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="w-px h-8 bg-[var(--border)] hidden sm:block" />

          {/* Impact */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-widest font-semibold pl-1">Impact</span>
            <div className="flex items-center gap-1">
              {IMPACT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onImpactChange(opt.value)}
                  className={`px-2.5 py-1.5 text-xs rounded-full flex items-center gap-1.5 transition-all duration-200 ${
                    impact === opt.value
                      ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-light)]'
                      : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]'
                  }`}
                >
                  {opt.color && <span className={`w-2 h-2 rounded-full ${opt.color}`} />}
                  {opt.value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Simulation toggle */}
        <button
          onClick={onSimulationToggle}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex-shrink-0 ${
            simulationMode
              ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-glow)]'
              : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--primary)]/50'
          }`}
        >
          <SimulationIcon size={14} color={simulationMode ? '#fff' : 'currentColor'} />
          <span>Simulation</span>
          <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${simulationMode ? 'bg-white/20' : 'bg-[var(--surface)]'}`}>
            <div className={`w-3 h-3 rounded-full absolute top-0.5 transition-all duration-300 ${simulationMode ? 'left-[18px] bg-white' : 'left-0.5 bg-[var(--text-dimmed)]'}`} />
          </div>
        </button>
      </div>
    </div>
  );
}
