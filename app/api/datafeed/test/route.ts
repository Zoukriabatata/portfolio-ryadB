import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';

// POST - Test connection to a data feed provider
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { provider, username, password, apiKey, host, port } = body;

    if (!provider) {
      return NextResponse.json({ error: 'Missing provider' }, { status: 400 });
    }

    const providerUpper = provider.toUpperCase();

    // Route to provider-specific test
    switch (providerUpper) {
      case 'TRADOVATE':
        return await testTradovate(username, password, host);
      case 'DATABENTO':
        return await testDatabento(apiKey);
      case 'BINANCE':
      case 'BYBIT':
      case 'DERIBIT':
        return await testCryptoWebSocket(providerUpper);
      case 'RITHMIC':
      case 'CQG':
      case 'AMP':
        return await testGatewayProvider(providerUpper, host, port);
      case 'DXFEED':
        return await testDxFeed(apiKey);
      case 'IB':
        return await testInteractiveBrokers(host, port);
      default:
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }
  } catch (error) {
    console.error('DataFeed test error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── Tradovate: Real API auth test ──
// host is repurposed to store 'demo' | 'live' mode
async function testTradovate(username?: string, password?: string, mode?: string) {
  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Username and password are required' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const isDemo = mode !== 'live';
    const apiUrl = isDemo ? TRADOVATE_DEMO_API : TRADOVATE_LIVE_API;

    const response = await fetch(`${apiUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        name: username,
        password: password,
        appId: process.env.TRADOVATE_APP_ID || 'Senzoukria',
        appVersion: '1.0.0',
        cid: process.env.TRADOVATE_CID || undefined,
        sec: process.env.TRADOVATE_SECRET || undefined,
      }),
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = 'Authentication failed';
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson['p-ticket'] ? 'Captcha required — try logging into Tradovate website first, then retry'
          : errorJson.errorText || errorJson.message || errorMsg;
      } catch {
        // Use default error message
      }
      return NextResponse.json({ success: false, error: errorMsg });
    }

    const data = await response.json();
    if (data.accessToken) {
      return NextResponse.json({
        success: true,
        latency,
        message: `Authenticated as ${data.name || username}`,
      });
    }

    // Tradovate sometimes returns 200 but with an error
    if (data['p-ticket']) {
      return NextResponse.json({
        success: false,
        error: 'Captcha verification required. Please log into Tradovate website first to clear it, then try again.',
      });
    }

    return NextResponse.json({ success: false, error: data.errorText || 'Unknown auth response' });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed — check your network',
    });
  }
}

// ── Crypto: WebSocket ping test ──
async function testCryptoWebSocket(provider: string) {
  const urls: Record<string, string> = {
    BINANCE: 'https://fapi.binance.com/fapi/v1/ping',
    BYBIT: 'https://api.bybit.com/v5/market/time',
    DERIBIT: 'https://www.deribit.com/api/v2/public/test',
  };

  const url = urls[provider];
  if (!url) return NextResponse.json({ success: false, error: 'Unknown crypto provider' });

  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    if (res.ok) {
      return NextResponse.json({ success: true, latency, message: `${provider} API reachable` });
    }
    return NextResponse.json({ success: false, error: `${provider} returned ${res.status}` });
  } catch {
    return NextResponse.json({ success: false, error: `Cannot reach ${provider} API` });
  }
}

// ── Gateway providers: basic host/port validation ──
async function testGatewayProvider(provider: string, host?: string, port?: string | number) {
  if (!host) {
    return NextResponse.json({ success: false, error: 'Host is required' }, { status: 400 });
  }

  // Can't do TCP connect from serverless, so validate format and return guidance
  const portNum = port ? Number(port) : undefined;
  if (portNum && (portNum < 1 || portNum > 65535)) {
    return NextResponse.json({ success: false, error: 'Invalid port number' });
  }

  return NextResponse.json({
    success: true,
    latency: 0,
    message: `Configuration saved. Make sure your ${provider} gateway is running at ${host}${portNum ? `:${portNum}` : ''}.`,
  });
}

// ── dxFeed: API key validation ──
async function testDxFeed(apiKey?: string) {
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 });
  }

  // dxFeed doesn't have a simple auth ping, validate key format
  if (apiKey.length < 10) {
    return NextResponse.json({ success: false, error: 'API key appears too short' });
  }

  return NextResponse.json({
    success: true,
    latency: 0,
    message: 'API key saved. Connection will be verified when market data is requested.',
  });
}

// ── Databento: real API key test ──
async function testDatabento(apiKey?: string) {
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key is required' }, { status: 400 });
  }

  const start = Date.now();
  try {
    // Databento metadata endpoint — lightweight, requires valid API key
    const res = await fetch('https://hist.databento.com/v0/metadata.list_publishers', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    const latency = Date.now() - start;

    if (res.ok) {
      return NextResponse.json({ success: true, latency, message: 'Databento API key verified' });
    }
    if (res.status === 401) {
      return NextResponse.json({ success: false, error: 'Invalid API key — check your Databento account' });
    }
    return NextResponse.json({ success: false, error: `Databento returned ${res.status}` });
  } catch {
    return NextResponse.json({ success: false, error: 'Cannot reach Databento API — check your network' });
  }
}

// ── Interactive Brokers: TWS Gateway check ──
async function testInteractiveBrokers(host?: string, port?: string | number) {
  if (!host) {
    return NextResponse.json({ success: false, error: 'TWS host is required' }, { status: 400 });
  }

  const portNum = port ? Number(port) : 7497;
  if (portNum < 1 || portNum > 65535) {
    return NextResponse.json({ success: false, error: 'Invalid port number' });
  }

  return NextResponse.json({
    success: true,
    latency: 0,
    message: `Configuration saved. Make sure TWS/IB Gateway is running at ${host}:${portNum}.`,
  });
}
