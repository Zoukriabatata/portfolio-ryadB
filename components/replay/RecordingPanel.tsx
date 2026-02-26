'use client';

import { useState } from 'react';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import type { RecordingExchange } from '@/lib/replay/ReplayRecorder';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import RecordingPulse from './RecordingPulse';
import { formatDuration, formatSize } from './utils';

const EXCHANGE_OPTIONS: { id: RecordingExchange; name: string; color: string; symbols: string[] }[] = [
  {
    id: 'ib',
    name: 'CME (IB)',
    color: '#e44d26',
    symbols: Object.keys(CME_CONTRACTS),
  },
  {
    id: 'binance',
    name: 'Binance',
    color: '#F0B90B',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ARBUSDT', 'SUIUSDT'],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    color: '#FFAB00',
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'AVAXUSDT', 'LINKUSDT'],
  },
  {
    id: 'deribit',
    name: 'Deribit',
    color: '#00D084',
    symbols: ['BTC-PERPETUAL', 'ETH-PERPETUAL'],
  },
];

interface RecordingPanelProps {
  isConnected: boolean;
  isRecording: boolean;
  recordingStats: { tradeCount: number; depthCount: number; duration: number; sizeEstimate: number };
  onStartRecording: (symbol: string, description?: string, exchange?: RecordingExchange) => Promise<string>;
  onStopRecording: () => Promise<unknown>;
}

export default function RecordingPanel({
  isConnected,
  isRecording,
  recordingStats,
  onStartRecording,
  onStopRecording,
}: RecordingPanelProps) {
  const [exchange, setExchange] = useState<RecordingExchange>('binance');
  const [recordSymbol, setRecordSymbol] = useState('BTCUSDT');
  const [recordDescription, setRecordDescription] = useState('');

  const activeExchange = EXCHANGE_OPTIONS.find(e => e.id === exchange) || EXCHANGE_OPTIONS[0];
  // Crypto exchanges don't need IB connection
  const needsIB = exchange === 'ib';
  const canRecord = needsIB ? isConnected : true;

  const handleStart = async () => {
    if (!canRecord) return;
    await onStartRecording(recordSymbol, recordDescription || undefined, exchange);
    setRecordDescription('');
  };

  return (
    <div className="space-y-3">
      {/* Connection Status */}
      {needsIB && (
        <Card variant={isConnected ? 'glass' : 'default'} padding={true}>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: isConnected ? 'var(--success)' : 'var(--text-dimmed)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              IB Gateway
            </span>
            <Badge variant={isConnected ? 'success' : 'neutral'} dot={isConnected}>
              {isConnected ? 'Connected' : 'Offline'}
            </Badge>
          </div>
          {!isConnected && (
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-dimmed)' }}>
              Connect to IB Gateway to record live CME data
            </p>
          )}
        </Card>
      )}

      {!isRecording ? (
        <>
          {/* Exchange selector */}
          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
              Exchange
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {EXCHANGE_OPTIONS.map(ex => (
                <button key={ex.id}
                  onClick={() => { setExchange(ex.id); setRecordSymbol(ex.symbols[0]); }}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] transition-all"
                  style={{
                    background: exchange === ex.id ? ex.color + '15' : 'var(--background)',
                    border: `1px solid ${exchange === ex.id ? ex.color : 'var(--border)'}`,
                    color: exchange === ex.id ? ex.color : 'var(--text-muted)',
                  }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: ex.color }} />
                  {ex.name}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol select */}
          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
              Symbol
            </label>
            <div className="flex flex-wrap gap-1">
              {activeExchange.symbols.map(s => (
                <button key={s}
                  onClick={() => setRecordSymbol(s)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono transition-all"
                  style={{
                    background: recordSymbol === s ? activeExchange.color + '20' : 'var(--background)',
                    border: `1px solid ${recordSymbol === s ? activeExchange.color : 'var(--border)'}`,
                    color: recordSymbol === s ? activeExchange.color : 'var(--text-muted)',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
              Description
            </label>
            <input
              type="text"
              value={recordDescription}
              onChange={(e) => setRecordDescription(e.target.value)}
              placeholder="Morning session, FOMC day..."
              className="w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] placeholder:text-[var(--text-dimmed)]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Start button */}
          <Button
            variant="danger"
            size="lg"
            disabled={!canRecord}
            onClick={handleStart}
            className="w-full"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
            }
          >
            {canRecord ? 'Start Recording' : 'Connect IB Gateway first'}
          </Button>
        </>
      ) : (
        /* Active Recording */
        <div className="space-y-3">
          <RecordingPulse symbol={recordSymbol} />

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Trades', value: recordingStats.tradeCount.toLocaleString() },
              { label: 'Depth', value: String(recordingStats.depthCount) },
              { label: 'Duration', value: formatDuration(recordingStats.duration) },
              { label: 'Size', value: formatSize(recordingStats.sizeEstimate) },
            ].map((stat) => (
              <Card key={stat.label} variant="elevated" padding={true} className="!p-2.5">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {stat.label}
                </p>
                <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {stat.value}
                </p>
              </Card>
            ))}
          </div>

          {/* Stop button */}
          <Button
            variant="secondary"
            size="lg"
            onClick={onStopRecording}
            className="w-full"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            }
          >
            Stop Recording
          </Button>
        </div>
      )}

      {/* Privacy notice */}
      <Card variant="glass" padding={true} className="!p-3">
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Recordings are stored locally in your browser (IndexedDB). Your personal CME data is never uploaded to our servers.
        </p>
      </Card>
    </div>
  );
}
