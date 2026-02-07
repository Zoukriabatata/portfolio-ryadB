'use client';

/**
 * DXFEED CONNECTION TEST PAGE
 *
 * Page de test pour vérifier la connexion dxFeed
 * URL: http://localhost:3000/test-dxfeed
 */

import { useEffect, useState, useCallback } from 'react';

interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'error' | 'trade' | 'quote';
  message: string;
}

export default function TestDxFeedPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [tradeCount, setTradeCount] = useState(0);
  const [quoteCount, setQuoteCount] = useState(0);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), { time, type, message }]);
  }, []);

  const runTest = useCallback(async () => {
    setLogs([]);
    setStatus('connecting');
    setTradeCount(0);
    setQuoteCount(0);

    addLog('info', 'Loading @dxfeed/api...');

    try {
      const { Feed, EventType } = await import('@dxfeed/api');
      addLog('success', '@dxfeed/api loaded successfully');

      const feed = new Feed();
      const DXFEED_URL = 'wss://demo.dxfeed.com/webservice/cometd';
      const SYMBOL = '/NQ';

      addLog('info', `Connecting to ${DXFEED_URL}...`);

      // State handler
      feed.endpoint.registerStateChangeHandler((state) => {
        addLog('info', `State change: ${JSON.stringify(state)}`);

        if (state.connected === true) {
          setStatus('connected');
          addLog('success', '✓ CONNECTED to dxFeed demo!');

          // Subscribe to Quote
          addLog('info', `Subscribing to Quote on ${SYMBOL}...`);
          feed.subscribe(
            [EventType.Quote],
            [SYMBOL],
            (quote: { eventSymbol?: string; bidPrice?: number; askPrice?: number; bidSize?: number; askSize?: number }) => {
              setQuoteCount(prev => prev + 1);
              addLog('quote', `Quote: Bid ${quote.bidPrice} (${quote.bidSize}) | Ask ${quote.askPrice} (${quote.askSize})`);
            }
          );

          // Subscribe to Trade
          addLog('info', `Subscribing to Trade on ${SYMBOL}...`);
          feed.subscribe(
            [EventType.Trade],
            [SYMBOL],
            (trade: { eventSymbol?: string; price?: number; size?: number; time?: number; tickDirection?: string }) => {
              setTradeCount(prev => prev + 1);
              addLog('trade', `Trade: ${trade.price} x ${trade.size} (${trade.tickDirection})`);
            }
          );
        } else if (state.connected === false) {
          addLog('error', 'Disconnected from dxFeed');
          setStatus('error');
        }
      });

      // Connect
      feed.connect(DXFEED_URL);

      // Cleanup after 60 seconds
      setTimeout(() => {
        addLog('info', 'Test timeout - disconnecting...');
        feed.disconnect();
      }, 60000);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog('error', `Error: ${message}`);
      setStatus('error');
    }
  }, [addLog]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#e0e0e0',
      padding: '20px',
      fontFamily: 'monospace',
    }}>
      <h1 style={{ marginBottom: '20px' }}>dxFeed Connection Test</h1>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={runTest}
          disabled={status === 'connecting'}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: status === 'connecting' ? '#444' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: status === 'connecting' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'connecting' ? 'Connecting...' : 'Run Test'}
        </button>

        <span style={{
          marginLeft: '20px',
          padding: '5px 10px',
          borderRadius: '4px',
          backgroundColor:
            status === 'connected' ? '#166534' :
            status === 'connecting' ? '#854d0e' :
            status === 'error' ? '#991b1b' :
            '#374151',
        }}>
          {status.toUpperCase()}
        </span>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
        <div style={{ padding: '10px', backgroundColor: '#1e293b', borderRadius: '4px' }}>
          <strong>Trades:</strong> {tradeCount}
        </div>
        <div style={{ padding: '10px', backgroundColor: '#1e293b', borderRadius: '4px' }}>
          <strong>Quotes:</strong> {quoteCount}
        </div>
      </div>

      <div style={{
        backgroundColor: '#111',
        border: '1px solid #333',
        borderRadius: '4px',
        padding: '10px',
        maxHeight: '500px',
        overflow: 'auto',
        fontSize: '12px',
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>Click "Run Test" to start...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{
              padding: '2px 0',
              color:
                log.type === 'success' ? '#22c55e' :
                log.type === 'error' ? '#ef4444' :
                log.type === 'trade' ? '#f59e0b' :
                log.type === 'quote' ? '#06b6d4' :
                '#9ca3af',
            }}>
              <span style={{ color: '#666' }}>[{log.time}]</span> {log.message}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '20px', color: '#666', fontSize: '12px' }}>
        <p><strong>Expected behavior:</strong></p>
        <ul>
          <li>State change: {"{ connected: true }"}</li>
          <li>Quote events with bid/ask prices</li>
          <li>Trade events with price/size</li>
        </ul>
        <p style={{ marginTop: '10px' }}>
          <strong>Note:</strong> dxFeed demo data is delayed 15 minutes.
          If no data appears, it might be outside market hours.
        </p>
      </div>
    </div>
  );
}
