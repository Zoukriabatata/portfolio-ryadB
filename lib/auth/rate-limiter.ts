/**
 * PRODUCTION-READY RATE LIMITER
 *
 * Hybrid rate limiter: In-memory (fast) + Database (persistent)
 * Suitable for single-server and serverless deployments.
 *
 * Strategies:
 *   - Per-IP: unauthenticated routes (login, register, webhooks)
 *   - Per-user: authenticated API routes (with DB persistence)
 *
 * Preset limits:
 *   - Login:    5 requests / 60s   per IP
 *   - Register: 3 requests / 3600s per IP
 *   - API:      100 requests / 60s per user
 *   - Webhook:  30 requests / 60s  per IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ============ TYPES ============

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
}

interface SlidingWindowEntry {
  timestamps: number[];
  /** Epoch ms when the oldest relevant timestamp would expire, used for cleanup. */
  windowMs: number;
}

// ============ SLIDING WINDOW STORE ============

const store = new Map<string, SlidingWindowEntry>();

/**
 * Prune timestamps older than the window from a single entry.
 * Returns the pruned array (mutates in place for performance).
 */
function pruneTimestamps(entry: SlidingWindowEntry, now: number): number[] {
  const cutoff = now - entry.windowMs;
  // Find index of first timestamp still within the window
  let firstValid = 0;
  while (firstValid < entry.timestamps.length && entry.timestamps[firstValid] <= cutoff) {
    firstValid++;
  }
  if (firstValid > 0) {
    entry.timestamps = entry.timestamps.slice(firstValid);
  }
  return entry.timestamps;
}

// ============ AUTO-CLEANUP ============

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval !== null) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of store) {
      pruneTimestamps(entry, now);
      if (entry.timestamps.length === 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      store.delete(key);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Allow the Node.js process to exit even if the interval is active.
  // In serverless/edge environments this is a no-op if unref is unavailable.
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    (cleanupInterval as NodeJS.Timeout).unref();
  }
}

// Start cleanup on module load
startCleanup();

// ============ CORE FUNCTION ============

/**
 * Check (and record) a rate-limit hit for a given key.
 *
 * Uses a **sliding window log** algorithm: every request timestamp is stored,
 * and only those within the current window are counted. This avoids the burst
 * edge-case inherent to fixed-window counters.
 *
 * @param key      Unique identifier (e.g. `ip:login:1.2.3.4` or `user:api:abc123`)
 * @param limit    Maximum number of requests allowed within the window
 * @param windowMs Window duration in milliseconds
 * @returns        Result object with allowed, remaining, resetMs, and limit fields
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [], windowMs };
    store.set(key, entry);
  } else {
    // Update windowMs in case the same key is used with different windows
    // (unlikely, but defensive)
    entry.windowMs = Math.max(entry.windowMs, windowMs);
  }

  // Remove expired timestamps
  pruneTimestamps(entry, now);

  const currentCount = entry.timestamps.length;

  if (currentCount >= limit) {
    // Denied: calculate when the oldest timestamp in the window expires
    const oldestInWindow = entry.timestamps[0];
    const resetMs = oldestInWindow + windowMs - now;

    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(resetMs, 0),
      limit,
    };
  }

  // Allowed: record this request
  entry.timestamps.push(now);

  const remaining = limit - entry.timestamps.length;

  // Reset time is when the earliest recorded timestamp in the window expires
  const oldestInWindow = entry.timestamps[0];
  const resetMs = oldestInWindow + windowMs - now;

  return {
    allowed: true,
    remaining,
    resetMs: Math.max(resetMs, 0),
    limit,
  };
}

// ============ IP EXTRACTION ============

/**
 * Extract the client IP address from a Next.js request.
 * Checks standard proxy headers in priority order.
 */
function getClientIP(req: NextRequest): string {
  // x-forwarded-for may contain a comma-separated list; take the first (client) IP
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }

  // Cloudflare
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  // Vercel
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Fallback
  return '127.0.0.1';
}

// ============ HELPER FUNCTIONS ============

/**
 * Rate-limit a request by the client's IP address.
 * Suitable for unauthenticated routes (login, register, webhooks).
 */
export function rateLimitByIP(
  req: NextRequest,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const ip = getClientIP(req);
  const key = `ip:${ip}`;
  return checkRateLimit(key, limit, windowMs);
}

/**
 * Rate-limit a request by the authenticated user's ID.
 * HYBRID VERSION: Memory cache (fast) + Database (persistent)
 *
 * Suitable for authenticated API routes.
 */
