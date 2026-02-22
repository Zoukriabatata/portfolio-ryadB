/**
 * SENZOUKRIA MIDDLEWARE
 *
 * - Authentication check
 * - Subscription-based access control
 * - Device verification
 * - Session validation
 * - Concurrent session detection (anti-sharing)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { detectConcurrentSession, sendSecurityAlert } from '@/lib/auth/session-validator';
import { detectImpossibleTravel } from '@/lib/auth/geo-validator';

// ─── Rate Limiter (edge-compatible, in-memory) ─────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  '/api/auth/': 20,           // 20 auth requests per minute
  '/api/stripe/checkout': 5,   // 5 checkout attempts per minute
  '/api/support': 5,           // 5 support tickets per minute
};

function checkRateLimit(ip: string, pathname: string): boolean {
  for (const [prefix, maxRequests] of Object.entries(RATE_LIMITS)) {
    if (!pathname.startsWith(prefix)) continue;

    const key = `${ip}:${prefix}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
      return false;
    }

    entry.count++;
    if (entry.count > maxRequests) return true; // Rate limited
  }
  return false;
}

// Clean up stale entries periodically (avoid memory leak in long-running edge)
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  };
  setInterval(cleanup, 60_000);
}

// Admin emails
const ADMIN_EMAILS = ['ryad.bouderga78@gmail.com'];

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/chart',
  '/live',
  '/footprint',
  '/orderflow',
  '/liquidity',
  '/volatility',
  '/gex',
  '/bias',
  '/backtest',
  '/replay',
  '/news',
  '/journal',
  '/account',
  '/boutique',
  '/admin',
];

// Routes that require specific subscription tiers
const TIER_ROUTES: Record<string, ('FREE' | 'ULTRA')[]> = {
  '/chart': ['FREE', 'ULTRA'],
  '/live': ['FREE', 'ULTRA'],
  '/bias': ['FREE', 'ULTRA'],
  '/boutique': ['FREE', 'ULTRA'],
  '/account': ['FREE', 'ULTRA'],
  '/footprint': ['ULTRA'],
  '/orderflow': ['ULTRA'],
  '/liquidity': ['ULTRA'],
  '/volatility': ['ULTRA'],
  '/gex': ['ULTRA'],
  '/journal': ['ULTRA'],
  '/replay': ['ULTRA'],
  '/backtest': ['ULTRA'],
  '/news': ['ULTRA'],
};

// Public routes (no auth required)
const PUBLIC_ROUTES = [
  '/',
  '/auth/login',
  '/auth/register',
  '/auth/error',
  '/pricing',
  '/api/auth',
  '/api/stripe/webhook',
  '/api/paypal/webhook',
  '/legal',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── CORS + Rate limiting for API routes ─────────
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = [
      process.env.NEXTAUTH_URL || 'http://localhost:3000',
      process.env.NEXT_PUBLIC_APP_URL,
      'https://senzoukria.com',
      'https://www.senzoukria.com',
    ].filter(Boolean) as string[];

    // Block CORS preflight from unauthorized origins
    if (request.method === 'OPTIONS') {
      const isAllowed = !origin || allowedOrigins.some(o => origin.startsWith(o));
      if (!isAllowed) {
        return new NextResponse(null, { status: 403 });
      }
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || allowedOrigins[0],
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Rate limiting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0].trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    if (checkRateLimit(ip, pathname)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Webhook routes skip CORS (server-to-server)
    const isWebhook = pathname.includes('/webhook');
    if (!isWebhook && origin) {
      const isAllowed = allowedOrigins.some(o => origin.startsWith(o));
      if (!isAllowed) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
    }
  }

  // Skip public routes and static files
  if (
    PUBLIC_ROUTES.some(route => pathname.startsWith(route)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if route requires protection
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Get session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Not authenticated - redirect to login
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ CONCURRENT SESSION DETECTION (Anti-Account Sharing)
  if (token) {
    // Get IP address (handle various proxy headers)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfIp = request.headers.get('cf-connecting-ip');
    const ip = forwardedFor?.split(',')[0].trim() || realIp || cfIp || '127.0.0.1';

    // Get browser fingerprint from cookie
    const fingerprintCookie = request.cookies.get('_fp');
    const fingerprint = fingerprintCookie?.value || 'unknown';

    // Detect suspicious session activity
    const sessionCheck = await detectConcurrentSession(
      token.id as string,
      token.sessionId as string,
      ip,
      fingerprint
    );

    if (sessionCheck.suspicious) {
      // ⚠️ BALANCED APPROACH: Alert + Re-auth, not brutal blocking
      if (sessionCheck.severity === 'high') {
        // HIGH SEVERITY: Invalidate session and force re-auth
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('error', 'session_invalid');
        loginUrl.searchParams.set('reason', encodeURIComponent(sessionCheck.reason || 'Activité suspecte détectée'));

        // Send security alert email to user
        await sendSecurityAlert(token.email as string, {
          type: 'concurrent_session',
          reason: sessionCheck.reason,
        });

        return NextResponse.redirect(loginUrl);
      } else if (sessionCheck.severity === 'medium') {
        // MEDIUM SEVERITY: Add warning header but allow request
        const response = NextResponse.next();
        response.headers.set('X-Security-Warning', sessionCheck.reason || 'Session activity flagged');
        return response;
      }
      // LOW SEVERITY: Just log, don't block
    }

    // ✅ GEOLOCATION & IMPOSSIBLE TRAVEL DETECTION
    // Check if user moved impossibly fast between locations
    const geoCheck = await detectImpossibleTravel(
      token.id as string,
      ip
    );

    if (geoCheck.suspicious) {
      // ⚠️ BALANCED APPROACH: Alert + Re-auth for impossible travel
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('error', 'security_check');
      loginUrl.searchParams.set('reason', 'geo');

      // Send security alert with travel details
      await sendSecurityAlert(token.email as string, {
        type: 'impossible_travel',
        reason: geoCheck.reason,
        distance: geoCheck.distance,
        timeDiff: geoCheck.timeDiff,
      });

      // Log event for admin review
      console.warn(`🌍 Impossible travel detected for user ${token.email}:`, geoCheck);

      return NextResponse.redirect(loginUrl);
    }
  }

  // Admin route protection — show 404 to non-admins (don't reveal /admin exists)
  if (pathname.startsWith('/admin')) {
    const userEmail = token.email as string;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }
  }

  // Check subscription tier for route access
  const userTier = token.tier as 'FREE' | 'ULTRA';
  const matchingRoute = Object.keys(TIER_ROUTES).find(route =>
    pathname.startsWith(route)
  );

  if (matchingRoute) {
    const allowedTiers = TIER_ROUTES[matchingRoute];

    if (!allowedTiers.includes(userTier)) {
      // User doesn't have access — show 404 (don't reveal route exists)
      return NextResponse.rewrite(new URL('/not-found', request.url));
    }
  }

  // Check subscription expiration
  const subscriptionEnd = token.subscriptionEnd as string | null;
  if (subscriptionEnd && new Date(subscriptionEnd) < new Date()) {
    // Subscription expired — treat as FREE, show 404 for ULTRA routes
    const expiredTier = 'FREE' as const;
    if (matchingRoute) {
      const allowedTiers = TIER_ROUTES[matchingRoute];
      if (allowedTiers && !allowedTiers.includes(expiredTier)) {
        return NextResponse.rewrite(new URL('/not-found', request.url));
      }
    }
  }

  // Add user info to headers for server components
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.tradovateapi.com wss://*.tradovateapi.com https://api.stripe.com https://stream.binance.com wss://stream.binance.com wss://stream.bybit.com wss://www.deribit.com https://*.vercel.app",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  response.headers.set('x-user-id', token.id as string);
  response.headers.set('x-user-tier', userTier);

  // CORS headers for API responses
  const origin = request.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
