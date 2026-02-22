import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 1. Try user's saved credentials from DB (set via /boutique)
  let username = process.env.TRADOVATE_USERNAME;
  let password = process.env.TRADOVATE_PASSWORD;

  try {
    const config = await prisma.dataFeedConfig.findFirst({
      where: { userId: session.user.id, provider: 'TRADOVATE' },
    });
    if (config?.username && config?.apiKey) {
      username = config.username;
      password = config.apiKey; // ConfigureModal stores password as apiKey
    }
  } catch {
    // DB read failed — fall through to env vars
  }

  const appId = process.env.TRADOVATE_APP_ID || 'Senzoukria';
  const appVersion = process.env.TRADOVATE_APP_VERSION || '1.0.0';
  const cid = process.env.TRADOVATE_CID;
  const sec = process.env.TRADOVATE_SECRET;
  const isDemo = process.env.TRADOVATE_DEMO !== 'false';

  if (!username || !password) {
    return NextResponse.json({
      error: 'Tradovate credentials not configured',
      message: 'Configure Tradovate on the Data Feeds page first.',
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
        password,
        appId,
        appVersion,
        cid: cid || undefined,
        sec: sec || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Tradovate Auth] Failed:', errorText);
      let errorMsg = 'Authentication failed';
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson['p-ticket']
          ? 'Captcha required — log into Tradovate website first, then retry'
          : errorJson.errorText || errorJson.message || errorMsg;
      } catch {
        // use default
      }
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    const data = await response.json();

    if (data['p-ticket']) {
      return NextResponse.json({
        error: 'Captcha required — log into Tradovate website first, then retry',
      }, { status: 403 });
    }

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
