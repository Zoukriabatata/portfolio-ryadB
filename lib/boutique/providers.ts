/**
 * Data Feed Provider Definitions
 *
 * Single source of truth for all provider metadata displayed on /boutique.
 */

import type { ComponentType } from 'react';
import type { DataFeedProvider } from '@/stores/useDataFeedStore';

// Re-export for convenience
export type { DataFeedProvider };

export type ProviderCategory = 'crypto' | 'futures' | 'multi-asset';
export type ProviderTier = 'FREE' | 'ULTRA';

export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder: string;
  options?: { value: string; label: string }[];
}

export interface DataFeedProviderInfo {
  id: DataFeedProvider;
  name: string;
  category: ProviderCategory;
  tier: ProviderTier;
  color: string;
  iconName: string; // Name of the icon component from Icons.tsx
  description: string;
  markets: string[];
  features: string[];
  connectionType: string;
  pricingNote: string;
  docsUrl?: string;
  requiresCredentials: boolean;
  fields: ProviderField[];
}

export const DATA_FEED_PROVIDERS: DataFeedProviderInfo[] = [
  // ── Crypto (FREE) ──────────────────────────────
  {
    id: 'binance',
    name: 'Binance',
    category: 'crypto',
    tier: 'FREE',
    color: '#F0B90B',
    iconName: 'BinanceIcon',
    description: 'World\'s largest crypto exchange by volume. Full orderbook, trade tape, and futures data.',
    markets: ['Spot', 'Futures', 'Options'],
    features: ['Real-time orderbook (L2)', 'Trade tape streaming', 'Mark price & funding rate', 'Liquidation feed', 'Open interest'],
    connectionType: 'Public WebSocket',
    pricingNote: 'Free — no API key required',
    docsUrl: 'https://binance-docs.github.io/apidocs/',
    requiresCredentials: false,
    fields: [],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    category: 'crypto',
    tier: 'FREE',
    color: '#F7A600',
    iconName: 'BybitIcon',
    description: 'Leading crypto derivatives exchange. Perpetual futures, options, and spot markets.',
    markets: ['Spot', 'Perpetual Futures', 'Options'],
    features: ['Real-time orderbook (L2)', 'Trade tape streaming', 'Funding rate data', 'Open interest', 'Insurance fund'],
    connectionType: 'Public WebSocket',
    pricingNote: 'Free — no API key required',
    docsUrl: 'https://bybit-exchange.github.io/docs/',
    requiresCredentials: false,
    fields: [],
  },
  {
    id: 'deribit',
    name: 'Deribit',
    category: 'crypto',
    tier: 'FREE',
    color: '#00C2FF',
    iconName: 'DeribitIcon',
    description: 'Premier BTC & ETH options exchange. Full Greeks, IV surface, and futures data.',
    markets: ['BTC Options', 'ETH Options', 'Perpetual Futures'],
    features: ['Options chain with Greeks', 'Implied volatility surface', 'Real-time orderbook', 'Trade tape', 'Index price feed'],
    connectionType: 'Public WebSocket',
    pricingNote: 'Free — no API key required',
    docsUrl: 'https://docs.deribit.com/',
    requiresCredentials: false,
    fields: [],
  },

  // ── Futures ───────────────────────────────────
  {
    id: 'rithmic',
    name: 'Rithmic',
    category: 'futures',
    tier: 'FREE',
    color: '#1E88E5',
    iconName: 'RithmicIcon',
    description: 'Ultra-low latency futures data. Used by professional prop firms and scalpers.',
    markets: ['CME', 'CBOT', 'NYMEX', 'ICE', 'COMEX'],
    features: ['Tick-by-tick data', 'Full depth of market', 'Order flow reconstruction', 'Historical tick data', 'Sub-millisecond latency'],
    connectionType: 'Local Gateway',
    pricingNote: 'From $25/mo — exchange fees apply',
    requiresCredentials: true,
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Your Rithmic username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Your Rithmic password' },
      { key: 'host', label: 'Server', type: 'text', placeholder: 'e.g. rituz00100.rithmic.com' },
    ],
  },
  {
    id: 'tradovate',
    name: 'Tradovate',
    category: 'futures',
    tier: 'FREE',
    color: '#4CAF50',
    iconName: 'TradovateIcon',
    description: 'Commission-free futures trading with REST and WebSocket APIs. CME and ICE markets.',
    markets: ['CME', 'ICE'],
    features: ['Real-time quotes', 'Depth of market', 'Historical charts', 'Order management', 'Account data'],
    connectionType: 'REST + WebSocket',
    pricingNote: 'Free with Tradovate account — paper trading available',
    docsUrl: 'https://api.tradovate.com/',
    requiresCredentials: true,
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Tradovate username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Tradovate password' },
      {
        key: 'host',
        label: 'Account Mode',
        type: 'select',
        placeholder: 'demo',
        options: [
          { value: 'demo', label: 'Demo (Paper Trading)' },
          { value: 'live', label: 'Live (Real Money)' },
        ],
      },
    ],
  },
  {
    id: 'cqg',
    name: 'CQG',
    category: 'futures',
    tier: 'FREE',
    color: '#7B1FA2',
    iconName: 'CQGIcon',
    description: 'Institutional-grade market data and execution. Used by banks and hedge funds.',
    markets: ['CME', 'CBOT', 'NYMEX', 'ICE', 'Eurex', 'LME'],
    features: ['Institutional depth', 'Historical data API', 'Spread trading', 'Custom studies', 'Multi-exchange'],
    connectionType: 'Local Gateway',
    pricingNote: 'From $50/mo — contact CQG for pricing',
    requiresCredentials: true,
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'CQG username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'CQG password' },
    ],
  },
  {
    id: 'dxfeed',
    name: 'dxFeed',
    category: 'futures',
    tier: 'FREE',
    color: '#FF6F00',
    iconName: 'DxFeedIcon',
    description: 'Financial market data provider for futures, equities, and indices with global coverage.',
    markets: ['CME', 'NYSE', 'NASDAQ', 'CBOE'],
    features: ['Real-time streaming', 'Historical data', 'Market events', 'Indices & ETFs', 'Options analytics'],
    connectionType: 'WebSocket (dxLink)',
    pricingNote: 'From $30/mo — subscribe directly at dxfeed.com',
    docsUrl: 'https://docs.dxfeed.com/',
    requiresCredentials: true,
    fields: [
      { key: 'apiKey', label: 'API Token', type: 'password', placeholder: 'Your dxFeed API token' },
      { key: 'host', label: 'Endpoint (optional)', type: 'text', placeholder: 'wss://demo.dxfeed.com/dxlink-ws' },
    ],
  },
  {
    id: 'amp',
    name: 'AMP Futures',
    category: 'futures',
    tier: 'FREE',
    color: '#00897B',
    iconName: 'AMPIcon',
    description: 'Discount futures broker with multiple platform integrations and competitive data feeds.',
    markets: ['CME', 'CBOT', 'NYMEX', 'ICE'],
    features: ['Real-time quotes', 'Depth of market', 'Historical data', 'Multiple platforms', 'Low commissions'],
    connectionType: 'Gateway',
    pricingNote: 'From $15/mo — varies by exchange',
    requiresCredentials: true,
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'AMP username' },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'AMP API key' },
    ],
  },

  {
    id: 'databento',
    name: 'Databento',
    category: 'futures',
    tier: 'FREE',
    color: '#6366F1',
    iconName: 'DatabentoIcon',
    description: 'Modern pay-per-use market data. CME, NYSE, CBOE, Nasdaq. No monthly subscription needed.',
    markets: ['CME', 'NYSE', 'CBOE', 'NASDAQ', 'ICE'],
    features: ['Pay-per-use pricing', 'Tick-by-tick data', 'Historical data API', 'Options chains', 'Order book snapshots'],
    connectionType: 'REST + WebSocket',
    pricingNote: 'Pay-per-use — from $0/mo, subscribe at databento.com',
    docsUrl: 'https://databento.com/docs',
    requiresCredentials: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'db-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
  },

  // ── Multi-Asset ────────────────────────────────
  {
    id: 'ib',
    name: 'Interactive Brokers',
    category: 'multi-asset',
    tier: 'FREE',
    color: '#D32F2F',
    iconName: 'InteractiveBrokersIcon',
    description: 'Access to 150+ markets worldwide. Stocks, futures, options, forex, bonds, and more.',
    markets: ['NYSE', 'NASDAQ', 'CME', 'EUREX', 'LSE', 'TSE'],
    features: ['Full depth of market', 'Historical data', 'Options chain', 'Real-time scanning', 'Multi-asset portfolio'],
    connectionType: 'TWS Gateway',
    pricingNote: 'Free with IB account — market data subscriptions apply',
    docsUrl: 'https://interactivebrokers.github.io/',
    requiresCredentials: true,
    fields: [
      { key: 'host', label: 'TWS Host', type: 'text', placeholder: '127.0.0.1' },
      { key: 'port', label: 'TWS Port', type: 'text', placeholder: '7497' },
      { key: 'apiKey', label: 'Client ID', type: 'text', placeholder: '1' },
    ],
  },
];

export function getProvidersByCategory(category: ProviderCategory | 'all'): DataFeedProviderInfo[] {
  if (category === 'all') return DATA_FEED_PROVIDERS;
  return DATA_FEED_PROVIDERS.filter(p => p.category === category);
}

export function getProviderById(id: string): DataFeedProviderInfo | undefined {
  return DATA_FEED_PROVIDERS.find(p => p.id === id);
}
