import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';

// Cache for contract lookups (keyed by symbol)
const contractCache = new Map<string, { id: number; name: string; tickSize: number }>();

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const isDev = process.env.NODE_ENV === 'development';

  // Production: require auth. Dev: env-var credentials are accepted upstream
  // (/api/tradovate/auth handles its own dev fallback).
  if (!isDev && !session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  // Check cache first
  if (contractCache.has(symbol)) {
    return NextResponse.json(contractCache.get(symbol));
  }

  // Get access token — call auth API internally by forwarding cookies
  const origin = request.nextUrl.origin;
  const cookieHeader = request.headers.get('cookie') || '';
  const authResponse = await fetch(`${origin}/api/tradovate/auth`, {
    headers: { cookie: cookieHeader },
  });
  const authData = await authResponse.json();

  if (!authData.accessToken) {
    return NextResponse.json({
      error: 'Not authenticated with Tradovate',
      message: authData.error || 'Configure Tradovate on the Data Feeds page first.',
    }, { status: 401 });
  }

  const isDemo = process.env.TRADOVATE_DEMO !== 'false';
  const apiUrl = isDemo ? TRADOVATE_DEMO_API : TRADOVATE_LIVE_API;

  try {
    const response = await fetch(`${apiUrl}/contract/find?name=${encodeURIComponent(symbol)}`, {
      headers: {
        'Authorization': `Bearer ${authData.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Contract not found', symbol }, { status: 404 });
    }

    const contract = await response.json();
    const result = {
      id: contract.id,
      name: contract.name,
      tickSize: contract.tickSize || 0.25,
      contractMaturityId: contract.contractMaturityId,
      productId: contract.productId,
    };

    contractCache.set(symbol, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Tradovate Contract] Error:', error);
    return NextResponse.json({
      error: 'Failed to fetch contract',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
