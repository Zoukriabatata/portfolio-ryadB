'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { ReplayBookmark } from '@/stores/useReplayUIStore';
import { formatTime } from './utils';

interface ReplayProgressBarProps {
  progress: number;
  startTime: number;
  endTime: number;
  bookmarks: ReplayBookmark[];
  onSeek: (progress: number) => void;
}

export default function ReplayProgressBar({
  progress,
  startTime,
  endTime,
  bookmarks,
  onSeek,
}: ReplayProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const getProgressFromEvent = useCallback(
    (clientX: number) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      const p = getProgressFromEvent(e.clientX);
      onSeek(p);

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const prog = getProgressFromEvent(ev.clientX);
        onSeek(prog);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [getProgressFromEvent, onSeek]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverProgress(p);
      setHoverX(e.clientX - rect.left);
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    if (!isDragging.current) {
      setHoverProgress(null);
    }
  }, []);

  // Calculate hover time
  const duration = endTime - startTime;
  const hoverTime = hoverProgress !== null ? startTime + hoverProgress * duration : null;

  return (
    <div className="relative flex-1 group">
      {/* Hover time tooltip */}
      {hoverTime !== null && !isDragging.current && (
        <div
          className="absolute -top-8 z-10 px-2 py-1 rounded-md text-[10px] font-mono pointer-events-none animate-fadeIn"
          style={{
            left: Math.max(20, Math.min(hoverX, (barRef.current?.offsetWidth || 200) - 40)),
            transform: 'translateX(-50%)',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-primary)',
          }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Track */}
      <div
        ref={barRef}
        className="h-1.5 group-hover:h-2.5 rounded-full cursor-pointer transition-all duration-150 relative"
        style={{ background: 'var(--surface-elevated)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Fill */}
        <div
          className="h-full rounded-full relative"
          style={{
            width: `${progress * 100}%`,
            background: 'var(--primary)',
            transition: isDragging.current ? 'none' : 'width 100ms linear',
          }}
        >
          {/* Thumb */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'var(--text-primary)',
              transform: 'translate(50%, -50%)',
            }}
          />
        </div>

        {/* Bookmark markers */}
        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full z-10"
            style={{
              left: `${bm.progress * 100}%`,
              background: bm.color,
              transform: 'translate(-50%, -50%)',
            }}
            title={bm.label}
          />
        ))}
      </div>
    </div>
  );
}
