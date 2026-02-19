'use client';

import { useState, useRef, useEffect } from 'react';
import type { RecordingSession } from '@/lib/replay';
import { useReplayUIStore, type ReplayBookmark } from '@/stores/useReplayUIStore';
import { formatDuration, formatSize, formatDate } from './utils';
import Badge from '@/components/ui/Badge';

interface SessionCardProps {
  session: RecordingSession;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: () => void;
  index: number;
}

export default function SessionCard({
  session,
  isSelected,
  isLoading,
  onSelect,
  index,
}: SessionCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { bookmarks, openSessionInfo, openSessionRename, openSessionDelete } = useReplayUIStore();

  const sessionBookmarks: ReplayBookmark[] = bookmarks[session.id] || [];

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const duration = session.endTime > 0 ? session.endTime - session.startTime : 0;
  const statusVariant = session.status === 'completed' ? 'success' : session.status === 'recording' ? 'error' : 'neutral';

  return (
    <div
      className={`
        p-3 rounded-xl transition-all duration-200 cursor-pointer
        ${isSelected ? 'ring-1' : 'hover:-translate-y-0.5 hover:shadow-lg'}
        animate-slideUp
      `}
      style={{
        background: isSelected ? 'var(--primary-glow)' : 'var(--surface)',
        border: isSelected ? '1px solid var(--primary-dark)' : '1px solid var(--border)',
        borderColor: isSelected ? 'var(--primary-dark)' : undefined,
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'backwards',
      }}
      onClick={onSelect}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold font-mono px-2 py-0.5 rounded-md"
            style={{
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
            }}
          >
            {session.symbol}
          </span>
          <Badge variant={statusVariant} dot={session.status === 'recording'}>
            {session.status}
          </Badge>
        </div>

        {/* Context menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-50 w-32 py-1 rounded-lg shadow-xl animate-scaleIn"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-light)',
                transformOrigin: 'top right',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  openSessionRename(session.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  openSessionInfo(session.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Details
              </button>
              <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  openSessionDelete(session.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--error-bg)]"
                style={{ color: 'var(--error)' }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {session.metadata?.description && (
        <p className="text-xs text-[var(--text-secondary)] mb-2 truncate">
          {session.metadata.description}
        </p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
        <span>{session.tradeCount.toLocaleString()} trades</span>
        <span style={{ color: 'var(--border-light)' }}>·</span>
        <span>{session.depthSnapshotCount} snaps</span>
        <span style={{ color: 'var(--border-light)' }}>·</span>
        <span>{formatDuration(duration)}</span>
      </div>

      {/* Date + Size row */}
      <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
        <span>{formatDate(session.startTime)}</span>
        <span className="font-mono">{formatSize(session.fileSizeEstimate)}</span>
      </div>

      {/* Bookmark dots */}
      {sessionBookmarks.length > 0 && (
        <div className="flex items-center gap-1 mt-2">
          {sessionBookmarks.slice(0, 8).map((bm) => (
            <div
              key={bm.id}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: bm.color }}
              title={bm.label}
            />
          ))}
          {sessionBookmarks.length > 8 && (
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
              +{sessionBookmarks.length - 8}
            </span>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && isSelected && (
        <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
          <div
            className="h-full rounded-full animate-pulse"
            style={{ background: 'var(--primary)', width: '60%' }}
          />
        </div>
      )}
    </div>
  );
}
