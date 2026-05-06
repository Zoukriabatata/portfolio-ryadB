/**
 * GET /api/auth/desktop-bridge?token=<JWT>&next=/live
 *
 * Atomically converts a fresh Ed25519 license JWT (issued at most 60s
 * ago by /api/license/login) into a NextAuth session cookie, then
 * redirects the user inside the desktop webview to a whitelisted page
 * of the web product.
 *
 * Without this bridge the desktop app and the web product would have
 * two parallel auth states; with it the user logs in once on the
 * desktop and lands fully authenticated on the web side, which lets
 * the Tauri webview render the existing footprint / GEX / heatmap /
 * etc. pages with zero porting work.
 *
 * Failure mode: 302 to /auth/login?error=desktop_bridge_<code>. The
 * login page already surfaces ?error= via ERROR_LABELS so the user
 * gets a humanised message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { randomUUID } from 'node:crypto';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { verifyLicenseJwt } from '@/lib/license/jwt';
import { loginRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';
import { generateSessionId } from '@/lib/auth/security';

export const dynamic = 'force-dynamic';

const ALLOWED_NEXT_PATHS = [
  '/', '/live', '/dashboard', '/footprint', '/orderflow', '/heatmap',
  '/gex', '/volatility', '/flow', '/trading', '/journal', '/replay',
  '/backtest', '/bias', '/news', '/academy', '/account', '/boutique',
  '/ai',
] as const;

const FALLBACK_NEXT         = '/live';
const HANDOFF_FRESHNESS_SEC = 60;
const NEXTAUTH_MAX_AGE_SEC  = 6 * 60 * 60;

function redact(t: string): string {
  return `${t.slice(0, 8)}...`;
}

function safeNext(raw: string | null): string {
  if (!raw) return FALLBACK_NEXT;
  return (ALLOWED_NEXT_PATHS as readonly string[]).includes(raw)
    ? raw
    : FALLBACK_NEXT;
}

function failRedirect(req: NextRequest, code: string): NextResponse {
  const url = new URL('/auth/login', req.url);
  url.searchParams.set('error', `desktop_bridge_${code.toLowerCase()}`);
  const res = NextResponse.redirect(url, 302);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}

export async function GET(req: NextRequest) {
  const rl = await loginRateLimit(req);
  if (!rl.allowed) return tooManyRequests(rl);

  const tokenRaw = req.nextUrl.searchParams.get('token');
  const next     = safeNext(req.nextUrl.searchParams.get('next'));

  if (!tokenRaw) {
    console.warn('[desktop-bridge] FAIL reason=NO_TOKEN');
    return failRedirect(req, 'NO_TOKEN');
  }

  if (!isPrismaAvailable()) {
    console.warn('[desktop-bridge] FAIL reason=DB_UNAVAILABLE');
    return failRedirect(req, 'DB_UNAVAILABLE');
  }

  const verify = await verifyLicenseJwt(tokenRaw);
  if (!verify.valid) {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} reason=${verify.error}`);
    return failRedirect(req, verify.error);
  }

  // Fresh-handoff guard — the bridge call must happen within 60s of
  // /api/license/login minting the token, otherwise we treat it as a
  // replay/stale handoff and refuse.
  const iat = verify.payload.iat ?? 0;
  if (Date.now() / 1000 - iat > HANDOFF_FRESHNESS_SEC) {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} reason=STALE_HANDOFF iat=${iat}`);
    return failRedirect(req, 'STALE_HANDOFF');
  }

  // Re-check live entitlement (the JWT is a fast path, not the truth).
  const user = await prisma.user.findUnique({
    where:   { id: verify.payload.sub },
    include: { license: { include: { machines: true } } },
  });
  if (!user) {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} reason=USER_NOT_FOUND`);
    return failRedirect(req, 'USER_NOT_FOUND');
  }
  if (user.subscriptionTier !== 'PRO' ||
      (user.subscriptionEnd && user.subscriptionEnd < new Date())) {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} user=${user.id} reason=NOT_SUBSCRIBED`);
    return failRedirect(req, 'NOT_SUBSCRIBED');
  }
  if (!user.license || user.license.status !== 'ACTIVE') {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} user=${user.id} reason=LICENSE_INACTIVE`);
    return failRedirect(req, 'LICENSE_INACTIVE');
  }
  const machineRow = user.license.machines.find(
    m => m.machineId === verify.payload.machineId,
  );
  if (!machineRow) {
    console.warn(`[desktop-bridge] FAIL token=${redact(tokenRaw)} user=${user.id} reason=MACHINE_NOT_FOUND`);
    return failRedirect(req, 'MACHINE_NOT_FOUND');
  }

  // Mint a NextAuth-compatible session token. Shape mirrors what the
  // jwt callback in lib/auth/auth-options.ts produces, so the session
  // callback that consumes it doesn't need any branching.
  const sessionId = generateSessionId();
  const nowSec    = Math.floor(Date.now() / 1000);
  const payload = {
    id:                user.id,
    email:             user.email,
    name:              user.name ?? null,
    picture:           user.avatar ?? null,
    tier:              'PRO' as const,
    deviceId:          verify.payload.machineId,
    sessionId,
    hasResearchPack:   user.hasResearchPack ?? false,
    subscriptionEnd:   user.subscriptionEnd?.toISOString() ?? null,
    iat:               nowSec,
    exp:               nowSec + NEXTAUTH_MAX_AGE_SEC,
    jti:               randomUUID(),
  };

  if (!process.env.NEXTAUTH_SECRET) {
    console.error('[desktop-bridge] FAIL reason=NO_NEXTAUTH_SECRET');
    return failRedirect(req, 'ENCODE_ERROR');
  }

  let encoded: string;
  try {
    encoded = await encode({
      token:  payload,
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: NEXTAUTH_MAX_AGE_SEC,
    });
  } catch (err) {
    console.error('[desktop-bridge] FAIL encode error:', err);
    return failRedirect(req, 'ENCODE_ERROR');
  }

  // Parity with web credentials login — track the desktop session in DB.
  // Non-fatal: if the row insert fails the cookie still works, the only
  // loss is observability for this device.
  try {
    await prisma.session.create({
      data: {
        userId:    user.id,
        token:     sessionId,
        deviceId:  verify.payload.machineId,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desktop',
        userAgent: req.headers.get('user-agent') ?? 'OrderflowV2-Desktop',
        expiresAt: new Date(Date.now() + NEXTAUTH_MAX_AGE_SEC * 1000),
      },
    });
  } catch (err) {
    console.warn('[desktop-bridge] WARN session row create failed:', err);
  }

  console.log(`[desktop-bridge] OK token=${redact(tokenRaw)} user=${user.id} next=${next}`);

  const dest = new URL(next, req.url);
  const res  = NextResponse.redirect(dest, 302);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  // NextAuth v4 cookie naming follows the request protocol — same logic
  // as the live auth-options handler so /api/auth/session reads back
  // whichever cookie this bridge writes.
  const isHttps    = req.nextUrl.protocol === 'https:';
  const cookieName = isHttps ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  res.cookies.set({
    name:     cookieName,
    value:    encoded,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    secure:   isHttps,
    maxAge:   NEXTAUTH_MAX_AGE_SEC,
  });
  return res;
}
