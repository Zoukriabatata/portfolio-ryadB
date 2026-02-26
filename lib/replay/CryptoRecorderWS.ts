/**
 * CryptoRecorderWS
 *
 * Connects to Binance WebSocket streams (aggTrade + depth@500ms)
 * and feeds data to ReplayRecorder for session recording.
 *
 * Supports: Binance Futures (fstream), Bybit (future extension).
 */

import {
  getReplayRecorder,
  type GenericTrade,
  type GenericDepth,
  type RecordingExchange,
} from './ReplayRecorder';

export interface CryptoRecorderConfig {
  symbol: string;
  exchange: RecordingExchange;
  description?: string;
}

// Binance aggTrade WebSocket message
interface BinanceAggTrade {
  e: 'aggTrade';
  s: string;       // Symbol
  p: string;        // Price
  q: string;        // Quantity
  m: boolean;       // Is buyer maker? (true = seller aggressor = ASK)
  T: number;        // Trade time
}

// Binance partial depth WebSocket message
interface BinanceDepthMessage {
  e: 'depthUpdate';
  s: string;
  b: [string, string][];  // [[price, qty], ...]
  a: [string, string][];
  T?: number;
}

export class CryptoRecorderWS {
  private tradeWs: WebSocket | null = null;
  private depthWs: WebSocket | null = null;
  private sessionId: string | null = null;
  private config: CryptoRecorderConfig | null = null;
  private connected = false;

  async start(config: CryptoRecorderConfig): Promise<string> {
    this.config = config;
    const recorder = getReplayRecorder();
    await recorder.init();

    // Start recording session
    this.sessionId = await recorder.startRecording(
      config.symbol,
      config.description,
      config.exchange
    );

    // Connect to WebSocket streams
    if (config.exchange === 'binance') {
      this.connectBinance(config.symbol.toLowerCase());
    } else if (config.exchange === 'bybit') {
      this.connectBybit(config.symbol);
    } else if (config.exchange === 'deribit') {
      this.connectDeribit(config.symbol);
    }

    this.connected = true;
    return this.sessionId;
  }

  async stop(): Promise<void> {
    this.connected = false;

    // Close WebSockets
    if (this.tradeWs) {
      this.tradeWs.close();
      this.tradeWs = null;
    }
    if (this.depthWs) {
      this.depthWs.close();
      this.depthWs = null;
    }

    // Stop recording
    const recorder = getReplayRecorder();
    await recorder.stopRecording();

    this.sessionId = null;
    this.config = null;
  }

