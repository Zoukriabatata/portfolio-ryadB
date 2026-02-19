'use client';

import { useJournalStore } from '@/stores/useJournalStore';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import { SETUPS, EMOTIONS } from '@/types/journal';

const SYMBOLS = Object.keys(CME_CONTRACTS);

export default function TradeFilters() {
  const { tradeFilters, setTradeFilters, resetTradeFilters } = useJournalStore();

  const hasActiveFilters =
    tradeFilters.dateFrom || tradeFilters.dateTo ||
    tradeFilters.symbols.length > 0 || tradeFilters.setups.length > 0 ||
    tradeFilters.emotions.length > 0 || tradeFilters.side !== 'ALL' ||
    tradeFilters.pnlMin !== null || tradeFilters.pnlMax !== null;

  const selectStyle = 'px-2.5 py-1.5 rounded-lg text-xs bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors';
  const inputStyle = 'px-2.5 py-1.5 rounded-lg text-xs bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors w-28';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Date Range */}
      <input
        type="date"
        value={tradeFilters.dateFrom || ''}
        onChange={(e) => setTradeFilters({ dateFrom: e.target.value || null })}
        className={inputStyle}
        title="From date"
      />
      <span className="text-[var(--text-dimmed)] text-xs">to</span>
      <input
        type="date"
        value={tradeFilters.dateTo || ''}
        onChange={(e) => setTradeFilters({ dateTo: e.target.value || null })}
        className={inputStyle}
        title="To date"
      />

      <div className="w-px h-5 bg-[var(--border)]" />

      {/* Symbol */}
      <select
        value={tradeFilters.symbols[0] || ''}
        onChange={(e) => setTradeFilters({ symbols: e.target.value ? [e.target.value] : [] })}
        className={selectStyle}
      >
        <option value="">All Symbols</option>
        {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Side */}
      <select
        value={tradeFilters.side}
        onChange={(e) => setTradeFilters({ side: e.target.value as 'ALL' | 'LONG' | 'SHORT' })}
        className={selectStyle}
      >
        <option value="ALL">All Sides</option>
        <option value="LONG">Long</option>
        <option value="SHORT">Short</option>
      </select>

      {/* Setup */}
      <select
        value={tradeFilters.setups[0] || ''}
        onChange={(e) => setTradeFilters({ setups: e.target.value ? [e.target.value] : [] })}
        className={selectStyle}
      >
        <option value="">All Setups</option>
        {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Emotion */}
      <select
        value={tradeFilters.emotions[0] || ''}
        onChange={(e) => setTradeFilters({ emotions: e.target.value ? [e.target.value] : [] })}
        className={selectStyle}
      >
        <option value="">All Emotions</option>
        {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
      </select>

      <div className="w-px h-5 bg-[var(--border)]" />

      {/* P&L Range */}
      <input
        type="number"
        value={tradeFilters.pnlMin ?? ''}
        onChange={(e) => setTradeFilters({ pnlMin: e.target.value ? parseFloat(e.target.value) : null })}
        className={`${inputStyle} w-20`}
        placeholder="P&L min"
      />
      <input
        type="number"
        value={tradeFilters.pnlMax ?? ''}
        onChange={(e) => setTradeFilters({ pnlMax: e.target.value ? parseFloat(e.target.value) : null })}
        className={`${inputStyle} w-20`}
        placeholder="P&L max"
      />

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={resetTradeFilters}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
