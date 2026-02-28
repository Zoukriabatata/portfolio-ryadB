'use client';

import { useEffect } from 'react';
import type { ReplayState } from '@/lib/replay';
import { getReplayEngine } from '@/lib/replay';
import { SPEED_OPTIONS } from '@/components/replay/utils';
import { useReplayUIStore } from '@/stores/useReplayUIStore';

interface ReplayControls {
  state: ReplayState;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;
}

export function useReplayKeyboard(controls: ReplayControls) {
  const {
    toggleSidebar,
    toggleShortcuts,
    bookmarks,
    addBookmark,
  } = useReplayUIStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const { state, play, pause, stop, seek, setSpeed } = controls;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (state.status === 'playing') pause();
          else if (state.status === 'paused' || state.status === 'finished') play();
          break;

        case 'ArrowLeft': {
          e.preventDefault();
          if (state.status === 'idle') return;
          const duration = state.endTime - state.startTime;
          if (duration <= 0) return;

          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Left: step back 1 candle (timeframe-aware)
            try {
              const engine = getReplayEngine();
              const tfMs = engine.getFootprintTimeframe() * 1000;
              const delta = tfMs / duration;
              seek(Math.max(0, state.progress - delta));
            } catch {
              seek(Math.max(0, state.progress - 1000 / duration));
            }
          } else {
            const stepMs = e.shiftKey ? 30000 : 5000;
            const delta = stepMs / duration;
            seek(Math.max(0, state.progress - delta));
          }
          break;
        }

        case 'ArrowRight': {
          e.preventDefault();
          if (state.status === 'idle') return;
          const dur = state.endTime - state.startTime;
          if (dur <= 0) return;

          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Right: step forward 1 candle
            try {
              const engine = getReplayEngine();
              const tfMs = engine.getFootprintTimeframe() * 1000;
              const d = tfMs / dur;
              seek(Math.min(1, state.progress + d));
            } catch {
              seek(Math.min(1, state.progress + 1000 / dur));
            }
          } else {
            const step = e.shiftKey ? 30000 : 5000;
            const d = step / dur;
            seek(Math.min(1, state.progress + d));
          }
          break;
        }

        // ArrowUp/Down: navigate between bookmarks
        case 'ArrowUp': {
          e.preventDefault();
          if (state.status === 'idle' || !state.sessionId) return;
          const sessionBM = bookmarks[state.sessionId] || [];
          if (sessionBM.length === 0) return;
          // Find previous bookmark (closest with progress < current)
          const prevBMs = sessionBM
            .filter(bm => bm.progress < state.progress - 0.001)
            .sort((a, b) => b.progress - a.progress);
          if (prevBMs.length > 0) {
            seek(prevBMs[0].progress);
          }
          break;
        }

        case 'ArrowDown': {
          e.preventDefault();
          if (state.status === 'idle' || !state.sessionId) return;
          const sessionBMs = bookmarks[state.sessionId] || [];
          if (sessionBMs.length === 0) return;
          // Find next bookmark (closest with progress > current)
          const nextBMs = sessionBMs
            .filter(bm => bm.progress > state.progress + 0.001)
            .sort((a, b) => a.progress - b.progress);
          if (nextBMs.length > 0) {
            seek(nextBMs[0].progress);
          }
          break;
        }

        // Home/End: jump to start/end
        case 'Home':
          e.preventDefault();
          if (state.status !== 'idle') seek(0);
          break;

        case 'End':
          e.preventDefault();
          if (state.status !== 'idle') seek(1);
          break;

        case '+':
        case '=': {
          e.preventDefault();
          const idx = SPEED_OPTIONS.indexOf(state.speed as typeof SPEED_OPTIONS[number]);
          if (idx < SPEED_OPTIONS.length - 1) {
            setSpeed(SPEED_OPTIONS[idx + 1]);
          }
          break;
        }

        case '-': {
          e.preventDefault();
          const idx2 = SPEED_OPTIONS.indexOf(state.speed as typeof SPEED_OPTIONS[number]);
          if (idx2 > 0) {
            setSpeed(SPEED_OPTIONS[idx2 - 1]);
          }
          break;
        }

        case 'Escape':
          e.preventDefault();
          stop();
          break;

        case 'b':
        case 'B': {
          if (state.status === 'idle' || !state.sessionId) return;
          e.preventDefault();
          const bookmark = {
            id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: state.currentTime,
            progress: state.progress,
            label: `Bookmark at ${new Date(state.currentTime).toLocaleTimeString()}`,
            color: '#f59e0b',
          };
          addBookmark(state.sessionId, bookmark);
          break;
        }

        case '[':
          e.preventDefault();
          toggleSidebar();
          break;

        case '?':
          e.preventDefault();
          toggleShortcuts();
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [controls, toggleSidebar, toggleShortcuts, bookmarks, addBookmark]);
}
