'use client';

import { useEffect } from 'react';
import type { ReplayState } from '@/lib/replay';
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
          const stepMs = e.shiftKey ? 30000 : 5000;
          const delta = stepMs / duration;
          seek(Math.max(0, state.progress - delta));
          break;
        }

        case 'ArrowRight': {
          e.preventDefault();
          if (state.status === 'idle') return;
          const dur = state.endTime - state.startTime;
          if (dur <= 0) return;
          const step = e.shiftKey ? 30000 : 5000;
          const d = step / dur;
          seek(Math.min(1, state.progress + d));
          break;
        }

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
