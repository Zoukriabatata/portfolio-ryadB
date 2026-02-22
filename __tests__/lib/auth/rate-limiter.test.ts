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
    it('should allow the first request', async () => {
      const result = await checkRateLimit('test:key1', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should allow requests up to the limit', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await checkRateLimit('test:key2', 5, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should report correct remaining count', async () => {
      const limit = 10;
      for (let i = 0; i < limit; i++) {
        const result = await checkRateLimit('test:remaining', limit, 60_000);
        expect(result.remaining).toBe(limit - 1 - i);
      }
    });

    it('should return a positive resetMs value', async () => {
      const result = await checkRateLimit('test:reset', 5, 60_000);
      expect(result.resetMs).toBeGreaterThanOrEqual(0);
      expect(result.resetMs).toBeLessThanOrEqual(60_000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Requests over limit are blocked
  // ─────────────────────────────────────────────────────────────────────────

  describe('requests over limit are blocked', () => {
    it('should block the request that exceeds the limit', async () => {
      const limit = 3;
      for (let i = 0; i < limit; i++) {
        const result = await checkRateLimit('test:block', limit, 60_000);
        expect(result.allowed).toBe(true);
      }

      const blocked = await checkRateLimit('test:block', limit, 60_000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('should continue to block subsequent requests after limit is hit', async () => {
      const limit = 2;
      await checkRateLimit('test:block2', limit, 60_000);
      await checkRateLimit('test:block2', limit, 60_000);

      const r1 = await checkRateLimit('test:block2', limit, 60_000);
      const r2 = await checkRateLimit('test:block2', limit, 60_000);
      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(false);
    });

    it('should provide a resetMs indicating when the window reopens', async () => {
      const limit = 1;
      const windowMs = 30_000;
      await checkRateLimit('test:resetinfo', limit, windowMs);

      const blocked = await checkRateLimit('test:resetinfo', limit, windowMs);
      expect(blocked.allowed).toBe(false);
      expect(blocked.resetMs).toBeGreaterThan(0);
      expect(blocked.resetMs).toBeLessThanOrEqual(windowMs);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sliding window resets
  // ─────────────────────────────────────────────────────────────────────────

  describe('sliding window resets', () => {
    it('should allow requests again after the window expires', async () => {
      vi.useFakeTimers();
      const limit = 2;
      const windowMs = 10_000;

      vi.setSystemTime(1000);
      await checkRateLimit('test:window', limit, windowMs);
      await checkRateLimit('test:window', limit, windowMs);

      const blocked = await checkRateLimit('test:window', limit, windowMs);
      expect(blocked.allowed).toBe(false);

      vi.setSystemTime(12_000);

      const allowed = await checkRateLimit('test:window', limit, windowMs);
      expect(allowed.allowed).toBe(true);
    });

    it('should use sliding window (not fixed window) behavior', async () => {
      vi.useFakeTimers();
      const limit = 3;
      const windowMs = 10_000;

      vi.setSystemTime(0);
      await checkRateLimit('test:sliding', limit, windowMs);

      vi.setSystemTime(4000);
      await checkRateLimit('test:sliding', limit, windowMs);

      vi.setSystemTime(8000);
      await checkRateLimit('test:sliding', limit, windowMs);

      const blocked = await checkRateLimit('test:sliding', limit, windowMs);
      expect(blocked.allowed).toBe(false);

      vi.setSystemTime(11_000);
      const allowed = await checkRateLimit('test:sliding', limit, windowMs);
      expect(allowed.allowed).toBe(true);
    });

    it('should support manual reset via resetRateLimit', async () => {
      const limit = 1;
      await checkRateLimit('test:manual', limit, 60_000);

      const blocked = await checkRateLimit('test:manual', limit, 60_000);
      expect(blocked.allowed).toBe(false);

      resetRateLimit('test:manual');

      const allowed = await checkRateLimit('test:manual', limit, 60_000);
      expect(allowed.allowed).toBe(true);
    });

    it('should support resetAllRateLimits', async () => {
      await checkRateLimit('key:a', 1, 60_000);
      await checkRateLimit('key:b', 1, 60_000);

      expect((await checkRateLimit('key:a', 1, 60_000)).allowed).toBe(false);
      expect((await checkRateLimit('key:b', 1, 60_000)).allowed).toBe(false);

      resetAllRateLimits();

      expect((await checkRateLimit('key:a', 1, 60_000)).allowed).toBe(true);
      expect((await checkRateLimit('key:b', 1, 60_000)).allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Different limits for different keys
  // ─────────────────────────────────────────────────────────────────────────

  describe('different limits for different keys', () => {
    it('should track different keys independently', async () => {
      const limit = 2;
      await checkRateLimit('test:keyA', limit, 60_000);
      await checkRateLimit('test:keyA', limit, 60_000);
      expect((await checkRateLimit('test:keyA', limit, 60_000)).allowed).toBe(false);

      const resultB = await checkRateLimit('test:keyB', limit, 60_000);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(1);
    });

    it('should allow different limits for different keys', async () => {
      await checkRateLimit('test:lowLimit', 1, 60_000);
      expect((await checkRateLimit('test:lowLimit', 1, 60_000)).allowed).toBe(false);

      for (let i = 0; i < 50; i++) {
        expect((await checkRateLimit('test:highLimit', 100, 60_000)).allowed).toBe(true);
      }
    });

    it('should allow different window sizes for different keys', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      await checkRateLimit('test:shortWindow', 1, 5_000);
      expect((await checkRateLimit('test:shortWindow', 1, 5_000)).allowed).toBe(false);

      await checkRateLimit('test:longWindow', 1, 30_000);
      expect((await checkRateLimit('test:longWindow', 1, 30_000)).allowed).toBe(false);

      vi.setSystemTime(6_000);
      expect((await checkRateLimit('test:shortWindow', 1, 5_000)).allowed).toBe(true);
      expect((await checkRateLimit('test:longWindow', 1, 30_000)).allowed).toBe(false);
    });

    it('should not leak state between unrelated keys', async () => {
      for (let i = 0; i < 100; i++) {
        await checkRateLimit('test:busyKey', 100, 60_000);
      }

      const result = await checkRateLimit('test:quietKey', 5, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });
});
