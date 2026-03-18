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
    id: 'tradovate',
    name: 'Tradovate',
    category: 'futures',
    tier: 'FREE',
    color: '#4CAF50',
    iconName: 'TradovateIcon',
    description: 'Futures cloud API with real auth. ES, NQ, MNQ, CL, GC… Demo account free, Level 1 free with live account.',
    markets: ['CME', 'CBOT', 'NYMEX', 'ICE'],
    features: ['Level 1 free (live account)', 'Market depth L2 ~$41–48/mo', 'Paper trading free', 'ES · NQ · MNQ · CL · GC', 'Credentials verified at connect'],
    connectionType: 'REST + WebSocket',
    pricingNote: 'Demo gratuit · L1 gratuit · L2 (DOM) ~$41–48/mo (CME bundle non-pro)',
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
    id: 'dxfeed',
    name: 'dxFeed',
    category: 'futures',
    tier: 'FREE',
    color: '#FF6B35',
    iconName: 'DxFeedIcon',
    description: 'Professional CME futures data feed. Level 1 quotes + Level 2 DOM for ES, NQ, MNQ, GC and more. No trading account required.',
    markets: ['CME', 'CBOT', 'NYMEX', 'COMEX', 'ICE'],
    features: ['Level 1 real-time quotes', 'Level 2 DOM (market depth)', 'Trade tape streaming', 'ES · NQ · MNQ · GC · CL', 'No broker account needed'],
    connectionType: 'WebSocket (dxLink v0.1)',
    pricingNote: 'CME individual ~$29/mo · no broker account required',
    docsUrl: 'https://kb.dxfeed.com/',
    requiresCredentials: true,
    fields: [
      { key: 'apiKey', label: 'API Token', type: 'password', placeholder: 'Your dxFeed API token' },
    ],
  },
  {
    id: 'databento',
    name: 'Databento',
    category: 'futures',
    tier: 'FREE',
    color: '#6366F1',
    iconName: 'DatabentoIcon',
    description: 'API de données historiques tick-by-tick. Live streaming CME = $179/mo (plan Standard) — idéal pour backtesting.',
    markets: ['CME', 'NYSE', 'CBOE', 'NASDAQ', 'ICE'],
    features: ['Historique tick-by-tick', 'Options chains', 'Order book snapshots', 'Live stream $179/mo', 'Clé API vérifiée'],
    connectionType: 'REST + WebSocket',
    pricingNote: 'Historique pay-per-use · Live stream $179/mo (Standard) — pas idéal pour DOM en temps réel',
    docsUrl: 'https://databento.com/docs',
    requiresCredentials: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'db-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
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
