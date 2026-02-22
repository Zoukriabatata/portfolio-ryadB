import { wsManager } from './WebSocketManager';
import type { OptionData, Currency } from '@/types/options';

const DERIBIT_WS = 'wss://www.deribit.com/ws/api/v2';
const DERIBIT_TEST_WS = 'wss://test.deribit.com/ws/api/v2';

interface DeribitTickerData {
  instrument_name: string;
  mark_price: number;
  mark_iv: number;
  bid_iv: number;
  ask_iv: number;
  underlying_price: number;
  underlying_index: string;
  open_interest: number;
  volume: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
}

interface DeribitInstrument {
  instrument_name: string;
  strike: number;
  option_type: 'call' | 'put';
  expiration_timestamp: number;
  is_active: boolean;
  kind: string;
  base_currency: string;
}

interface DeribitMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: {
    channel?: string;
    data?: DeribitTickerData | DeribitInstrument[];
  };
  result?: DeribitInstrument[] | { channels: string[] };
}

type TickerHandler = (data: OptionData) => void;
type InstrumentsHandler = (instruments: DeribitInstrument[]) => void;

class DeribitWebSocket {
  private static instance: DeribitWebSocket;
  private tickerHandlers: Map<string, Set<TickerHandler>> = new Map();
  private instrumentsHandlers: Set<InstrumentsHandler> = new Set();
  private subscribedChannels: Set<string> = new Set();
  private messageId = 1;
  private useTestnet = false;
  private messageUnsubscriber: (() => void) | null = null;

  private constructor() {}

  static getInstance(): DeribitWebSocket {
    if (!DeribitWebSocket.instance) {
      DeribitWebSocket.instance = new DeribitWebSocket();
    }
    return DeribitWebSocket.instance;
  }

  connect(testnet = false): void {
    this.useTestnet = testnet;
    const url = testnet ? DERIBIT_TEST_WS : DERIBIT_WS;
    const exchangeId = 'deribit';

    wsManager.connect(exchangeId, url, () => {
      console.log('[Deribit] Connected');
      // Resubscribe to channels
      this.resubscribeAll();
    });

    // Unsubscribe previous handler to prevent stacking on reconnect
    this.messageUnsubscriber?.();
    this.messageUnsubscriber = wsManager.subscribe(exchangeId, '*', (data) => {
      this.handleMessage(data as DeribitMessage);
    });
  }

  disconnect(): void {
    this.messageUnsubscriber?.();
    this.messageUnsubscriber = null;
    wsManager.disconnect('deribit');
  }

  private resubscribeAll(): void {
    if (this.subscribedChannels.size > 0) {
      const channels = Array.from(this.subscribedChannels);
      this.sendSubscribe(channels);
    }
  }

