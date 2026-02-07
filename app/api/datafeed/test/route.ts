import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

// POST - Test connection to a data feed provider
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { provider, host, port } = body;

    if (!provider || !host) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // For now, simulate a connection test
    // In production, this would attempt a real TCP/WebSocket connection
    const testResult = await simulateConnectionTest(provider, host, port);

    if (testResult.success) {
      return NextResponse.json({ success: true, latency: testResult.latency });
    } else {
      return NextResponse.json({ success: false, error: testResult.error }, { status: 400 });
    }
  } catch (error) {
    console.error('DataFeed test error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

async function simulateConnectionTest(
  provider: string,
  host: string,
  port?: number
): Promise<{ success: boolean; latency?: number; error?: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Basic validation
  if (!host || host.length < 3) {
    return { success: false, error: 'Invalid host address' };
  }

  if (port && (port < 1 || port > 65535)) {
    return { success: false, error: 'Invalid port number' };
  }

  // Simulate success for known test hosts
  const knownHosts = ['127.0.0.1', 'localhost', 'demo.dxfeed.com'];
  if (knownHosts.some((h) => host.includes(h))) {
    return { success: true, latency: Math.round(10 + Math.random() * 50) };
  }

  // 70% success rate for other hosts (simulation)
  if (Math.random() > 0.3) {
    return { success: true, latency: Math.round(20 + Math.random() * 100) };
  }

  return { success: false, error: `Could not connect to ${provider} at ${host}:${port || 'default'}` };
}
