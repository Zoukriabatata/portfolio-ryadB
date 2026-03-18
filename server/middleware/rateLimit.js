/**
 * In-memory rate limiter for WebSocket connections.
 *
 * Limits each IP to MAX_CONNECTIONS_PER_WINDOW new connections within
 * WINDOW_MS. Uses a sliding window to avoid sharp resets at minute boundaries.
 *
 * This is a lightweight guard against connection floods; for production
 * consider Redis-backed rate limiting if running multiple server instances.
 */

'use strict';

const WINDOW_MS = 60_000; // 1 minute
const MAX_CONNECTIONS_PER_WINDOW = 15;

// Periodically clean up stale IP entries to prevent unbounded growth
const CLEANUP_INTERVAL_MS = 5 * 60_000; // every 5 minutes

class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} ip → array of connection timestamps */
    this._store = new Map();

    // Cleanup timer — removes IPs that haven't connected recently
    this._cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref(); // Don't block process exit
  }

  /**
   * Check whether an IP is within the rate limit.
   * Records the attempt if allowed.
   *
   * @param {string} ip
   * @returns {boolean} true if allowed, false if rate-limited
   */
  check(ip) {
    const now = Date.now();
    const timestamps = (this._store.get(ip) || []).filter((t) => now - t < WINDOW_MS);

    if (timestamps.length >= MAX_CONNECTIONS_PER_WINDOW) {
      return false; // Rate limited
    }

    timestamps.push(now);
    this._store.set(ip, timestamps);
    return true;
  }

  _cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this._store.entries()) {
      const recent = timestamps.filter((t) => now - t < WINDOW_MS);
      if (recent.length === 0) {
        this._store.delete(ip);
      } else {
        this._store.set(ip, recent);
      }
    }
  }
}

// Singleton — shared across all connection handlers
const rateLimiter = new RateLimiter();

module.exports = { rateLimiter };
