/**
 * GET /api/ai/user-tester/inventory
 * Returns a complete inventory of the platform: pages, features, tools, settings.
 * Used by the AI tester to know exactly what exists and what to test.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return Response.json({
    platform: 'OrderFlow — Professional Trading Platform',

    pages: [
      { path: '/',               name: 'Landing Page',        auth: false, description: 'Marketing page with pricing, features, screenshots' },
      { path: '/live',           name: 'Live Chart Pro',       auth: true,  description: 'Main trading chart with all tools' },
      { path: '/dashboard',      name: 'Dashboard',            auth: true,  description: 'Market overview, BTC price, GEX, volatility widgets' },
      { path: '/gex',            name: 'GEX Dashboard',        auth: true,  description: 'Gamma exposure charts for SPX, SPY, QQQ' },
      { path: '/volatility',     name: 'Volatility Skew',      auth: true,  description: 'Options volatility surface from Deribit' },
      { path: '/orderflow',      name: 'Footprint Chart',      auth: true,  description: 'Delta footprint with ATAS-style rendering' },
      { path: '/journal',        name: 'Trade Journal',        auth: true,  description: 'Trade logging, analytics, playbooks, daily notes' },
      { path: '/account',        name: 'Account Settings',     auth: true,  description: 'Profile, subscription, notification prefs' },
      { path: '/pricing',        name: 'Pricing',              auth: false, description: 'Subscription plans: Free, Pro, Elite' },
      { path: '/login',          name: 'Login',                auth: false, description: 'Email/password + Google OAuth' },
      { path: '/reports', name: 'User Audits',       auth: true,  description: 'AI user-testing reports (this page)' },
    ],

    live_chart: {
      description: 'Main chart at /live — professional trading interface',
      drawing_tools: [
        { id: 'cursor',              name: 'Cursor',                 category: 'basics' },
        { id: 'crosshair',           name: 'Crosshair',              category: 'basics' },
        { id: 'trendline',           name: 'Trend Line',             category: 'lines',  shortcut: 'T' },
        { id: 'ray',                 name: 'Ray',                    category: 'lines',  shortcut: 'R' },
        { id: 'hline',               name: 'Horizontal Line',        category: 'lines',  shortcut: 'H' },
        { id: 'vline',               name: 'Vertical Line',          category: 'lines',  shortcut: 'V' },
        { id: 'rectangle',           name: 'Rectangle',              category: 'shapes', shortcut: 'B' },
        { id: 'parallelChannel',     name: 'Parallel Channel',       category: 'shapes' },
        { id: 'fibonacciRetracement',name: 'Fibonacci Retracement',  category: 'fibonacci', shortcut: 'F' },
        { id: 'fibonacciExtension',  name: 'Fibonacci Extension',    category: 'fibonacci' },
        { id: 'text',                name: 'Text Note',              category: 'annotations' },
        { id: 'arrow',               name: 'Arrow',                  category: 'annotations' },
        { id: 'brush',               name: 'Freehand Brush',         category: 'annotations' },
        { id: 'highlighter',         name: 'Highlighter',            category: 'annotations' },
        { id: 'measure',             name: 'Price Measure',          category: 'analysis' },
        { id: 'longPosition',        name: 'Long Position',          category: 'trading', shortcut: 'L' },
        { id: 'shortPosition',       name: 'Short Position',         category: 'trading', shortcut: 'S' },
      ],
      timeframes: [
        { seconds: 15,    label: '15s' },
        { seconds: 30,    label: '30s' },
        { seconds: 60,    label: '1m' },
        { seconds: 180,   label: '3m' },
        { seconds: 300,   label: '5m' },
        { seconds: 900,   label: '15m' },
        { seconds: 1800,  label: '30m' },
        { seconds: 3600,  label: '1h' },
        { seconds: 14400, label: '4h' },
        { seconds: 86400, label: '1d' },
      ],
      indicators: [
        { type: 'VWAP',  description: 'Volume Weighted Average Price — intraday anchor' },
        { type: 'TWAP',  description: 'Time Weighted Average Price' },
        { type: 'EMA',   description: 'Exponential Moving Average', params: { period: 20 } },
        { type: 'SMA',   description: 'Simple Moving Average',      params: { period: 50 } },
      ],
      overlays: [
        { id: 'volumeProfile',  name: 'Volume Profile',  description: 'Session POC, VAH, VAL on right axis' },
        { id: 'volumeBubbles',  name: 'Volume Bubbles',  description: 'DOM-based volume dots on each candle' },
        { id: 'depthHeatmap',   name: 'Depth Heatmap',   description: 'Real-time order book depth (beta)' },
      ],
      chart_settings: {
        description: 'Settings panel (gear icon) — opens centered modal',
        sections: [
          'Appearance (background, grid, candle colors)',
          'Volume display (classic / bid-ask / delta)',
          'Footprint settings (cell size, color scheme)',
          'Volume Profile (depth, mode, left/right side)',
          'Indicators (add/remove EMA, SMA, VWAP)',
          'Templates (save/load named configurations)',
          'Split view (1x1, 2x1, 2x2 charts)',
        ],
      },
      toolbar_buttons: [
        'Symbol selector (e.g. BTCUSDT, ETHUSDT, ES1!, NQ1!)',
        'Timeframe selector (15s → 1d)',
        'Chart type toggle (candlestick / footprint)',
        'Indicators panel',
        'Drawing tools sidebar',
        'Magnet mode (snap to OHLC)',
        'Lock tools (prevent accidental moves)',
        'Delete all drawings',
        'Screenshot',
        'Full screen',
        'Split chart',
        'Settings',
      ],
      quick_trade: {
        description: 'Quick trade bar at the bottom of the chart',
        features: [
          'BUY / SELL market orders',
          'Limit orders with price input',
          'Stop orders',
          'Quantity input',
          'TP/SL inputs',
          'Real-time P&L display',
          'Position display with close button',
        ],
      },
    },

    market_data_apis: [
      { endpoint: '/api/spot-price?symbol=BTCUSDT',                            auth: false, description: 'Real-time BTC spot price from Binance' },
      { endpoint: '/api/history/klines?symbol=BTCUSDT&interval=1m&limit=10',  auth: false, description: 'Historical OHLCV candles' },
      { endpoint: '/api/gex-data?symbol=SPX',                                  auth: false, description: 'Gamma exposure data for SPX' },
      { endpoint: '/api/volatility-live',                                       auth: false, description: 'Live options volatility surface (Deribit)' },
      { endpoint: '/api/options-data?symbol=BTC',                              auth: false, description: 'Options chain data with Greeks' },
      { endpoint: '/api/news/calendar',                                         auth: false, description: 'Economic calendar events' },
      { endpoint: '/api/market/etf-price?symbol=SPY',                          auth: false, description: 'ETF price data' },
    ],

    auth_apis: [
      { endpoint: '/api/auth/profile',   method: 'GET',  auth: true,  description: 'Get current user profile' },
      { endpoint: '/api/auth/register',  method: 'POST', auth: false, description: 'Register new account' },
    ],

    datafeed_apis: [
      { endpoint: '/api/datafeed',                  description: 'TradingView-compatible datafeed (symbol info, history, search)' },
      { endpoint: '/api/datafeed/credentials',      description: 'Get datafeed connection credentials' },
      { endpoint: '/api/tradovate/auth',            description: 'Tradovate broker authentication' },
      { endpoint: '/api/dxfeed/history',            description: 'DxFeed historical data (CME futures)' },
    ],

    journal_apis: [
      { endpoint: '/api/journal',                   method: 'GET',  auth: true, description: 'List trade journal entries' },
      { endpoint: '/api/journal/analytics',         method: 'GET',  auth: true, description: 'Journal analytics (win rate, PnL, etc.)' },
      { endpoint: '/api/journal/playbook',          method: 'GET',  auth: true, description: 'Trading playbooks list' },
      { endpoint: '/api/journal/daily-notes',       method: 'GET',  auth: true, description: 'Daily trading notes' },
    ],

    payment_apis: [
      { endpoint: '/api/stripe/validate-promo',     method: 'POST', auth: false, description: 'Validate a promo code' },
    ],

    ai_features: [
      { endpoint: '/api/ai/support',                description: 'AI support chat (streams SSE tokens)' },
      { endpoint: '/api/ai/analysis',               description: 'AI market analysis' },
      { endpoint: '/api/ai/stream/live',            description: 'Live AI market commentary' },
    ],

    feature_test_suites: {
      market_data: {
        description: 'Tests all public market data endpoints',
        steps: ['GET /api/spot-price?symbol=BTCUSDT', 'GET /api/spot-price?symbol=ETHUSDT', 'GET /api/history/klines?symbol=BTCUSDT&interval=1m&limit=5', 'GET /api/gex-data?symbol=SPX', 'GET /api/volatility-live'],
      },
      datafeed: {
        description: 'Tests the TradingView-compatible datafeed',
        steps: ['GET /api/datafeed?listSymbolsGroup=futures', 'GET /api/datafeed (POST with type=history)', 'GET /api/datafeed/credentials'],
      },
      ai: {
        description: 'Tests AI assistant features',
        steps: ['POST /api/ai/support (with test message)', 'GET /api/ai/support (health check)', 'GET /api/ai/analysis'],
      },
      auth: {
        description: 'Tests authentication flow',
        steps: ['GET /api/auth/profile (should be 401 without session)', 'GET /api/auth/profile (with x-user-tester header)'],
      },
      news: {
        description: 'Tests news and calendar',
        steps: ['GET /api/news/calendar'],
      },
    },
  });
}
