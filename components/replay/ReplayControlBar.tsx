'use client';

import type { ReplayState } from '@/lib/replay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import ReplayProgressBar from './ReplayProgressBar';
import { formatTime, SPEED_OPTIONS } from './utils';

interface ReplayControlBarProps {
  state: ReplayState;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;
}

export default function ReplayControlBar({
  state,
  play,
  pause,
  stop,
  seek,
  setSpeed,
}: ReplayControlBarProps) {
  const { bookmarks } = useReplayUIStore();
  const sessionBookmarks = state.sessionId ? bookmarks[state.sessionId] || [] : [];

  const isPlaying = state.status === 'playing';
  const duration = state.endTime - state.startTime;

  // Step seek: ±5s worth of progress
  const stepProgress = duration > 0 ? 5000 / duration : 0;
  const bigStepProgress = duration > 0 ? 30000 / duration : 0;

  const handleStepBack = () => seek(Math.max(0, state.progress - bigStepProgress));
  const handlePrev = () => seek(Math.max(0, state.progress - stepProgress));
  const handleNext = () => seek(Math.min(1, state.progress + stepProgress));
  const handleStepForward = () => seek(Math.min(1, state.progress + bigStepProgress));

  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-2xl animate-slideUp"
      style={{
        background: 'rgba(10, 10, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
      }}
    >
      {/* REPLAY badge */}
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
        style={{
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: 'var(--primary)',
            animation: isPlaying ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
        <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'var(--primary)' }}>
          REPLAY
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Transport controls */}
      <div className="flex items-center gap-0.5">
        {/* Jump to start */}
        <button
          onClick={handleStepBack}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          title="Back 30s (Shift+←)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="5" width="3" height="14" />
            <polygon points="21,5 21,19 9,12" />
          </svg>
        </button>

        {/* Prev (5s) */}
        <button
          onClick={handlePrev}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          title="Back 5s (←)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19,5 19,19 7,12" />
            <rect x="3" y="5" width="2" height="14" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={isPlaying ? pause : play}
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-all"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: 'var(--primary)',
          }}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>

        {/* Next (5s) */}
        <button
          onClick={handleNext}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          title="Forward 5s (→)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,5 5,19 17,12" />
            <rect x="19" y="5" width="2" height="14" />
          </svg>
        </button>

        {/* Jump forward */}
        <button
          onClick={handleStepForward}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          title="Forward 30s (Shift+→)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="3,5 3,19 15,12" />
            <rect x="18" y="5" width="3" height="14" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Progress bar */}
      <div className="w-48">
        <ReplayProgressBar
          progress={state.progress}
          startTime={state.startTime}
          endTime={state.endTime}
          bookmarks={sessionBookmarks}
          onSeek={seek}
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Speed selector (scrollable) */}
      <div className="flex items-center gap-0.5 max-w-[200px] overflow-x-auto no-scrollbar">
        {SPEED_OPTIONS.map((s) => {
          const label = s >= 60 ? `${s / 60}m` : s >= 1 ? `${s}x` : `${s}x`;
          return (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className="px-1.5 py-1 rounded-md text-[10px] font-mono font-semibold transition-all shrink-0"
              style={{
                background: state.speed === s ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                color: state.speed === s ? 'var(--primary)' : 'rgba(255,255,255,0.35)',
                border: state.speed === s ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Time display */}
      <span className="text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {formatTime(state.currentTime)}
        <span style={{ color: 'rgba(255,255,255,0.15)' }}> / </span>
        {formatTime(state.endTime)}
      </span>

      {/* Stop button */}
      <button
        onClick={stop}
        className="ml-0.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors hover:bg-white/10"
        style={{
          color: 'var(--text-muted)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        Stop
      </button>
    </div>
  );
}
