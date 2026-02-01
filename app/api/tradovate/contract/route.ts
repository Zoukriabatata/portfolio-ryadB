import { NextRequest, NextResponse } from 'next/server';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';

// Cache for contract lookups
const contractCache = new Map<string, { id: number; name: string; tickSize: number }>();

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  // Check cache first
  if (contractCache.has(symbol)) {
    return NextResponse.json(contractCache.get(symbol));
  }

  // Get access token first
  const authResponse = await fetch(`${request.nextUrl.origin}/api/tradovate/auth`);
  const authData = await authResponse.json();

  if (!authData.accessToken) {
    return NextResponse.json({
      error: 'Not authenticated',
      message: authData.error || 'Failed to get access token',
    }, { status: 401 });
  }

  try {
    const response = await fetch(`${TRADOVATE_DEMO_API}/contract/find?name=${symbol}`, {
      headers: {
        'Authorization': `Bearer ${authData.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        error: 'Contract not found',
        symbol,
      }, { status: 404 });
    }

    const contract = await response.json();

    const result = {
      id: contract.id,
      name: contract.name,
      tickSize: contract.tickSize || 0.25,
      contractMaturityId: contract.contractMaturityId,
      productId: contract.productId,
    };

    // Cache the result
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
