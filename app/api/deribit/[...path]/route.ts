import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

const DERIBIT_API = 'https://www.deribit.com/api/v2';
const DERIBIT_TEST_API = 'https://test.deribit.com/api/v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // ✅ AUTHENTICATION REQUIRED
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      {
        status: authResult.status,
        headers: authResult.headers,
      }
    );
  }

  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const isTestnet = request.headers.get('x-testnet') === 'true';

  // ✅ TIER VALIDATION - Options data requires PRO
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json(
      { error: tierCheck.error },
      { status: tierCheck.status }
    );
  }

  const baseUrl = isTestnet ? DERIBIT_TEST_API : DERIBIT_API;
  const url = `${baseUrl}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    // ✅ ADD RATE LIMIT + CACHE HEADERS
    // Options data changes frequently but historical snapshots can be cached briefly
    return NextResponse.json(data, {
      headers: {
        ...authResult.headers,
        'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('[Deribit API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Deribit' },
      { status: 500 }
    );
  }
}
