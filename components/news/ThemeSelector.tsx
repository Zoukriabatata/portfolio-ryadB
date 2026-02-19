'use client';

import { useState, useRef, useEffect } from 'react';
import { useNewsThemeStore } from '@/stores/useNewsThemeStore';
import { NEWS_THEMES } from '@/lib/news/newsThemes';
import type { NewsThemeId } from '@/types/news';

const THEME_LIST: NewsThemeId[] = ['senzoukria', 'atas', 'bookmap', 'sierra', 'highcontrast'];

export function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const theme = useNewsThemeStore(s => s.theme);
  const setTheme = useNewsThemeStore(s => s.setTheme);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-all duration-200 active:scale-95"
        title="Change theme"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl z-50 overflow-hidden animate-fadeIn">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-widest font-semibold">Theme</span>
          </div>
          {THEME_LIST.map(id => {
            const t = NEWS_THEMES[id];
            const isActive = theme === id;
            return (
              <button
                key={id}
                onClick={() => { setTheme(id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--primary)]/10 text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {/* Color swatches */}
                <div className="flex gap-1 flex-shrink-0">
                  {t.preview.map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-[var(--border)]"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-xs font-semibold">{t.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{t.label}</div>
                </div>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
