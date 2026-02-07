import { describe, it, expect, beforeEach, afterAll, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  resetAllRateLimits,
  resetRateLimit,
  stopCleanup,
} from '@/lib/auth/rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    // Clear all rate limit state between tests
    resetAllRateLimits();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    // Stop the background cleanup interval to prevent timer leaks
    stopCleanup();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requests within limit are allowed
  // ─────────────────────────────────────────────────────────────────────────

  describe('requests within limit are allowed', () => {
    it('should allow the first request', () => {
      const result = checkRateLimit('test:key1', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should allow requests up to the limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit('test:key2', 5, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should report correct remaining count', () => {
      const limit = 10;
      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit('test:remaining', limit, 60_000);
        expect(result.remaining).toBe(limit - 1 - i);
      }
    });

    it('should return a positive resetMs value', () => {
      const result = checkRateLimit('test:reset', 5, 60_000);
      expect(result.resetMs).toBeGreaterThanOrEqual(0);
      expect(result.resetMs).toBeLessThanOrEqual(60_000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requests over limit are blocked
  // ─────────────────────────────────────────────────────────────────────────

  describe('requests over limit are blocked', () => {
    it('should block the request that exceeds the limit', () => {
      const limit = 3;
      // Use up all allowed requests
      for (let i = 0; i < limit; i++) {
        const result = checkRateLimit('test:block', limit, 60_000);
        expect(result.allowed).toBe(true);
      }

      // This one should be blocked
      const blocked = checkRateLimit('test:block', limit, 60_000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('should continue to block subsequent requests after limit is hit', () => {
      const limit = 2;
      checkRateLimit('test:block2', limit, 60_000);
      checkRateLimit('test:block2', limit, 60_000);

      // Both should be blocked
      const r1 = checkRateLimit('test:block2', limit, 60_000);
      const r2 = checkRateLimit('test:block2', limit, 60_000);
      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(false);
    });

    it('should provide a resetMs indicating when the window reopens', () => {
      const limit = 1;
      const windowMs = 30_000;
      checkRateLimit('test:resetinfo', limit, windowMs);

      const blocked = checkRateLimit('test:resetinfo', limit, windowMs);
      expect(blocked.allowed).toBe(false);
      expect(blocked.resetMs).toBeGreaterThan(0);
      expect(blocked.resetMs).toBeLessThanOrEqual(windowMs);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sliding window resets
  // ─────────────────────────────────────────────────────────────────────────

  describe('sliding window resets', () => {
    it('should allow requests again after the window expires', () => {
      vi.useFakeTimers();
      const limit = 2;
      const windowMs = 10_000;

      vi.setSystemTime(1000);
      checkRateLimit('test:window', limit, windowMs);
      checkRateLimit('test:window', limit, windowMs);

      // At limit -- should be blocked
      const blocked = checkRateLimit('test:window', limit, windowMs);
      expect(blocked.allowed).toBe(false);

      // Advance time past the window
      vi.setSystemTime(12_000); // 11 seconds later -- past the 10s window

      // Should be allowed again
      const allowed = checkRateLimit('test:window', limit, windowMs);
      expect(allowed.allowed).toBe(true);
    });

    it('should use sliding window (not fixed window) behavior', () => {
      vi.useFakeTimers();
      const limit = 3;
      const windowMs = 10_000;

      // Stagger requests: t=0, t=4s, t=8s
      vi.setSystemTime(0);
      checkRateLimit('test:sliding', limit, windowMs);

      vi.setSystemTime(4000);
      checkRateLimit('test:sliding', limit, windowMs);

      vi.setSystemTime(8000);
      checkRateLimit('test:sliding', limit, windowMs);

      // At t=8s, all 3 requests are within the 10s window => blocked
      const blocked = checkRateLimit('test:sliding', limit, windowMs);
      expect(blocked.allowed).toBe(false);

      // At t=11s, the first request (t=0) has expired => only 2 requests in window
      vi.setSystemTime(11_000);
      const allowed = checkRateLimit('test:sliding', limit, windowMs);
      expect(allowed.allowed).toBe(true);
    });

    it('should support manual reset via resetRateLimit', () => {
      const limit = 1;
      checkRateLimit('test:manual', limit, 60_000);

      const blocked = checkRateLimit('test:manual', limit, 60_000);
      expect(blocked.allowed).toBe(false);

      // Manually reset
      resetRateLimit('test:manual');

      const allowed = checkRateLimit('test:manual', limit, 60_000);
      expect(allowed.allowed).toBe(true);
    });

    it('should support resetAllRateLimits', () => {
      checkRateLimit('key:a', 1, 60_000);
      checkRateLimit('key:b', 1, 60_000);

      expect(checkRateLimit('key:a', 1, 60_000).allowed).toBe(false);
      expect(checkRateLimit('key:b', 1, 60_000).allowed).toBe(false);

      resetAllRateLimits();

      expect(checkRateLimit('key:a', 1, 60_000).allowed).toBe(true);
      expect(checkRateLimit('key:b', 1, 60_000).allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Different limits for different keys
  // ─────────────────────────────────────────────────────────────────────────

  describe('different limits for different keys', () => {
    it('should track different keys independently', () => {
      const limit = 2;
      // Fill up key A
      checkRateLimit('test:keyA', limit, 60_000);
      checkRateLimit('test:keyA', limit, 60_000);
      expect(checkRateLimit('test:keyA', limit, 60_000).allowed).toBe(false);

      // Key B should still have full quota
      const resultB = checkRateLimit('test:keyB', limit, 60_000);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(1);
    });

    it('should allow different limits for different keys', () => {
      // Key A has a limit of 1
      checkRateLimit('test:lowLimit', 1, 60_000);
      expect(checkRateLimit('test:lowLimit', 1, 60_000).allowed).toBe(false);

      // Key B has a limit of 100
      for (let i = 0; i < 50; i++) {
        expect(checkRateLimit('test:highLimit', 100, 60_000).allowed).toBe(true);
      }
    });

    it('should allow different window sizes for different keys', () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      // Key A: 1 request per 5s
      checkRateLimit('test:shortWindow', 1, 5_000);
      expect(checkRateLimit('test:shortWindow', 1, 5_000).allowed).toBe(false);

      // Key B: 1 request per 30s
      checkRateLimit('test:longWindow', 1, 30_000);
      expect(checkRateLimit('test:longWindow', 1, 30_000).allowed).toBe(false);

      // After 6 seconds, short window key should be available, long window still blocked
      vi.setSystemTime(6_000);
      expect(checkRateLimit('test:shortWindow', 1, 5_000).allowed).toBe(true);
      expect(checkRateLimit('test:longWindow', 1, 30_000).allowed).toBe(false);
    });

    it('should not leak state between unrelated keys', () => {
      // Make many requests on key A
      for (let i = 0; i < 100; i++) {
        checkRateLimit('test:busyKey', 100, 60_000);
      }

      // Key B should be completely unaffected
      const result = checkRateLimit('test:quietKey', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });
});
