import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

// Server-side proxy for Binance depth — bypasses client-side geo-restrictions.
//
// AUTH: PRO subscribers only. The endpoint forwards to Binance public API,
// but unauthenticated proxying turned this into a free Binance-as-a-service
// for anyone on the internet. We now require a valid session + rate limit
// per user. CORS is locked to our own origin (no wildcard).

const BINANCE_FUTURES = 'https://fapi.binance.com';
const BINANCE_SPOT = 'https://api.binance.com';

// Origins authorized to call this endpoint via cross-origin XHR. The Tauri
// desktop webview ships at `tauri://localhost` (Windows) / `https://tauri.localhost`
// (macOS) so we whitelist both. The Vercel-hosted web app is the main caller.
const ALLOWED_ORIGINS = new Set([
  'https://orderflow-v2.vercel.app',
  'https://portfolio-ryad-b.vercel.app',
  'http://localhost:3000',
  'http://localhost:1420',
  'tauri://localhost',
  'https://tauri.localhost',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
  };
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(req.headers.get('origin')) },
    );
  }

  // Per-user rate limit — prevents a single subscriber from hammering the
  // upstream feed and getting our IP banned by Binance.
  const rl = await apiRateLimit(session.user.id);
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const market = searchParams.get('market') || 'futures';

  // Whitelist the upstream selectors so the endpoint can't be coerced into
  // proxying arbitrary URLs.
  if (!/^[A-Z0-9]{3,12}USDT?$/.test(symbol)) {
    return NextResponse.json(
      { error: 'Invalid symbol' },
      { status: 400, headers: corsHeaders(req.headers.get('origin')) },
    );
  }
  if (market !== 'futures' && market !== 'spot') {
    return NextResponse.json(
      { error: 'Invalid market' },
      { status: 400, headers: corsHeaders(req.headers.get('origin')) },
    );
  }

  const base = market === 'futures' ? BINANCE_FUTURES : BINANCE_SPOT;
  const path = market === 'futures' ? '/fapi/v1/depth' : '/api/v3/depth';

  try {
    const res = await fetch(
      `${base}${path}?symbol=${symbol}&limit=500`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'upstream error', status: res.status },
        { status: 502, headers: corsHeaders(req.headers.get('origin')) },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeaders(req.headers.get('origin')),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    return NextResponse.json(
      { error: message },
      { status: 503, headers: corsHeaders(req.headers.get('origin')) },
    );
  }
}
