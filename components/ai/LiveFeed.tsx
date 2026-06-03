'use client';

import { useEffect, useRef } from 'react';
import type { FeedEntry } from '@/hooks/useLiveAgent';
import { SEVERITY_COLOR, MODE_STYLE } from '@/lib/ai/colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

// ─── Single feed entry ────────────────────────────────────────────────────────

function FeedRow({ entry, isNew }: { entry: FeedEntry; isNew: boolean }) {
  const sevColor = SEVERITY_COLOR[entry.severity] ?? SEVERITY_COLOR.MEDIUM;
  const mode     = MODE_STYLE[entry.mode] ?? MODE_STYLE.UPDATE;

  return (
    <div
      className="flex items-start gap-3 px-4 py-2 border-b transition-colors duration-500"
      style={{
        borderColor: 'var(--border)',
        background:  isNew ? 'var(--surface-hover)' : 'transparent',
      }}
    >
      {/* Severity dot */}
      <div className="flex-shrink-0 mt-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: sevColor }} />
      </div>

      {/* Time */}
      <span className="flex-shrink-0 text-[10px] font-mono tabular-nums mt-0.5"
        style={{ color: 'var(--text-muted)', minWidth: 52 }}>
        {formatTime(entry.time)}
      </span>

      {/* Event type */}
      <span className="flex-shrink-0 text-[10px] font-bold mt-0.5"
        style={{ color: sevColor, minWidth: 160 }}>
        {entry.event.replace(/_/g, ' ')}
      </span>

      {/* Mode badge */}
      <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5"
        style={{ background: mode.bg, color: mode.color }}>
        {entry.mode}
      </span>

      {/* Description */}
      <span className="text-[10px] leading-relaxed min-w-0 flex-1"
        style={{ color: 'var(--text-secondary)' }}>
        {entry.message}
      </span>
    </div>
  );
}

// ─── Main feed ────────────────────────────────────────────────────────────────

interface LiveFeedProps {
  entries:    FeedEntry[];
  maxHeight?: number;   // px — ignored when fill=true
  fill?:      boolean;  // fill parent height (flex-1 parent required)
  className?: string;
}

export function LiveFeed({ entries, maxHeight = 220, fill = false, className = '' }: LiveFeedProps) {
  const topRef    = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    if (entries.length > prevCount.current) {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCount.current = entries.length;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className={`flex items-center justify-center text-[11px] ${className}`}
        style={{ height: fill ? '100%' : 60, color: 'var(--text-muted)' }}>
        En attente d'événements…
      </div>
    );
  }

  return (
    <div
      className={`overflow-y-auto custom-scrollbar ${fill ? 'h-full' : ''} ${className}`}
      style={fill ? undefined : { maxHeight }}
    >
      <div ref={topRef} />
      {entries.map((entry, i) => (
        <FeedRow key={`${entry.time}-${entry.event}-${i}`} entry={entry} isNew={i === 0} />
      ))}
    </div>
  );
}
