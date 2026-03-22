import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

// GET - List user's data feed configs
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const configs = await prisma.dataFeedConfig.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ configs });
  } catch (error) {
    console.error('DataFeed GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Create or update data feed config
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const body = await req.json();
    const { provider, host, port, username, apiKey, verified } = body;

    const validProviders = ['BINANCE', 'BYBIT', 'DERIBIT', 'TRADOVATE', 'DATABENTO', 'DXFEED', 'CQG', 'AMP', 'RITHMIC', 'IB'];
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Only mark CONNECTED when credentials were actually verified against the provider API.
    // Gateway/local providers (Rithmic, CQG, AMP, IB, dxFeed) send verified:false — save as CONFIGURED.
    const dbStatus = verified === false ? 'CONFIGURED' : 'CONNECTED';

    const config = await prisma.dataFeedConfig.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider,
        },
      },
      update: {
        host: host || null,
        port: port ? parseInt(port, 10) : null,
        username: username || null,
        apiKey: apiKey || null,
        status: dbStatus,
      },
      create: {
        userId: session.user.id,
        provider,
        host: host || null,
        port: port ? parseInt(port, 10) : null,
        username: username || null,
        apiKey: apiKey || null,
        status: dbStatus,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    console.error('DataFeed POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - Remove a data feed config
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');

    const validProviders = ['BINANCE', 'BYBIT', 'DERIBIT', 'TRADOVATE', 'DATABENTO', 'DXFEED', 'CQG', 'AMP', 'RITHMIC', 'IB'];
    if (!provider || !validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    await prisma.dataFeedConfig.deleteMany({
      where: {
        userId: session.user.id,
        provider,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DataFeed DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
