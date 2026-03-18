/**
 * TradovateProxy
 *
 * Manages a single Tradovate WebSocket connection for one user.
 * Handles authentication, heartbeat (2.5s required), auto-reconnect
 * with exponential backoff, and real-time trade aggregation.
 *
 * Emits:
 *   'data'   → normalized market data (quote | dom | trade | candle | history)
 *   'status' → { type: 'status', status: 'connecting'|'connected'|'disconnected'|'error' }
 */

'use strict';

const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const { createCandleAggregator } = require('./utils/aggregator');

const TRADOVATE_DEMO_API = 'https://demo.tradovateapi.com/v1';
const TRADOVATE_LIVE_API = 'https://live.tradovateapi.com/v1';
// Tradovate uses the same MD WebSocket URL for both demo and live
const TRADOVATE_MD_WS = 'wss://md.tradovateapi.com/v1/websocket';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 2_500; // Tradovate drops connection without this
const CONNECT_TIMEOUT_MS = 15_000;

class TradovateProxy extends EventEmitter {
  constructor({ userId, username, password, mode = 'demo' }) {
    super();
    this._userId = userId;
    this._username = username;
    this._password = password;
    this._mode = mode;

    this._ws = null;
    this._accessToken = null;
    this._tokenExpiry = 0;
    this._status = 'disconnected';

    this._heartbeat = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;

    // symbol (string) ↔ contractId (number) bidirectional lookup
    this._contractIds = new Map();

    // Currently subscribed symbols
    this._subscriptions = new Set();

    // Per-symbol candle aggregators (for footprint/delta)
    this._aggregators = new Map();
  }

  get _apiUrl() {
    return this._mode === 'live' ? TRADOVATE_LIVE_API : TRADOVATE_DEMO_API;
  }

  getStatus() {
    return this._status;
  }

  _setStatus(status) {
    this._status = status;
    this.emit('status', { type: 'status', status });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async connect() {
    if (this._status === 'connected' || this._status === 'connecting') return;

    this._setStatus('connecting');
    console.log(`[Proxy:${this._userId}] Connecting (mode=${this._mode})`);

    try {
      await this._authenticate();
      await this._connectWS();
      this._reconnectAttempts = 0;
    } catch (err) {
      console.error(`[Proxy:${this._userId}] Connect failed:`, err.message);
      this._setStatus('error');
      this._scheduleReconnect();
    }
  }

  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._stopHeartbeat();

    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close(1000, 'User disconnect');
      this._ws = null;
    }

