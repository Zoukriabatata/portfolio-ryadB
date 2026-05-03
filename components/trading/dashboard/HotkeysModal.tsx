'use client';

import { useEffect, useRef } from 'react';

interface Hotkey {
  keys:     string[];
  label:    string;
  desc:     string;
  category: 'orders' | 'positions' | 'navigation';
}

const HOTKEYS: Hotkey[] = [
  // Orders
  { keys: ['B'],      label: 'Buy at market',      desc: 'Place a market BUY for the current symbol & qty',     category: 'orders' },
  { keys: ['S'],      label: 'Sell at market',     desc: 'Place a market SELL for the current symbol & qty',    category: 'orders' },
  { keys: ['Esc'],    label: 'Cancel pending',     desc: 'Cancel ALL pending limit/stop orders on this symbol', category: 'orders' },

  // Positions
  { keys: ['X'],      label: 'Flatten current',    desc: 'Close the open position on the current symbol',       category: 'positions' },
  { keys: ['F'],      label: 'Flatten all',        desc: 'Close every open position across symbols',            category: 'positions' },

  // Navigation
  { keys: ['+'],      label: 'Zoom in',            desc: 'Smart zoom into the chart',                           category: 'navigation' },
  { keys: ['−'],      label: 'Zoom out',           desc: 'Smart zoom out (blocked while in position)',          category: 'navigation' },
  { keys: ['Ctrl', '0'], label: 'Reset view',      desc: 'Reset the chart viewport',                            category: 'navigation' },
  { keys: ['→'],      label: 'Next timeframe',     desc: 'Switch to the next timeframe up (1m → 5m → 15m…)',    category: 'navigation' },
  { keys: ['←'],      label: 'Previous timeframe', desc: 'Switch to the next timeframe down',                   category: 'navigation' },
  { keys: ['?'],      label: 'Show shortcuts',     desc: 'Toggle the keyboard shortcuts overlay',               category: 'navigation' },
];

const CATEGORY_LABELS: Record<Hotkey['category'], string> = {
  orders:     'Orders',
  positions:  'Positions',
  navigation: 'Chart navigation',
};

interface HotkeysModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

export default function HotkeysModal({ isOpen, onClose }: HotkeysModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const click = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', click), 100);
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const grouped = HOTKEYS.reduce<Record<string, Hotkey[]>>((acc, h) => {
    (acc[h.category] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              for /live trading
            </span>
          </div>
          <button onClick={onClose} className="text-xl leading-none px-2 hover:opacity-70" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {(Object.keys(grouped) as Hotkey['category'][]).map(cat => (
            <section key={cat}>
              <h3 className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {CATEGORY_LABELS[cat]}
              </h3>
              <div className="flex flex-col gap-1.5">
                {grouped[cat].map((h, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 px-2 rounded transition-colors hover:bg-[var(--surface-elevated)]">
                    <div className="flex items-center gap-1 shrink-0 w-24 flex-wrap">
                      {h.keys.map((k, j) => (
                        <span
                          key={j}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums"
                          style={{
                            background: 'var(--surface-elevated)',
                            color:      'var(--text-primary)',
                            border:     '1px solid var(--border)',
                            boxShadow:  '0 1px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                          }}
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {h.label}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {h.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div
            className="text-[11px] p-2.5 rounded mt-2"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            ℹ Shortcuts only fire when no input field is focused. Click anywhere on the chart first if a key isn't responding.
          </div>
        </div>
      </div>
    </div>
  );
}
