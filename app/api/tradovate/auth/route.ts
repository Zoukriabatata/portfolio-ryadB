import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';

// ── Server-side token cache ────────────────────────────────────────────────
// Stores one access token per user (keyed by userId+mode) so repeated calls
// from TradovateWS.connect() don't hammer the Tradovate auth API.
// Tokens are cached with a 5-minute safety buffer before their actual expiry.
interface CachedToken {
  accessToken: string;
  name: string;
  expiresAt: number; // Unix ms
}
const tokenCache = new Map<string, CachedToken>();

function getCachedToken(cacheKey: string): CachedToken | null {
  const cached = tokenCache.get(cacheKey);
  if (!cached) return null;
  // Use cache if token is valid for at least another 5 minutes
  if (Date.now() < cached.expiresAt - 5 * 60 * 1000) return cached;
  tokenCache.delete(cacheKey);
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const isDev = process.env.NODE_ENV === 'development';

  // In production we require a logged-in session. In dev we accept env-var
  // credentials so contributors can run a Tradovate sim without touching
  // the auth/DB stack.
  if (!isDev && !session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 1. Try user's saved credentials from DB (set via /boutique)
  let username = process.env.TRADOVATE_USERNAME;
  let password = process.env.TRADOVATE_PASSWORD;
  let isDemo = process.env.TRADOVATE_DEMO !== 'false'; // default from env

  if (session?.user) {
    try {
      const config = await prisma.dataFeedConfig.findFirst({
        where: { userId: session.user.id, provider: 'TRADOVATE' },
      });
      if (config?.username && config?.apiKey) {
        username = config.username;
        password = config.apiKey; // ConfigureModal stores password as apiKey
      }
      // host column repurposed to store 'demo' | 'live' mode chosen by user
      if (config?.host === 'live') isDemo = false;
      else if (config?.host === 'demo') isDemo = true;
    } catch {
      // DB read failed — fall through to env vars
    }
  }

  const appId = process.env.TRADOVATE_APP_ID || 'Senzoukria';
  const appVersion = process.env.TRADOVATE_APP_VERSION || '1.0.0';
  const cid = process.env.TRADOVATE_CID;
  const sec = process.env.TRADOVATE_SECRET;

  if (!username || !password) {
    return NextResponse.json({
      error: 'Tradovate credentials not configured',
      message: 'Configure Tradovate on the Data Feeds page first.',
    }, { status: 401 });
  }

  // Check cache before hitting Tradovate API
  const userKey = session?.user?.id ?? 'dev-env';
  const cacheKey = `${userKey}:${isDemo ? 'demo' : 'live'}`;
  const cached = getCachedToken(cacheKey);
  if (cached) {
    return NextResponse.json({
      accessToken: cached.accessToken,
      name: cached.name,
      cached: true,
    });
  }

  try {
    const apiUrl = isDemo ? TRADOVATE_DEMO_API : TRADOVATE_LIVE_API;
    const baseBody = {
      name: username,
      password,
      appId,
      appVersion,
      cid: cid || undefined,
      sec: sec || undefined,
    };

    /**
     * Tradovate's "penalty" auth flow:
     *   1. First request returns 200 with { p-ticket, p-time, p-captcha }.
     *   2. Wait p-time seconds, resubmit with the same body + the p-ticket.
     *   3. If p-captcha === true, a HUMAN must solve a captcha at
     *      https://trader.tradovate.com first — we cannot bypass that.
     *
     * This loop handles steps 1+2 automatically, up to 3 cycles.
     */
    let attempt = 0;
    let pTicket: string | undefined;
    let lastResponse: Response | null = null;

    while (attempt < 4) {
      const body = pTicket ? { ...baseBody, 'p-ticket': pTicket } : baseBody;
      lastResponse = await fetch(`${apiUrl}/auth/accesstokenrequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!lastResponse.ok) {
        const errorText = await lastResponse.text();
        console.error('[Tradovate Auth] HTTP error:', lastResponse.status, errorText);
        return NextResponse.json(
          { error: errorText || 'Authentication failed' },
          { status: lastResponse.status },
        );
      }

      const data = await lastResponse.json();

      // Hard captcha — needs human, abort
      if (data['p-captcha']) {
        console.warn('[Tradovate Auth] Captcha required — open trader.tradovate.com and log in to clear it');
        return NextResponse.json({
          error: 'Captcha required — go to https://trader.tradovate.com, log in, then retry',
        }, { status: 403 });
      }

      // Penalty ticket — wait and retry automatically
      if (data['p-ticket'] && data['p-time']) {
        const waitSec = Math.min(data['p-time'], 30);
        console.log(`[Tradovate Auth] Penalty ticket received — waiting ${waitSec}s before retry (attempt ${attempt + 1}/3)`);
        pTicket = data['p-ticket'];
        await new Promise(r => setTimeout(r, waitSec * 1000));
        attempt++;
        continue;
      }

      // Got the real token
      if (data.accessToken) {
        tokenCache.set(cacheKey, {
          accessToken: data.accessToken,
          name: data.name,
          expiresAt: new Date(data.expirationTime).getTime(),
        });
        console.log('[Tradovate Auth] Authenticated as', data.name);
        return NextResponse.json({
          accessToken: data.accessToken,
          expirationTime: data.expirationTime,
          userId: data.userId,
          name: data.name,
        });
      }

      // Unknown response shape
      console.error('[Tradovate Auth] Unexpected response:', data);
      return NextResponse.json({ error: data.errorText || 'Unknown auth response' }, { status: 500 });
    }

    return NextResponse.json({
      error: 'Tradovate kept returning penalty tickets — try again in a few minutes',
    }, { status: 429 });
  } catch (error) {
    console.error('[Tradovate Auth] Error:', error);
    return NextResponse.json({
      error: 'Failed to authenticate with Tradovate',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
