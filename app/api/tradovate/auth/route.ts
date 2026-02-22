import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';

export async function GET(req: NextRequest) {
  // Require authentication + rate limit
  const auth = await requireAuth(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: auth.headers });
  }
  // Get credentials from environment variables
  const username = process.env.TRADOVATE_USERNAME;
  const password = process.env.TRADOVATE_PASSWORD;
  const appId = process.env.TRADOVATE_APP_ID;
  const appVersion = process.env.TRADOVATE_APP_VERSION || '1.0.0';
  const cid = process.env.TRADOVATE_CID;
  const sec = process.env.TRADOVATE_SECRET;
  const isDemo = process.env.TRADOVATE_DEMO !== 'false';

  if (!username || !password) {
    return NextResponse.json({
      error: 'Tradovate credentials not configured',
      message: 'Set TRADOVATE_USERNAME and TRADOVATE_PASSWORD in .env.local',
    }, { status: 401 });
  }

  try {
    const apiUrl = isDemo ? TRADOVATE_DEMO_API : TRADOVATE_LIVE_API;

    const response = await fetch(`${apiUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        name: username,
        password: password,
        appId: appId || 'Sample App',
        appVersion: appVersion,
        cid: cid,
        sec: sec,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Tradovate Auth] Failed:', error);
      return NextResponse.json({
        error: 'Authentication failed',
        details: error,
      }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      accessToken: data.accessToken,
      expirationTime: data.expirationTime,
      userId: data.userId,
      name: data.name,
    });
  } catch (error) {
    console.error('[Tradovate Auth] Error:', error);
    return NextResponse.json({
      error: 'Failed to authenticate with Tradovate',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
