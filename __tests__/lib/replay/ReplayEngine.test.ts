import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock IndexedDB and dependent modules BEFORE importing ReplayEngine
// ═══════════════════════════════════════════════════════════════════════════════

// Mock data
const mockTrades = [
  { sessionId: 'session1', timestamp: 1000, price: 5000.00, size: 2, side: 'ASK' as const },
  { sessionId: 'session1', timestamp: 2000, price: 5000.25, size: 3, side: 'BID' as const },
  { sessionId: 'session1', timestamp: 3000, price: 5000.50, size: 1, side: 'ASK' as const },
  { sessionId: 'session1', timestamp: 4000, price: 5000.75, size: 4, side: 'BID' as const },
  { sessionId: 'session1', timestamp: 5000, price: 5001.00, size: 2, side: 'ASK' as const },
];

const mockDepthSnapshots = [
  {
    sessionId: 'session1',
    timestamp: 1500,
    bids: [{ price: 4999.75, size: 50 }, { price: 4999.50, size: 30 }],
    asks: [{ price: 5000.25, size: 40 }, { price: 5000.50, size: 25 }],
  },
  {
    sessionId: 'session1',
    timestamp: 3500,
    bids: [{ price: 5000.00, size: 55 }, { price: 4999.75, size: 35 }],
    asks: [{ price: 5000.50, size: 42 }, { price: 5000.75, size: 28 }],
  },
];

const mockSessions = [
  {
    id: 'session1',
    symbol: 'ES',
    startTime: 1000,
    endTime: 5000,
    tradeCount: 5,
    depthSnapshotCount: 2,
    status: 'completed' as const,
    fileSizeEstimate: 500,
  },
];

// Mock the ReplayRecorder module
vi.mock('@/lib/replay/ReplayRecorder', () => {
  const mockRecorder = {
    init: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue(mockSessions),
    getSessionTrades: vi.fn().mockResolvedValue([...mockTrades]),
    getSessionDepth: vi.fn().mockResolvedValue([...mockDepthSnapshots]),
  };

  return {
    getReplayRecorder: vi.fn(() => mockRecorder),
    __mockRecorder: mockRecorder,
  };
});

// Mock requestAnimationFrame/cancelAnimationFrame for Node.js environment
let rafCallback: FrameRequestCallback | null = null;
let rafId = 1;

vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  rafCallback = cb;
  return rafId++;
});

vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
  rafCallback = null;
});

// Mock performance.now() for tick control
let mockPerfNow = 0;
vi.stubGlobal('performance', { now: () => mockPerfNow });

// Now import the module under test
import { ReplayEngine } from '@/lib/replay/ReplayEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Access singleton and reset it between tests
// ═══════════════════════════════════════════════════════════════════════════════

function getEngine(): ReplayEngine {
  return ReplayEngine.getInstance();
}

// Flush one animation frame by calling the stored raf callback
function flushFrame(advanceMs: number) {
  mockPerfNow += advanceMs;
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(mockPerfNow);
  }
}