  isRecording(): boolean {
    return this.connected && this.sessionId !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BINANCE FUTURES
  // ═══════════════════════════════════════════════════════════════════════════

  private connectBinance(symbol: string) {
    const recorder = getReplayRecorder();

    // aggTrade stream — individual trade events
    const tradeUrl = `wss://fstream.binance.com/ws/${symbol}@aggTrade`;
    this.tradeWs = new WebSocket(tradeUrl);
    this.tradeWs.onmessage = (event) => {
      if (!this.connected) return;
      try {
        const data = JSON.parse(event.data) as BinanceAggTrade;
        const trade: GenericTrade = {
          price: parseFloat(data.p),
          size: parseFloat(data.q),
          side: data.m ? 'ASK' : 'BID', // m=true means buyer is maker, so trade is a sell (ASK aggressor)
          timestamp: data.T,
        };
        recorder.recordGenericTrade(trade);
      } catch { /* ignore parse errors */ }
    };
    this.tradeWs.onerror = () => {
      console.warn('[CryptoRecorderWS] Binance trade stream error');
    };

    // Partial depth stream — top 20 levels every 500ms
    const depthUrl = `wss://fstream.binance.com/ws/${symbol}@depth20@500ms`;
    this.depthWs = new WebSocket(depthUrl);
    this.depthWs.onmessage = (event) => {
      if (!this.connected) return;
      try {
        const data = JSON.parse(event.data) as BinanceDepthMessage;
        const depth: GenericDepth = {
          timestamp: data.T || Date.now(),
          bids: (data.b || []).map(([p, q]) => ({
            price: parseFloat(p),
            size: parseFloat(q),
          })),
          asks: (data.a || []).map(([p, q]) => ({
            price: parseFloat(p),
            size: parseFloat(q),
          })),
        };
        recorder.recordGenericDepth(depth);
      } catch { /* ignore parse errors */ }
    };
    this.depthWs.onerror = () => {
      console.warn('[CryptoRecorderWS] Binance depth stream error');
    };

    console.log(`[CryptoRecorderWS] Connected to Binance: ${symbol}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BYBIT (same interface, different URL)
  // ═══════════════════════════════════════════════════════════════════════════

  private connectBybit(symbol: string) {
    const recorder = getReplayRecorder();

    // Bybit uses a single WebSocket with subscription messages
    const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
    this.tradeWs = new WebSocket(wsUrl);

    this.tradeWs.onopen = () => {
      // Subscribe to trades and orderbook
      this.tradeWs?.send(JSON.stringify({
        op: 'subscribe',
        args: [`publicTrade.${symbol}`, `orderbook.20.${symbol}`],
      }));
    };

    this.tradeWs.onmessage = (event) => {
      if (!this.connected) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic?.startsWith('publicTrade.')) {
          // Trade messages
          for (const t of (msg.data || [])) {
            const trade: GenericTrade = {
              price: parseFloat(t.p),
              size: parseFloat(t.v),
              side: t.S === 'Sell' ? 'ASK' : 'BID',
              timestamp: parseInt(t.T),
            };
            recorder.recordGenericTrade(trade);
          }
        } else if (msg.topic?.startsWith('orderbook.')) {
          // Depth messages
          const depth: GenericDepth = {
            timestamp: parseInt(msg.ts) || Date.now(),
            bids: (msg.data?.b || []).map(([p, q]: [string, string]) => ({
              price: parseFloat(p),
              size: parseFloat(q),
            })),
            asks: (msg.data?.a || []).map(([p, q]: [string, string]) => ({
              price: parseFloat(p),
              size: parseFloat(q),
            })),
          };
          recorder.recordGenericDepth(depth);
        }
      } catch { /* ignore */ }
    };

    console.log(`[CryptoRecorderWS] Connected to Bybit: ${symbol}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIBIT
  // ═══════════════════════════════════════════════════════════════════════════

  private connectDeribit(symbol: string) {
    const recorder = getReplayRecorder();

    const wsUrl = 'wss://www.deribit.com/ws/api/v2';
    this.tradeWs = new WebSocket(wsUrl);

    this.tradeWs.onopen = () => {
      // Subscribe to trades and orderbook
      this.tradeWs?.send(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'public/subscribe',
        params: {
          channels: [`trades.${symbol}.raw`, `book.${symbol}.none.20.100ms`],
        },
      }));
    };

    this.tradeWs.onmessage = (event) => {
      if (!this.connected) return;
      try {
        const msg = JSON.parse(event.data);
        if (!msg.params?.channel) return;

        if (msg.params.channel.startsWith('trades.')) {
          for (const t of (msg.params.data || [])) {
            const trade: GenericTrade = {
              price: t.price,
              size: t.amount,
              side: t.direction === 'sell' ? 'ASK' : 'BID',
              timestamp: t.timestamp,
            };
            recorder.recordGenericTrade(trade);
          }
        } else if (msg.params.channel.startsWith('book.')) {
          const data = msg.params.data;
          const depth: GenericDepth = {
            timestamp: data.timestamp || Date.now(),
            bids: (data.bids || []).map(([, price, size]: [string, number, number]) => ({
              price,
              size,
            })),
            asks: (data.asks || []).map(([, price, size]: [string, number, number]) => ({
              price,
              size,
            })),
          };
          recorder.recordGenericDepth(depth);
        }
      } catch { /* ignore */ }
    };

    console.log(`[CryptoRecorderWS] Connected to Deribit: ${symbol}`);
  }
}

// Singleton
let cryptoRecorderInstance: CryptoRecorderWS | null = null;

export function getCryptoRecorderWS(): CryptoRecorderWS {
  if (!cryptoRecorderInstance) {
    cryptoRecorderInstance = new CryptoRecorderWS();
  }
  return cryptoRecorderInstance;
}
