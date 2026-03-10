'use client';

import { useState, useRef, useEffect } from 'react';
import { useNewsThemeStore } from '@/stores/useNewsThemeStore';
import { NEWS_THEMES } from '@/lib/news/newsThemes';
import type { NewsThemeId } from '@/types/news';

const THEME_GROUPS: { label: string; ids: NewsThemeId[] }[] = [
  {
    label: 'Dark',
    ids: ['senzoukria', 'atas', 'bookmap', 'sierra', 'tradingview', 'midnight', 'bloomberg', 'dracula', 'nord', 'obsidian'],
  },
  {
    label: 'Other',
    ids: ['highcontrast', 'light'],
  },
];

export function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const theme = useNewsThemeStore(s => s.theme);
  const setTheme = useNewsThemeStore(s => s.setTheme);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentTheme = NEWS_THEMES[theme];

  return (
    <div ref={ref} className="relative">
      {/* Trigger button — shows current theme swatches */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-all duration-150 active:scale-95"
        title="Change theme"
      >
        {/* Mini swatches */}
        <div className="flex gap-0.5">
          {currentTheme.preview.map((color, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
            />
          ))}
        </div>
        <span className="text-[11px] font-medium text-[var(--text-secondary)] hidden sm:block">
          {currentTheme.name}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--text-dimmed)]">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-xl border border-[var(--border)] shadow-2xl z-50 overflow-hidden animate-fadeIn"
          style={{
            width: 220,
            backgroundColor: 'var(--surface)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dimmed)]">
              Theme
            </span>
          </div>

          <div className="py-1 max-h-[400px] overflow-y-auto">
            {THEME_GROUPS.map(group => (
              <div key={group.label}>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-dimmed)]">
                    {group.label}
                  </span>
                </div>

                {group.ids.map(id => {
                  const t = NEWS_THEMES[id];
                  const isActive = theme === id;

                  return (
                    <button
                      key={id}
                      onClick={() => { setTheme(id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 transition-all duration-100 ${
                        isActive
                          ? 'bg-[var(--primary)]/10'
                          : 'hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {/* Color swatches */}
                      <div className="flex gap-1 flex-shrink-0">
                        {t.preview.map((color, i) => (
                          <div
                            key={i}
                            className="w-3.5 h-3.5 rounded-full border border-[rgba(255,255,255,0.12)]"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      {/* Name + label */}
                      <div className="flex-1 text-left min-w-0">
                        <div
                          className="text-[11px] font-semibold leading-tight"
                          style={{ color: isActive ? 'var(--primary)' : 'var(--text-primary)' }}
                        >
                          {t.name}
                        </div>
                        <div className="text-[9px] text-[var(--text-dimmed)] truncate">
                          {t.label}
                        </div>
                      </div>

                      {/* Active check */}
                      {isActive && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--primary)', flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
