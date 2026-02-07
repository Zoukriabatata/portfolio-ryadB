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

// Admin emails
const ADMIN_EMAILS = ['ryad.bouderga78@gmail.com'];

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/chart',
  '/footprint',
  '/orderflow',
  '/liquidity',
  '/volatility',
  '/gex',
  '/backtest',
  '/replay',
  '/news',
  '/journal',
  '/account',
  '/admin',
];

// Routes that require specific subscription tiers
const TIER_ROUTES: Record<string, ('FREE' | 'ULTRA')[]> = {
  '/chart': ['FREE', 'ULTRA'],
  '/live': ['FREE', 'ULTRA'],
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

  // Admin route protection
  if (pathname.startsWith('/admin')) {
    const userEmail = token.email as string;
    if (!ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.redirect(new URL('/', request.url));
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
      // User doesn't have access - redirect to upgrade page
      const upgradeUrl = new URL('/pricing', request.url);
      upgradeUrl.searchParams.set('upgrade', 'true');
      upgradeUrl.searchParams.set('required', getRequiredTier(matchingRoute));
      upgradeUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(upgradeUrl);
    }
  }

  // Check subscription expiration
  const subscriptionEnd = token.subscriptionEnd as string | null;
  if (subscriptionEnd && new Date(subscriptionEnd) < new Date()) {
    // Subscription expired - treat as FREE
    const expiredTier = 'FREE' as const;
    if (matchingRoute) {
      const allowedTiers = TIER_ROUTES[matchingRoute];
      if (allowedTiers && !allowedTiers.includes(expiredTier)) {
        const upgradeUrl = new URL('/pricing', request.url);
        upgradeUrl.searchParams.set('upgrade', 'true');
        upgradeUrl.searchParams.set('expired', 'true');
        upgradeUrl.searchParams.set('from', pathname);
        return NextResponse.redirect(upgradeUrl);
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

  response.headers.set('x-user-id', token.id as string);
  response.headers.set('x-user-tier', userTier);
  response.headers.set('x-user-email', token.email as string);

  return response;
}

function getRequiredTier(route: string): string {
  const tiers = TIER_ROUTES[route];
  if (!tiers) return 'ULTRA';

  // Return the lowest tier that has access
  if (tiers.includes('FREE')) return 'FREE';
  return 'ULTRA';
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
