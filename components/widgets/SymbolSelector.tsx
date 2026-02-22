'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';

// Symbol groups
const symbolGroups = [
  {
    label: 'Crypto Futures',
    tag: 'Live',
    tagColor: 'text-[var(--success)] bg-[var(--success-bg)]',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ARBUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT'] as Symbol[],
  },
  {
    label: 'CME Index',
    tag: 'License',
    tagColor: 'text-[var(--info)] bg-[var(--info-bg)]',
    symbols: ['NQ', 'MNQ', 'ES', 'MES'] as Symbol[],
  },
  {
    label: 'CME Gold',
    tag: 'License',
    tagColor: 'text-[var(--warning)] bg-[var(--warning-bg)]',
    symbols: ['GC', 'MGC'] as Symbol[],
  },
];

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function SymbolSelector() {
  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const currentPrice = useMarketStore((s) => s.currentPrice);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const setTimeframe = useMarketStore((s) => s.setTimeframe);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const formatPrice = (price: number) => {
    if (price === 0) return '---';
    const decimals = price < 1 ? 5 : price < 10 ? 4 : price < 100 ? 3 : 2;
    return price.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const symbolInfo = SYMBOLS[symbol];
  const currentExchange = symbolInfo?.exchange;
  const isCrypto = currentExchange === 'binance';

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  const handleSelect = useCallback((s: Symbol) => {
    setSymbol(s);
    setIsOpen(false);
    setSearch('');
  }, [setSymbol]);

  // Filter symbols by search
  const filteredGroups = symbolGroups.map(group => ({
    ...group,
    symbols: group.symbols.filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      const info = SYMBOLS[s];
      return s.toLowerCase().includes(q) || (info?.name || '').toLowerCase().includes(q);
    }),
  })).filter(g => g.symbols.length > 0);

  return (
    <div className="flex items-center gap-4">
      {/* Symbol Dropdown */}
      <div ref={dropdownRef} className="relative">
        {/* Trigger button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 hover:border-[var(--border-light)] active:scale-[0.97]"
          style={{
            background: 'var(--surface)',
            borderColor: isOpen ? 'var(--primary)' : 'var(--border)',
            boxShadow: isOpen ? '0 0 0 2px var(--primary-glow)' : 'none',
          }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{SYMBOLS[symbol]?.name || symbol}</span>

          {/* Exchange badge */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            currentExchange === 'binance'
              ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
              : currentExchange === 'tradovate'
              ? 'bg-[var(--info-bg)] text-[var(--info)]'
              : 'text-[var(--text-muted)]'
          }`} style={currentExchange !== 'binance' && currentExchange !== 'tradovate' ? { background: 'var(--surface-elevated)' } : undefined}>
            {currentExchange === 'binance' ? 'Binance' : currentExchange === 'tradovate' ? 'CME' : currentExchange}
          </span>

          {/* Live dot */}
          {isCrypto && (
            <span className="w-2 h-2 rounded-full live-dot" style={{ backgroundColor: 'var(--success)' }} />
          )}

          {/* Chevron */}
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div
            className="absolute top-full left-0 mt-2 w-72 rounded-xl overflow-hidden"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
              zIndex: 'var(--z-dropdown, 100)',
              animation: 'dropdownIn 0.2s ease-out',
              transformOrigin: 'top left',
            }}
          >
            {/* Search input */}
            <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-dimmed)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
              </div>
            </div>

            {/* Symbol list */}
            <div className="max-h-64 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
              {filteredGroups.map((group) => (
                <div key={group.label}>
                  {/* Group header */}
                  <div className="flex items-center justify-between px-3 py-1.5 mt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{group.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${group.tagColor}`}>{group.tag}</span>
                  </div>

                  {/* Symbols */}
                  {group.symbols.map((s) => {
                    const info = SYMBOLS[s];
                    const isActive = s === symbol;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSelect(s)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left transition-all duration-150 hover:bg-[var(--surface-hover)] active:scale-[0.99]"
                        style={{
                          background: isActive ? 'var(--primary-glow)' : undefined,
                          color: isActive ? 'var(--primary-light)' : 'var(--text-secondary)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                          )}
                          <span className={`text-sm font-medium ${isActive ? '' : 'ml-3.5'}`}>{info?.name || s}</span>
                          <span className="text-[10px] font-mono" style={{ color: 'var(--text-dimmed)' }}>{s}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}

              {filteredGroups.length === 0 && (
                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>No symbols found</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Current Price */}
      <div className="text-xl font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
        ${formatPrice(currentPrice)}
      </div>

      {/* Timeframe Selector */}
      <div className="flex items-center rounded-lg border p-0.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
              ${timeframe === tf
                ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }
            `}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