    this._setStatus('disconnected');
  }

  subscribeQuote(symbol) {
    this._subscriptions.add(symbol);
    this._send('md/subscribeQuote', { symbol });
    console.log(`[Proxy:${this._userId}] Subscribe quote: ${symbol}`);
  }

  async subscribeDom(symbol) {
    this._subscriptions.add(symbol);
    const contractId = await this._resolveContractId(symbol);
    if (contractId) {
      this._send('md/subscribeDOM', { symbol });
      console.log(`[Proxy:${this._userId}] Subscribe DOM: ${symbol}`);
    } else {
      console.warn(`[Proxy:${this._userId}] DOM subscribe failed: contract not found for ${symbol}`);
    }
  }

  subscribeChart(symbol, intervalMinutes = 1) {
    this._subscriptions.add(symbol);

    // Create per-symbol candle aggregator for real-time footprint building
    if (!this._aggregators.has(symbol)) {
      this._aggregators.set(symbol, createCandleAggregator(intervalMinutes));
    }

    const barsNeeded = 500;
    const lookbackMs = barsNeeded * intervalMinutes * 60 * 1000;

    this._send('md/getChart', {
      symbol,
      chartDescription: {
        underlyingType: intervalMinutes >= 1440 ? 'DailyBar' : 'MinuteBar',
        elementSize: intervalMinutes >= 1440 ? 1 : intervalMinutes,
        elementSizeUnit: 'UnderlyingUnits',
        withHistogram: false,
      },
      timeRange: {
        asFarAsTimestamp: new Date(Date.now() - lookbackMs).toISOString(),
        asMuchAsElements: barsNeeded,
      },
    });

    console.log(`[Proxy:${this._userId}] Subscribe chart: ${symbol} @ ${intervalMinutes}m`);
  }

  unsubscribe(symbol) {
    this._subscriptions.delete(symbol);
    this._send('md/unsubscribeQuote', { symbol });
    this._send('md/unsubscribeDOM', { symbol });
    this._aggregators.delete(symbol);
    console.log(`[Proxy:${this._userId}] Unsubscribed: ${symbol}`);
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  async _authenticate() {
    // Reuse token if valid (with 5min safety buffer)
    if (this._accessToken && Date.now() < this._tokenExpiry - 5 * 60 * 1000) {
      return;
    }

    const body = {
      name: this._username,
      password: this._password,
      appId: process.env.TRADOVATE_APP_ID || 'Senzoukria',
      appVersion: process.env.TRADOVATE_APP_VERSION || '1.0.0',
    };

    // Optional CID and secret for registered Tradovate app partners
    if (process.env.TRADOVATE_CID) body.cid = Number(process.env.TRADOVATE_CID);
    if (process.env.TRADOVATE_SECRET) body.sec = process.env.TRADOVATE_SECRET;

    const response = await fetch(`${this._apiUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Auth failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const data = await response.json();

    if (data['p-ticket']) {
      throw new Error('Captcha required — log into tradovate.com first, then retry');
    }

    if (!data.accessToken) {
      throw new Error(data.errorText || 'Auth failed: no access token returned');
    }

    this._accessToken = data.accessToken;
    this._tokenExpiry = new Date(data.expirationTime).getTime();
    console.log(`[Proxy:${this._userId}] Auth OK (expires ${data.expirationTime})`);
  }

  // ── WebSocket connection ───────────────────────────────────────────────────

  _connectWS() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('WS connect timeout')),
        CONNECT_TIMEOUT_MS
      );

      this._ws = new WebSocket(TRADOVATE_MD_WS);
      let authorized = false;

      this._ws.on('open', () => {
        // Step 1: authorize using the access token
        this._sendRaw(`authorize\n${Date.now()}\n\n${this._accessToken}`);

        // Tradovate requires a heartbeat every 2.5s or it drops the connection
        this._heartbeat = setInterval(() => this._sendRaw('[]'), HEARTBEAT_INTERVAL_MS);
      });

      this._ws.on('message', (raw) => {
        const data = raw.toString();

        // Authorization confirmation — response contains "s":200
        if (!authorized && data.includes('"s":200')) {
          authorized = true;
          clearTimeout(timeout);
          this._setStatus('connected');
          console.log(`[Proxy:${this._userId}] WS authorized`);

          // Re-subscribe to any active symbols (handles reconnect case)
          for (const symbol of this._subscriptions) {
            this.subscribeQuote(symbol);
          }

          resolve();
          return;
        }

        this._handleMessage(data);
      });

      this._ws.on('close', (code, reason) => {
        console.log(`[Proxy:${this._userId}] WS closed: ${code} ${reason?.toString()}`);
        this._stopHeartbeat();
        this._setStatus('disconnected');

        if (!authorized) {
          clearTimeout(timeout);
          reject(new Error(`WS closed before auth: code ${code}`));
        } else {
          // Connection dropped mid-session — schedule reconnect
          this._scheduleReconnect();
        }
      });

      this._ws.on('error', (err) => {
        console.error(`[Proxy:${this._userId}] WS error:`, err.message);
        if (!authorized) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  // ── Message sending ────────────────────────────────────────────────────────

  _sendRaw(message) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(message);
    }
  }

  /**
   * Send a Tradovate protocol message.
   * Format: "endpoint\nrequestId\n\n{json body}"
   */
  _send(endpoint, body = {}) {
    this._sendRaw(`${endpoint}\n${Date.now()}\n\n${JSON.stringify(body)}`);
  }

  // ── Message handling ───────────────────────────────────────────────────────

  _handleMessage(data) {
    const newlineIdx = data.indexOf('\n');
    if (newlineIdx === -1) return;

    const event = data.slice(0, newlineIdx);
    const rest = data.slice(newlineIdx + 1);

    let payload;
    try {
      payload = JSON.parse(rest);
    } catch {
      return; // Auth responses and heartbeat acks don't parse as JSON
    }

    switch (event) {
      case 'md':
        this._onMarketData(payload);
        break;
      case 'chart':
        this._onChartData(payload);
        break;
      case 'dom':
        this._onDOMData(payload);
        break;
    }
  }

  _onMarketData(data) {
    // Resolve symbol from contractId — or fall back to the single subscribed symbol
    const symbol = this._getSymbolByContractId(data.contractId);
    if (!symbol) return;

    // Quote update (bid / ask / last)
    if (data.bid !== undefined || data.offer !== undefined || data.trade !== undefined) {
      this.emit('data', {
        type: 'quote',
        symbol,
        bid: data.bid?.price ?? 0,
        ask: data.offer?.price ?? 0,
        last: data.trade?.price ?? 0,
        bidSize: data.bid?.size ?? 0,
        askSize: data.offer?.size ?? 0,
      });
    }

    // Trade — time & sales + feed into aggregator for footprint
    if (data.trade) {
      const { price, size, timestamp, aggressor } = data.trade;
      const side = aggressor === 1 ? 'buy' : 'sell'; // 1 = buyer aggressor (lift offer)

      const trade = {
        id: `${timestamp}-${price}-${size}`,
        price,
        size,
        time: new Date(timestamp).getTime(),
        side,
      };

      this.emit('data', { type: 'trade', symbol, trade });

      // Accumulate into candle aggregator for delta/footprint
      const aggregator = this._aggregators.get(symbol);
      if (aggregator) {
        const closedCandle = aggregator.addTrade(trade);
        if (closedCandle) {
          this.emit('data', { type: 'candle:closed', symbol, candle: closedCandle });
        }
        // Also emit current open candle update
        const openCandle = aggregator.getCurrentCandle();
        if (openCandle) {
          this.emit('data', { type: 'candle:update', symbol, candle: { ...openCandle } });
        }
      }
    }
  }

  _onChartData(data) {
    // Tradovate sends chart data with contractId as `id`
    const symbol = this._getSymbolByContractId(data.id);
    if (!symbol || !data.bars?.length) return;

    const candles = data.bars.map((bar) => ({
      time: Math.floor(new Date(bar.timestamp).getTime() / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: (bar.upVolume ?? 0) + (bar.downVolume ?? 0),
      buyVolume: bar.upVolume ?? 0,
      sellVolume: bar.downVolume ?? 0,
      delta: (bar.upVolume ?? 0) - (bar.downVolume ?? 0),
      footprint: {}, // Historical bars don't have per-level footprint
    }));

    // First large batch = historical data; single bar = live update
    if (candles.length > 1) {
      this.emit('data', { type: 'history', symbol, candles });
    } else {
      this.emit('data', { type: 'candle:update', symbol, candle: candles[0] });
    }
  }

  _onDOMData(data) {
    const symbol = this._getSymbolByContractId(data.contractId);
    if (!symbol) return;

    this.emit('data', {
      type: 'dom',
      symbol,
      bids: data.bids ?? [],
      offers: data.offers ?? [],
      timestamp: data.timestamp,
    });
  }

  // ── Contract ID resolution ─────────────────────────────────────────────────

  async _resolveContractId(symbol) {
    if (this._contractIds.has(symbol)) return this._contractIds.get(symbol);

    try {
      const response = await fetch(
        `${this._apiUrl}/contract/find?name=${encodeURIComponent(symbol)}`,
        {
          headers: {
            Authorization: `Bearer ${this._accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) return null;

      const contract = await response.json();
      if (!contract?.id) return null;

      // Store both directions for fast lookup
      this._contractIds.set(symbol, contract.id);
      this._contractIds.set(contract.id, symbol);
      return contract.id;
    } catch {
      return null;
    }
  }

  _getSymbolByContractId(contractId) {
    const val = this._contractIds.get(contractId);
    if (val && typeof val === 'string') return val;

    // Fallback: if only one symbol is subscribed, use it
    // (Tradovate sometimes omits contractId for quote-only messages)
    if (this._subscriptions.size === 1) {
      return [...this._subscriptions][0];
    }

    return null;
  }

  // ── Reconnection ───────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Proxy:${this._userId}] Max reconnect attempts reached — giving up`);
      this._setStatus('error');
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this._reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    this._reconnectAttempts++;
    console.log(
      `[Proxy:${this._userId}] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
    );

    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _stopHeartbeat() {
    if (this._heartbeat) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
  }
}

module.exports = { TradovateProxy };
