/**
 * DISTRIBUTED RATE LIMITER
 *
 * Uses Upstash Redis for distributed rate limiting across serverless instances.
 * Falls back to in-memory sliding window when Redis is not configured (dev).
 *
 * Strategies:
 *   - Per-IP: unauthenticated routes (login, register, webhooks)
 *   - Per-user: authenticated API routes
 *
 * Preset limits:
 *   - Login:    5 requests / 60s   per IP
 *   - Register: 3 requests / 3600s per IP
 *   - API:      100 requests / 60s per user
 *   - Webhook:  30 requests / 60s  per IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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

// ============ REDIS CLIENT ============

const isRedisConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// ============ IN-MEMORY FALLBACK (dev / no Redis) ============

interface SlidingWindowEntry {
  timestamps: number[];
  windowMs: number;
}

const memoryStore = new Map<string, SlidingWindowEntry>();

function memoryCheckRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let entry = memoryStore.get(key);

  if (!entry) {
    entry = { timestamps: [], windowMs };
    memoryStore.set(key, entry);
  }

  // Prune expired timestamps
  const cutoff = now - windowMs;
  let firstValid = 0;
  while (firstValid < entry.timestamps.length && entry.timestamps[firstValid] <= cutoff) {
    firstValid++;
  }
  if (firstValid > 0) {
    entry.timestamps = entry.timestamps.slice(firstValid);
  }

  if (entry.timestamps.length >= limit) {
    const resetMs = entry.timestamps[0] + windowMs - now;
    return { allowed: false, remaining: 0, resetMs: Math.max(resetMs, 0), limit };
  }

  entry.timestamps.push(now);
  const remaining = limit - entry.timestamps.length;
  const resetMs = entry.timestamps[0] + windowMs - now;
  return { allowed: true, remaining, resetMs: Math.max(resetMs, 0), limit };
}

// Memory cleanup (only needed when Redis is not configured)
if (!isRedisConfigured) {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      const cutoff = now - entry.windowMs;
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) memoryStore.delete(key);
    }
  }, 5 * 60 * 1000);
  if (typeof interval === 'object' && 'unref' in interval) {
    (interval as NodeJS.Timeout).unref();
  }
}

// ============ UPSTASH RATE LIMITERS (cached by config) ============

const limiterCache = new Map<string, Ratelimit>();

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    const windowSec = Math.ceil(windowMs / 1000);
    const duration = `${windowSec} s` as `${number} s`;
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, duration),
      prefix: 'rl',
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

// ============ CORE FUNCTION ============

/**
 * Check (and record) a rate-limit hit for a given key.
 *
 * Uses Upstash Redis when configured, falls back to in-memory.
 *
 * @param key      Unique identifier (e.g. `ip:login:1.2.3.4` or `user:api:abc123`)
 * @param limit    Maximum number of requests allowed within the window
 * @param windowMs Window duration in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!redis) {
    return memoryCheckRateLimit(key, limit, windowMs);
  }

  try {
    const limiter = getUpstashLimiter(limit, windowMs);
    const result = await limiter.limit(key);

    return {
      allowed: result.success,
      remaining: result.remaining,
      resetMs: Math.max(result.reset - Date.now(), 0),
      limit: result.limit,
    };
  } catch (error) {
    console.error('[Rate Limiter] Redis error, falling back to memory:', error);
    return memoryCheckRateLimit(key, limit, windowMs);
  }
}

// ============ IP EXTRACTION ============

/**
 * Extract the client IP address from a Next.js request.
 * Checks standard proxy headers in priority order.
 */
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  return '127.0.0.1';
}

// ============ HELPER FUNCTIONS ============

/**
 * Rate-limit a request by the client's IP address.
 * Suitable for unauthenticated routes (login, register, webhooks).
 */
export async function rateLimitByIP(
  req: NextRequest,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const ip = getClientIP(req);
  const key = `ip:${ip}`;
  return checkRateLimit(key, limit, windowMs);
}

/**
 * Rate-limit a request by the authenticated user's ID.
 * Suitable for authenticated API routes.
 */
export async function rateLimitByUser(
  userId: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult & { resetTime: number }> {
  const result = await checkRateLimit(`user:${userId}`, limit, windowMs);
  return {
    ...result,
    resetTime: Date.now() + result.resetMs,
  };
}

// ============ PRESET LIMITS ============

/** Login: 5 attempts per 60 seconds per IP */
export async function loginRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIP(req);
  return checkRateLimit(`ip:login:${ip}`, 5, 60 * 1000);
}

/** Register: 3 attempts per hour per IP */
export async function registerRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIP(req);
  return checkRateLimit(`ip:register:${ip}`, 3, 60 * 60 * 1000);
}

/** API routes: 100 requests per minute per user */
export async function apiRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(`user:api:${userId}`, 100, 60 * 1000);
}

/** Webhooks: 30 requests per minute per IP */
export async function webhookRateLimit(req: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIP(req);
  return checkRateLimit(`ip:webhook:${ip}`, 30, 60 * 1000);
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
  memoryStore.delete(key);
}

/**
 * Reset all rate-limit state.
 * Useful in test teardown.
 */
export function resetAllRateLimits(): void {
  memoryStore.clear();
}

/**
 * Stop the background cleanup interval.
 * Call this during test teardown to prevent timer leaks.
 */
export function stopCleanup(): void {
  // No-op: cleanup is self-contained in the module init block
}
