'use client';

import { useEffect } from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Drawing Tools',
    shortcuts: [
      { keys: ['V'], desc: 'Cursor' },
      { keys: ['C'], desc: 'Crosshair' },
      { keys: ['T'], desc: 'Trend Line' },
      { keys: ['H'], desc: 'Horizontal Line' },
      { keys: ['R'], desc: 'Rectangle' },
      { keys: ['L'], desc: 'Long Position' },
      { keys: ['S'], desc: 'Short Position' },
      { keys: ['Del'], desc: 'Delete selected tool' },
      { keys: ['Esc'], desc: 'Deselect / Cancel' },
    ],
  },
  {
    title: 'Chart Navigation',
    shortcuts: [
      { keys: ['+'], desc: 'Zoom in' },
      { keys: ['-'], desc: 'Zoom out' },
      { keys: ['Ctrl', '0'], desc: 'Fit content to view' },
      { keys: ['Ctrl', 'Scroll'], desc: 'Smart zoom' },
    ],
  },
  {
    title: 'Trading (when trade bar open)',
    shortcuts: [
      { keys: ['B'], desc: 'Quick buy (market)' },
      { keys: ['S'], desc: 'Quick sell (market)' },
      { keys: ['X'], desc: 'Close current position' },
      { keys: ['F'], desc: 'Flatten all positions' },
      { keys: ['←'], desc: 'Lower timeframe' },
      { keys: ['→'], desc: 'Higher timeframe' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'S'], desc: 'Screenshot chart' },
      { keys: ['?'], desc: 'Show this help' },
    ],
  },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" />

      {/* Modal */}
      <div
        className="relative w-[420px] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl animate-scaleIn"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-light)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmed)" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto max-h-[60vh] space-y-5">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-dimmed)' }}>
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{shortcut.desc}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>+</span>}
                          <kbd
                            className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded text-[11px] font-mono font-medium"
                            style={{
                              backgroundColor: 'var(--surface)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            }}
                          >
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2.5 border-t text-center" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            Press <kbd className="px-1 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Esc</kbd> to close
          </span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shortcutsIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      ` }} />
    </div>
  );
}
