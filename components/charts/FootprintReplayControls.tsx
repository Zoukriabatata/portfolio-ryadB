'use client';

import { useCallback } from 'react';

export interface ReplayState {
  active: boolean;
  currentIndex: number;
  totalCandles: number;
  speed: 1 | 2 | 5 | 10;
  playing: boolean;
}

interface FootprintReplayControlsProps {
  state: ReplayState;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStart: () => void;
  onEnd: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: 1 | 2 | 5 | 10) => void;
  onExit: () => void;
  candleTime?: number;
}

export default function FootprintReplayControls({
  state,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onStart,
  onEnd,
  onSeek,
  onSpeedChange,
  onExit,
  candleTime,
}: FootprintReplayControlsProps) {
  const { currentIndex, totalCandles, speed, playing } = state;

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(Number(e.target.value));
  }, [onSeek]);

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '--:--:--';
    const d = new Date(timestamp * 1000);
    return d.toLocaleTimeString('en-US', { hour12: false });
  };

  const speeds: Array<1 | 2 | 5 | 10> = [1, 2, 5, 10];

  return (
    <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-[rgba(10,10,15,0.95)] backdrop-blur-sm shadow-2xl">
      {/* Replay badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-[10px] font-semibold text-amber-400 tracking-wider">REPLAY</span>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-0.5">
        {/* Start */}
        <button
          onClick={onStart}
          disabled={currentIndex === 0}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          title="Go to start"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="5" width="3" height="14" />
            <polygon points="21,5 21,19 9,12" />
          </svg>
        </button>

        {/* Prev */}
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          title="Previous candle"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19,5 19,19 7,12" />
            <rect x="3" y="5" width="2" height="14" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={playing ? onPause : onPlay}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors border border-amber-500/20"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={onNext}
          disabled={currentIndex >= totalCandles - 1}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          title="Next candle"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,5 5,19 17,12" />
            <rect x="19" y="5" width="2" height="14" />
          </svg>
        </button>

        {/* End */}
        <button
          onClick={onEnd}
          disabled={currentIndex >= totalCandles - 1}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          title="Go to end"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="3,5 3,19 15,12" />
            <rect x="18" y="5" width="3" height="14" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Timeline slider */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 tabular-nums w-8 text-right">
          {currentIndex + 1}
        </span>
        <input
          type="range"
          min={0}
          max={totalCandles - 1}
          value={currentIndex}
          onChange={handleSeek}
          className="w-32 h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-amber-500"
        />
        <span className="text-[10px] text-zinc-500 tabular-nums w-8">
          {totalCandles}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {speeds.map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors
              ${speed === s
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Time display */}
      <span className="text-[10px] text-zinc-400 tabular-nums font-mono">
        {formatTime(candleTime)}
      </span>

      {/* Exit button */}
      <button
        onClick={onExit}
        className="ml-1 px-2 py-1 rounded-md text-[10px] font-medium text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500 hover:bg-white/5 transition-colors"
      >
        Exit
      </button>
    </div>
  );
}