export async function rateLimitByUser(
  userId: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult & { resetTime: number }> {
  const key = `user:${userId}`;
  const now = Date.now();

  // ✅ STEP 1: CHECK MEMORY CACHE (fast path)
  const cached = store.get(key);
  if (cached) {
    const timestamps = pruneTimestamps(cached, now);
    if (timestamps.length < limit) {
      // Allow in memory
      timestamps.push(now);

      // Sync to DB async (non-blocking)
      syncToDatabase(key, timestamps.length, new Date(now + windowMs))
        .catch(err => console.error('DB sync error:', err));

      const resetTime = timestamps[0] + windowMs;
      return {
        allowed: true,
        remaining: limit - timestamps.length,
        resetMs: resetTime - now,
        resetTime,
        limit,
      };
    } else {
      // Rate limited in memory
      const resetTime = timestamps[0] + windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetMs: resetTime - now,
        resetTime,
        limit,
      };
    }
  }

  // ✅ STEP 2: CHECK DATABASE (fallback + persistent state)
  try {
    const record = await prisma.rateLimit.findUnique({
      where: { key },
    });

    const resetTime = now + windowMs;

    if (!record || new Date(record.expiresAt).getTime() < now) {
      // New window or expired - allow request
      await prisma.rateLimit.upsert({
        where: { key },
        update: {
          count: 1,
          windowStart: new Date(now),
          expiresAt: new Date(resetTime),
        },
        create: {
          key,
          count: 1,
          windowStart: new Date(now),
          expiresAt: new Date(resetTime),
        },
      });

      // Update memory cache
      store.set(key, {
        timestamps: [now],
        windowMs,
      });

      return {
        allowed: true,
        remaining: limit - 1,
        resetMs: windowMs,
        resetTime,
        limit,
      };
    }

    // Window still active - check count
    if (record.count >= limit) {
      // Rate limited
      const recordResetTime = new Date(record.expiresAt).getTime();

      // Update memory cache
      const timestamps = Array(record.count).fill(now - windowMs + 1000);
      store.set(key, { timestamps, windowMs });

      return {
        allowed: false,
        remaining: 0,
        resetMs: recordResetTime - now,
        resetTime: recordResetTime,
        limit,
      };
    }

    // Increment count
    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    // Update memory cache
    const timestamps = Array(updated.count).fill(now);
    store.set(key, { timestamps, windowMs });

    const recordResetTime = new Date(record.expiresAt).getTime();
    return {
      allowed: true,
      remaining: limit - updated.count,
      resetMs: recordResetTime - now,
      resetTime: recordResetTime,
      limit,
    };

  } catch (error) {
    console.error('Rate limit DB error:', error);
    // FAIL OPEN: Allow request if DB fails (don't block users)
    return {
      allowed: true,
      remaining: limit,
      resetMs: windowMs,
      resetTime: now + windowMs,
      limit,
    };
  }
}

/**
 * Sync rate limit count to database (async, non-blocking)
 */
async function syncToDatabase(
  key: string,
  count: number,
  expiresAt: Date
): Promise<void> {
  await prisma.rateLimit.upsert({
    where: { key },
    update: { count },
    create: {
      key,
      count,
      windowStart: new Date(),
      expiresAt,
    },
  });
}

/**
 * Cleanup expired rate limits from database
 * Run this on server startup
 */
export async function cleanupExpiredRateLimits(): Promise<void> {
  try {
    const deleted = await prisma.rateLimit.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    console.log(`[Rate Limiter] Cleaned up ${deleted.count} expired rate limits`);
  } catch (error) {
    console.error('[Rate Limiter] Cleanup error:', error);
  }
}

// ============ PRESET LIMITS ============

/** Login: 5 attempts per 60 seconds per IP */
export function loginRateLimit(req: NextRequest): RateLimitResult {
  const ip = getClientIP(req);
  const key = `ip:login:${ip}`;
  return checkRateLimit(key, 5, 60 * 1000);
}

/** Register: 3 attempts per hour per IP */
export function registerRateLimit(req: NextRequest): RateLimitResult {
  const ip = getClientIP(req);
  const key = `ip:register:${ip}`;
  return checkRateLimit(key, 3, 60 * 60 * 1000);
}

/** API routes: 100 requests per minute per user */
export function apiRateLimit(userId: string): RateLimitResult {
  const key = `user:api:${userId}`;
  return checkRateLimit(key, 100, 60 * 1000);
}

/** Webhooks: 30 requests per minute per IP */
export function webhookRateLimit(req: NextRequest): RateLimitResult {
  const ip = getClientIP(req);
  const key = `ip:webhook:${ip}`;
  return checkRateLimit(key, 30, 60 * 1000);
}

// ============ RESPONSE HELPERS ============

/**
 * Build rate-limit headers from a RateLimitResult.
 */
export function rateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
  };
}

/**
 * Return a 429 Too Many Requests response with proper rate-limit headers.
 * Can be used directly as an early return in API route handlers:
 *
 * ```ts
 * const rl = loginRateLimit(req);
 * if (!rl.allowed) return tooManyRequests(rl);
 * ```
 */
export function tooManyRequests(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil(result.resetMs / 1000);

  return NextResponse.json(
    {
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfter: retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}

/**
 * Apply rate-limit headers to an existing NextResponse.
 * Useful when the request is allowed and you want to include
 * remaining quota information in the successful response.
 *
 * ```ts
 * const rl = apiRateLimit(userId);
 * if (!rl.allowed) return tooManyRequests(rl);
 * const response = NextResponse.json({ data });
 * return withRateLimitHeaders(response, rl);
 * ```
 */
export function withRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): NextResponse {
  const headers = rateLimitHeaders(result);
  response.headers.set('X-RateLimit-Limit', headers['X-RateLimit-Limit']);
  response.headers.set('X-RateLimit-Remaining', headers['X-RateLimit-Remaining']);
  response.headers.set('X-RateLimit-Reset', headers['X-RateLimit-Reset']);
  return response;
}

// ============ TESTING / ADMIN HELPERS ============

/**
 * Reset rate-limit state for a specific key.
 * Useful in tests or admin endpoints.
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Reset all rate-limit state.
 * Useful in test teardown.
 */
export function resetAllRateLimits(): void {
  store.clear();
}

/**
 * Stop the background cleanup interval.
 * Call this during test teardown to prevent timer leaks.
 */
export function stopCleanup(): void {
  if (cleanupInterval !== null) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
