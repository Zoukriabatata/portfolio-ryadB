import { NextRequest, NextResponse } from 'next/server';

const DERIBIT_API = 'https://www.deribit.com/api/v2';
const DERIBIT_TEST_API = 'https://test.deribit.com/api/v2';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const isTestnet = request.headers.get('x-testnet') === 'true';

  const baseUrl = isTestnet ? DERIBIT_TEST_API : DERIBIT_API;
  const url = `${baseUrl}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Deribit API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Deribit' },
      { status: 500 }
    );
  }
}
