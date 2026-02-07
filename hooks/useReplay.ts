'use client';

/**
 * USE REPLAY HOOK
 *
 * React hook for controlling the replay engine.
 * Provides play/pause/seek controls and reactive state updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getReplayEngine,
  getReplayRecorder,
  type ReplayState,
  type RecordingSession,
} from '@/lib/replay';

export interface UseReplayReturn {
  // State
  state: ReplayState;
  sessions: RecordingSession[];

  // Playback controls
  loadSession: (sessionId: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;

  // Recording controls
  startRecording: (symbol: string, description?: string) => Promise<string>;
  stopRecording: () => Promise<RecordingSession | null>;
  isRecording: boolean;
  recordingStats: { tradeCount: number; depthCount: number; duration: number; sizeEstimate: number };

  // Session management
  deleteSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

export function useReplay(): UseReplayReturn {
  const [state, setState] = useState<ReplayState>({
    status: 'idle',
    sessionId: null,
    symbol: '',
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    progress: 0,
    speed: 1,
    tradeIndex: 0,
    depthIndex: 0,
    totalTrades: 0,
    totalDepthSnapshots: 0,
    tradeFedCount: 0,
  });

  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStats, setRecordingStats] = useState({ tradeCount: 0, depthCount: 0, duration: 0, sizeEstimate: 0 });
  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to replay engine state changes
  useEffect(() => {
    const engine = getReplayEngine();
    const cleanup = engine.onStatus((newState) => {
      setState(newState);
    });

    // Load sessions list
    refreshSessions();

    return () => {
      cleanup();
      if (statsInterval.current) clearInterval(statsInterval.current);
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    const recorder = getReplayRecorder();
    await recorder.init();
    const list = await recorder.getSessions();
    setSessions(list);
  }, []);

  // Playback controls
  const loadSession = useCallback(async (sessionId: string) => {
    await getReplayEngine().loadSession(sessionId);
  }, []);

  const play = useCallback(() => getReplayEngine().play(), []);
  const pause = useCallback(() => getReplayEngine().pause(), []);
  const stop = useCallback(() => getReplayEngine().stop(), []);
  const seek = useCallback((progress: number) => getReplayEngine().seek(progress), []);
  const setSpeed = useCallback((speed: number) => getReplayEngine().setSpeed(speed), []);

  // Recording controls
  const startRecording = useCallback(async (symbol: string, description?: string) => {
    const recorder = getReplayRecorder();
    await recorder.init();
    const sessionId = await recorder.startRecording(symbol, description);
    setIsRecording(true);

    // Poll recording stats
    statsInterval.current = setInterval(() => {
      setRecordingStats(recorder.getRecordingStats());
    }, 1000);

    return sessionId;
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = getReplayRecorder();
    const session = await recorder.stopRecording();
    setIsRecording(false);

    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }

    await refreshSessions();
    return session;
  }, [refreshSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    const recorder = getReplayRecorder();
    await recorder.deleteSession(sessionId);
    await refreshSessions();
  }, [refreshSessions]);

  return {
    state,
    sessions,
    loadSession,
    play,
    pause,
    stop,
    seek,
    setSpeed,
    startRecording,
    stopRecording,
    isRecording,
    recordingStats,
    deleteSession,
    refreshSessions,
  };
}
