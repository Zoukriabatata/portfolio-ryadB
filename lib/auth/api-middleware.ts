/**
 * API Middleware - Authentication & Authorization for API Routes
 *
 * Provides authentication and rate limiting for all API endpoints.
 * Prevents unauthorized access and API abuse.
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { rateLimitByUser } from '@/lib/auth/rate-limiter';

interface AuthResult {
  user: {
    id: string;
    email: string;
    tier: string;
    [key: string]: any;
  };
  rateLimit: {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  };
  headers: Record<string, string>;
}

interface AuthError {
  error: string;
  status: number;
  headers?: Record<string, string>;
}

/**
 * Require authentication for API routes
 *
 * Validates JWT token and applies per-user rate limiting.
 * Returns user info + rate limit status or error.
 *
 * Usage:
 * ```typescript
 * const authResult = await requireAuth(request);
 * if ('error' in authResult) {
 *   return NextResponse.json({ error: authResult.error }, { status: authResult.status });
 * }
 * // Use authResult.user and authResult.headers
 * ```
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult | AuthError> {
  try {
    // Get JWT token from NextAuth
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET,
    });

    if (!token || !token.id) {
      return {
        error: 'Authentication required. Please log in.',
        status: 401,
      };
    }

    // Apply rate limiting per user (100 requests per minute)
    const rateLimit = await rateLimitByUser(
      token.id as string,
      100, // limit
      60000 // 1 minute window
    );

    if (!rateLimit.allowed) {
      return {
        error: 'Rate limit exceeded. Please slow down.',
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimit.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
          'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
        },
      };
    }

    // Success - return user info and rate limit headers
    return {
      user: {
        id: token.id as string,
        email: token.email as string,
        tier: (token.tier as string) || 'FREE',
        name: token.name as string,
      },
      rateLimit,
      headers: {
        'X-RateLimit-Limit': rateLimit.limit.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      },
    };
  } catch (error) {
    console.error('Auth middleware error:', error);
    return {
      error: 'Internal authentication error',
      status: 500,
    };
  }
}

/**
 * Require specific subscription tier
 *
 * Checks if user has required subscription level.
 * Use after requireAuth() to enforce tier-based access.
 *
 * Usage:
 * ```typescript
 * const tierCheck = await requireTier('ULTRA', authResult.user.tier);
 * if (tierCheck) {
 *   return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
 * }
 * ```
 */
export async function requireTier(
  requiredTier: 'FREE' | 'ULTRA',
  userTier: string
): Promise<AuthError | null> {
  // FREE tier check (always passes)
  if (requiredTier === 'FREE') {
    return null;
  }

  // ULTRA tier check
  if (requiredTier === 'ULTRA' && userTier !== 'ULTRA') {
    return {
      error: 'ULTRA subscription required for this feature. Please upgrade your plan.',
      status: 403,
    };
  }

  return null;
}

/**
 * Check if user has active subscription
 *
 * Additional helper to validate subscription expiry.
 */
export function hasActiveSubscription(subscriptionEnd?: Date | null): boolean {
  if (!subscriptionEnd) return false;
  return new Date(subscriptionEnd) > new Date();
}

/**
 * Extract IP address from request
 *
 * Handles various proxy headers (Vercel, Cloudflare, etc.)
 */
export function getClientIp(req: NextRequest): string {
  // Try x-forwarded-for (most common for proxies)
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Try x-real-ip (nginx, Cloudflare)
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Try CF-Connecting-IP (Cloudflare specific)
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  // Fallback
  return '127.0.0.1';
}