describe('ReplayEngine', () => {
  let engine: ReplayEngine;

  beforeEach(() => {
    mockPerfNow = 0;
    rafCallback = null;
    engine = getEngine();
    engine.stop(); // Reset to idle
  });

  afterEach(() => {
    engine.stop();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Loading session data
  // ─────────────────────────────────────────────────────────────────────────

  describe('loading session data', () => {
    it('should load a session and transition to paused state', async () => {
      await engine.loadSession('session1');

      const state = engine.getState();
      expect(state.status).toBe('paused');
      expect(state.sessionId).toBe('session1');
      expect(state.symbol).toBe('ES');
    });

    it('should set correct start and end times from loaded data', async () => {
      await engine.loadSession('session1');

      const state = engine.getState();
      expect(state.startTime).toBe(1000);   // Earliest timestamp
      expect(state.endTime).toBe(5000);     // Latest timestamp
    });

    it('should set total trade and depth counts', async () => {
      await engine.loadSession('session1');

      const state = engine.getState();
      expect(state.totalTrades).toBe(mockTrades.length);
      expect(state.totalDepthSnapshots).toBe(mockDepthSnapshots.length);
    });

    it('should initialize progress to 0', async () => {
      await engine.loadSession('session1');

      const state = engine.getState();
      expect(state.progress).toBe(0);
      expect(state.tradeIndex).toBe(0);
      expect(state.depthIndex).toBe(0);
      expect(state.tradeFedCount).toBe(0);
    });

    it('should throw an error for non-existent session', async () => {
      await expect(engine.loadSession('nonexistent')).rejects.toThrow(
        'Session nonexistent not found'
      );
    });

    it('should notify status callbacks when loading', async () => {
      const statusUpdates: string[] = [];
      const unsub = engine.onStatus((state) => {
        statusUpdates.push(state.status);
      });

      await engine.loadSession('session1');
      unsub();

      // Should have: current idle state from onStatus, then loading, then paused
      expect(statusUpdates).toContain('loading');
      expect(statusUpdates).toContain('paused');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Play/Pause/Stop lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  describe('play/pause/stop lifecycle', () => {
    it('should transition to playing state on play', async () => {
      await engine.loadSession('session1');
      engine.play();

      expect(engine.getState().status).toBe('playing');
    });

    it('should not play from idle state', () => {
      engine.stop(); // Ensure idle
      engine.play();
      expect(engine.getState().status).toBe('idle');
    });

    it('should transition to paused state on pause', async () => {
      await engine.loadSession('session1');
      engine.play();
      engine.pause();

      expect(engine.getState().status).toBe('paused');
    });

    it('should not pause if not playing', async () => {
      await engine.loadSession('session1');
      // Status is 'paused' after load
      engine.pause(); // Should be a no-op
      expect(engine.getState().status).toBe('paused');
    });

    it('should transition to idle state on stop', async () => {
      await engine.loadSession('session1');
      engine.play();
      engine.stop();

      const state = engine.getState();
      expect(state.status).toBe('idle');
      expect(state.sessionId).toBeNull();
      expect(state.totalTrades).toBe(0);
      expect(state.totalDepthSnapshots).toBe(0);
    });

    it('should advance trade/depth indices during playback', async () => {
      await engine.loadSession('session1');
      engine.play();

      // Simulate a frame that advances 5000ms of replay time at 1x speed
      // This should process all trades (timestamps 1000-5000)
      flushFrame(6000);

      const state = engine.getState();
      // After advancing 6000ms from startTime (1000), currentTime should be ~7000
      // which is past all trades and depth snapshots
      expect(state.tradeIndex).toBeGreaterThan(0);
    });

    it('should transition to finished when all data is consumed', async () => {
      await engine.loadSession('session1');
      engine.play();

      // Advance well past the end of all data
      // Session is 1000-5000, duration=4000. We advance 10s at 1x.
      flushFrame(10_000);

      const state = engine.getState();
      expect(state.status).toBe('finished');
      expect(state.progress).toBe(1);
    });

    it('should restart from beginning when play is called in finished state', async () => {
      await engine.loadSession('session1');
      engine.play();
      flushFrame(10_000); // Finish
      expect(engine.getState().status).toBe('finished');

      // Play again should restart (seek to 0, then play)
      engine.play();
      const state = engine.getState();
      expect(state.status).toBe('playing');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Seek functionality
  // ─────────────────────────────────────────────────────────────────────────

  describe('seek functionality', () => {
    it('should seek to the beginning (progress=0)', async () => {
      await engine.loadSession('session1');
      engine.seek(0);

      const state = engine.getState();
      expect(state.progress).toBe(0);
      expect(state.currentTime).toBe(1000); // startTime
      expect(state.tradeIndex).toBe(0);
      expect(state.depthIndex).toBe(0);
    });

    it('should seek to the end (progress=1)', async () => {
      await engine.loadSession('session1');
      engine.seek(1);

      const state = engine.getState();
      expect(state.progress).toBe(1);
      expect(state.currentTime).toBe(5000); // endTime
      expect(state.tradeIndex).toBe(mockTrades.length);
      expect(state.depthIndex).toBe(mockDepthSnapshots.length);
    });

    it('should seek to a midpoint', async () => {
      await engine.loadSession('session1');
      engine.seek(0.5);

      const state = engine.getState();
      expect(state.progress).toBe(0.5);
      // midpoint: 1000 + 0.5 * (5000 - 1000) = 3000
      expect(state.currentTime).toBe(3000);
    });

    it('should clamp progress to 0-1 range', async () => {
      await engine.loadSession('session1');

      engine.seek(-0.5);
      expect(engine.getState().progress).toBe(0);

      engine.seek(1.5);
      expect(engine.getState().progress).toBe(1);
    });

    it('should update tradeIndex to match the seek position', async () => {
      await engine.loadSession('session1');

      // Seek to midpoint (t=3000)
      // Trades at t=1000, 2000, 3000 are <= 3000 => tradeIndex should be 3
      engine.seek(0.5);
      const state = engine.getState();
      expect(state.tradeIndex).toBe(3);
      expect(state.tradeFedCount).toBe(3);
    });

    it('should update depthIndex to match the seek position', async () => {
      await engine.loadSession('session1');

      // Seek to t=3000 (progress=0.5)
      // Depth snapshots at t=1500, 3500
      // 1500 <= 3000 => count. 3500 > 3000 => stop. depthIndex = 1
      engine.seek(0.5);
      const state = engine.getState();
      expect(state.depthIndex).toBe(1);
    });

    it('should reset adapters when seeking', async () => {
      await engine.loadSession('session1');
      engine.play();
      flushFrame(3000); // Play forward a bit
      engine.pause();

      // Seek back to beginning - adapters should be reset and replayed
      engine.seek(0);

      const state = engine.getState();
      expect(state.tradeIndex).toBe(0);
      expect(state.tradeFedCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Speed changes
  // ─────────────────────────────────────────────────────────────────────────

  describe('speed changes', () => {
    it('should default to 1x speed', async () => {
      await engine.loadSession('session1');
      expect(engine.getState().speed).toBe(1);
    });

    it('should set speed within valid range', async () => {
      await engine.loadSession('session1');

      engine.setSpeed(2);
      expect(engine.getState().speed).toBe(2);

      engine.setSpeed(5);
      expect(engine.getState().speed).toBe(5);

      engine.setSpeed(0.5);
      expect(engine.getState().speed).toBe(0.5);
    });

    it('should clamp speed to minimum 0.25x', async () => {
      await engine.loadSession('session1');
      engine.setSpeed(0.1);
      expect(engine.getState().speed).toBe(0.25);
    });

    it('should clamp speed to maximum 10x', async () => {
      await engine.loadSession('session1');
      engine.setSpeed(20);
      expect(engine.getState().speed).toBe(10);
    });

    it('should advance replay time faster at higher speed', async () => {
      await engine.loadSession('session1');

      // At 2x speed, 1000ms of real time = 2000ms of replay time
      engine.setSpeed(2);
      engine.play();
      flushFrame(1000); // Advance 1s of real time

      const state = engine.getState();
      // currentTime should have advanced by ~2000ms from startTime (1000)
      // so currentTime ~= 3000
      expect(state.currentTime).toBeCloseTo(3000, -1);
    });

    it('should advance replay time slower at lower speed', async () => {
      await engine.loadSession('session1');

      // At 0.5x speed, 1000ms of real time = 500ms of replay time
      engine.setSpeed(0.5);
      engine.play();
      flushFrame(1000); // Advance 1s of real time

      const state = engine.getState();
      // currentTime should have advanced by ~500ms from startTime (1000)
      // so currentTime ~= 1500
      expect(state.currentTime).toBeCloseTo(1500, -1);
    });

    it('should notify status callbacks on speed change', async () => {
      await engine.loadSession('session1');

      const speeds: number[] = [];
      const unsub = engine.onStatus((state) => {
        speeds.push(state.speed);
      });

      engine.setSpeed(3);
      engine.setSpeed(0.25);
      unsub();

      expect(speeds).toContain(3);
      expect(speeds).toContain(0.25);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Status callbacks
  // ─────────────────────────────────────────────────────────────────────────

  describe('status callbacks', () => {
    it('should call callback immediately with current state on subscribe', async () => {
      await engine.loadSession('session1');

      let callbackState: ReturnType<typeof engine.getState> | null = null;
      const unsub = engine.onStatus((state) => {
        callbackState = { ...state };
      });

      expect(callbackState).not.toBeNull();
      expect(callbackState!.status).toBe('paused');
      unsub();
    });

    it('should unsubscribe when the returned function is called', async () => {
      await engine.loadSession('session1');

      let callCount = 0;
      const unsub = engine.onStatus(() => {
        callCount++;
      });

      const countAfterSubscribe = callCount;
      unsub();

      // Further state changes should not trigger the callback
      engine.setSpeed(5);
      expect(callCount).toBe(countAfterSubscribe);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render data access
  // ─────────────────────────────────────────────────────────────────────────

  describe('render data access', () => {
    it('should return heatmap render data', async () => {
      await engine.loadSession('session1');
      engine.seek(1); // Feed all data

      const data = engine.getHeatmapRenderData(800, 600);
      expect(data).toBeDefined();
      expect(data).toHaveProperty('priceMin');
      expect(data).toHaveProperty('priceMax');
      expect(data).toHaveProperty('passiveOrders');
      expect(data).toHaveProperty('trades');
    });

    it('should return footprint candles', async () => {
      await engine.loadSession('session1');
      engine.seek(1); // Feed all data

      const candles = engine.getFootprintCandles();
      expect(candles).toBeDefined();
      expect(Array.isArray(candles)).toBe(true);
    });

    it('should return current price', async () => {
      await engine.loadSession('session1');
      engine.seek(1);

      const price = engine.getCurrentPrice();
      expect(typeof price).toBe('number');
    });
  });
});
