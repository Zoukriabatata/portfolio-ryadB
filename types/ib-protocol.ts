/**
 * IB GATEWAY PROTOCOL
 *
 * Shared message types between Gateway server and browser client.
 * Used over WebSocket (JSON serialized).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CME CONTRACT SPECS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CMEContractSpec {
  symbol: string;
  exchange: string;
  secType: 'FUT';
  tickSize: number;
  tickValue: number;    // Dollar value per tick
  pointValue: number;   // Dollar value per point
  description: string;
  tradingHours: string; // e.g. "CME Globex"
}

export const CME_CONTRACTS: Record<string, CMEContractSpec> = {
  ES:  { symbol: 'ES',  exchange: 'CME',   secType: 'FUT', tickSize: 0.25,  tickValue: 12.50, pointValue: 50,    description: 'E-mini S&P 500',    tradingHours: 'CME Globex' },
  MES: { symbol: 'MES', exchange: 'CME',   secType: 'FUT', tickSize: 0.25,  tickValue: 1.25,  pointValue: 5,     description: 'Micro E-mini S&P',  tradingHours: 'CME Globex' },
  NQ:  { symbol: 'NQ',  exchange: 'CME',   secType: 'FUT', tickSize: 0.25,  tickValue: 5.00,  pointValue: 20,    description: 'E-mini NASDAQ 100', tradingHours: 'CME Globex' },
  MNQ: { symbol: 'MNQ', exchange: 'CME',   secType: 'FUT', tickSize: 0.25,  tickValue: 0.50,  pointValue: 2,     description: 'Micro E-mini NQ',   tradingHours: 'CME Globex' },
  YM:  { symbol: 'YM',  exchange: 'CBOT',  secType: 'FUT', tickSize: 1,     tickValue: 5.00,  pointValue: 5,     description: 'E-mini Dow',        tradingHours: 'CME Globex' },
  GC:  { symbol: 'GC',  exchange: 'COMEX', secType: 'FUT', tickSize: 0.10,  tickValue: 10.00, pointValue: 100,   description: 'Gold',              tradingHours: 'CME Globex' },
  MGC: { symbol: 'MGC', exchange: 'COMEX', secType: 'FUT', tickSize: 0.10,  tickValue: 1.00,  pointValue: 10,    description: 'Micro Gold',        tradingHours: 'CME Globex' },
  CL:  { symbol: 'CL',  exchange: 'NYMEX', secType: 'FUT', tickSize: 0.01,  tickValue: 10.00, pointValue: 1000,  description: 'Crude Oil',         tradingHours: 'CME Globex' },
  MCL: { symbol: 'MCL', exchange: 'NYMEX', secType: 'FUT', tickSize: 0.01,  tickValue: 1.00,  pointValue: 100,   description: 'Micro Crude Oil',   tradingHours: 'CME Globex' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT → GATEWAY MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: 'trades' | 'depth' | 'quotes'; symbol: string }
  | { type: 'unsubscribe'; channel: 'trades' | 'depth' | 'quotes'; symbol: string }
  | { type: 'ping' }
  | { type: 'change_symbol'; symbol: string };

// ═══════════════════════════════════════════════════════════════════════════════
// GATEWAY → CLIENT MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

export type GatewayMessage =
  | { type: 'auth_ok'; userId: string }
  | { type: 'auth_error'; error: string }
  | { type: 'connected'; ibStatus: 'connected' | 'connecting' }
  | { type: 'disconnected'; reason: string }
  | { type: 'error'; error: string; code?: string }
  | { type: 'pong'; serverTime: number }
  | { type: 'trade'; data: IBTrade }
  | { type: 'depth'; data: IBDepthUpdate }
  | { type: 'quote'; data: IBQuote }
  | { type: 'subscribed'; channel: string; symbol: string }
  | { type: 'unsubscribed'; channel: string; symbol: string };

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface IBTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';   // Classified by aggressor side
  timestamp: number;       // Unix ms
  exchange: string;
}

export interface IBDepthRow {
  price: number;
  size: number;
  numOrders: number;
}

export interface IBDepthUpdate {
  symbol: string;
  timestamp: number;
  bids: IBDepthRow[];
  asks: IBDepthRow[];
}

export interface IBQuote {
  symbol: string;
  timestamp: number;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  last: number;
  lastSize: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATEWAY STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export type GatewayConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'connecting_ib'
  | 'connected'
  | 'error';

export interface GatewayStats {
  connectedUsers: number;
  totalTrades: number;
  uptime: number;
}
