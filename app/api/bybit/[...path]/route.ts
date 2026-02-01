import { NextRequest, NextResponse } from 'next/server';

const BYBIT_API = 'https://api.bybit.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();

  const url = `${BYBIT_API}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Bybit API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bybit' },
      { status: 500 }
    );
  }
}
