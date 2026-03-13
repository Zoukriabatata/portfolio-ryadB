import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

/**
 * GET /api/datafeed/credentials?provider=DXFEED
 *
 * Returns the authenticated user's saved credentials for a given provider.
 * Only returns what's needed for the client-side WebSocket connection.
 * Never exposes other users' credentials.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider')?.toUpperCase();

    const validProviders = ['IB', 'DXFEED', 'RITHMIC', 'AMP', 'BINANCE', 'BYBIT', 'DERIBIT', 'TRADOVATE', 'CQG', 'DATABENTO'];
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
    }

    const config = await prisma.dataFeedConfig.findFirst({
      where: { userId: session.user.id, provider },
      select: {
        provider: true,
        status: true,
        host: true,
        port: true,
        username: true,
        apiKey: true,
        lastConnected: true,
      },
    });

    if (!config) {
      return NextResponse.json({ error: 'Provider not configured' }, { status: 404 });
    }

    return NextResponse.json({ credentials: config });
  } catch (error) {
    console.error('[datafeed/credentials] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