  private sendSubscribe(channels: string[]): void {
    const msg = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'public/subscribe',
      params: { channels },
    };
    wsManager.send('deribit', msg);
  }

  private sendUnsubscribe(channels: string[]): void {
    const msg = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'public/unsubscribe',
      params: { channels },
    };
    wsManager.send('deribit', msg);
  }

  // Fetch available instruments (via Next.js API proxy to avoid CORS)
  async fetchInstruments(currency: Currency, kind: 'option' | 'future' = 'option'): Promise<DeribitInstrument[]> {
    try {
      const response = await fetch(
        `/api/deribit/public/get_instruments?currency=${currency}&kind=${kind}&expired=false`,
        {
          headers: this.useTestnet ? { 'x-testnet': 'true' } : {},
        }
      );
      const data = await response.json();
      return data.result || [];
    } catch (error) {
      console.error('[Deribit] Failed to fetch instruments:', error);
      return [];
    }
  }

  // Fetch ticker for a specific instrument (via Next.js API proxy to avoid CORS)
  async fetchTicker(instrumentName: string): Promise<DeribitTickerData | null> {
    try {
      const response = await fetch(
        `/api/deribit/public/ticker?instrument_name=${instrumentName}`,
        {
          headers: this.useTestnet ? { 'x-testnet': 'true' } : {},
        }
      );
      const data = await response.json();
      return data.result || null;
    } catch (error) {
      console.error('[Deribit] Failed to fetch ticker:', error);
      return null;
    }
  }

  // Subscribe to ticker updates for options
  subscribeTicker(instrumentName: string, handler: TickerHandler): () => void {
    const channel = `ticker.${instrumentName}.raw`;

    if (!this.tickerHandlers.has(channel)) {
      this.tickerHandlers.set(channel, new Set());
    }
    this.tickerHandlers.get(channel)!.add(handler);

    // Subscribe if not already subscribed
    if (!this.subscribedChannels.has(channel)) {
      this.subscribedChannels.add(channel);
      this.sendSubscribe([channel]);
    }

    return () => {
      this.tickerHandlers.get(channel)?.delete(handler);
      if (this.tickerHandlers.get(channel)?.size === 0) {
        this.tickerHandlers.delete(channel);
        this.subscribedChannels.delete(channel);
        this.sendUnsubscribe([channel]);
      }
    };
  }

  // Subscribe to multiple tickers at once
  subscribeMultipleTickers(
    instrumentNames: string[],
    handler: TickerHandler
  ): () => void {
    // Subscribe in batches to avoid overwhelming
    const batchSize = 50;
    for (let i = 0; i < instrumentNames.length; i += batchSize) {
      const batch = instrumentNames.slice(i, i + batchSize);
      const channels = batch.map((name) => `ticker.${name}.raw`);

      channels.forEach((channel) => {
        if (!this.tickerHandlers.has(channel)) {
          this.tickerHandlers.set(channel, new Set());
        }
        this.tickerHandlers.get(channel)!.add(handler);
        this.subscribedChannels.add(channel);
      });

      // Small delay between batches
      setTimeout(() => {
        this.sendSubscribe(channels);
      }, i * 100);
    }

    return () => {
      instrumentNames.forEach((name) => {
        const channel = `ticker.${name}.raw`;
        this.tickerHandlers.get(channel)?.delete(handler);
        if (this.tickerHandlers.get(channel)?.size === 0) {
          this.tickerHandlers.delete(channel);
          this.subscribedChannels.delete(channel);
        }
      });
      const channels = instrumentNames.map((name) => `ticker.${name}.raw`);
      this.sendUnsubscribe(channels);
    };
  }

  private handleMessage(message: DeribitMessage): void {
    // Handle subscription confirmations
    if (message.id && message.result) {
      return;
    }

    // Handle ticker updates
    if (message.method === 'subscription' && message.params?.channel) {
      const channel = message.params.channel;
      const data = message.params.data as DeribitTickerData;

      if (channel.startsWith('ticker.') && data) {
        const handlers = this.tickerHandlers.get(channel);
        if (handlers) {
          const optionData = this.parseTickerToOptionData(data);
          if (optionData) {
            handlers.forEach((handler) => handler(optionData));
          }
        }
      }
    }
  }

  private parseTickerToOptionData(ticker: DeribitTickerData): OptionData | null {
    // Parse instrument name: BTC-28MAR25-100000-C
    const parts = ticker.instrument_name.split('-');
    if (parts.length < 4) return null;

    const [, expDate, strikeStr, typeChar] = parts;
    const strike = parseFloat(strikeStr);
    const optionType = typeChar === 'C' ? 'call' : 'put';

    // Parse expiration date
    const expiration = this.parseExpirationDate(expDate);
    if (!expiration) return null;

    return {
      instrumentName: ticker.instrument_name,
      strike,
      expiration: expDate,
      expirationTimestamp: expiration.getTime(),
      optionType,
      markPrice: ticker.mark_price,
      markIV: ticker.mark_iv,
      bidIV: ticker.bid_iv || 0,
      askIV: ticker.ask_iv || 0,
      underlyingPrice: ticker.underlying_price,
      openInterest: ticker.open_interest,
      volume: ticker.volume,
      greeks: ticker.greeks || {
        delta: 0,
        gamma: 0,
        theta: 0,
        vega: 0,
        rho: 0,
      },
    };
  }

  private parseExpirationDate(dateStr: string): Date | null {
    // Format: 28MAR25
    const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };

    const month = months[monthStr];
    if (month === undefined) return null;

    return new Date(2000 + parseInt(year), month, parseInt(day), 8, 0, 0); // 08:00 UTC expiry
  }
}

export const deribitWS = DeribitWebSocket.getInstance();
export default DeribitWebSocket;
