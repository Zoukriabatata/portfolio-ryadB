'use client';

import { useState } from 'react';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import RecordingPulse from './RecordingPulse';
import { formatDuration, formatSize } from './utils';

interface RecordingPanelProps {
  isConnected: boolean;
  isRecording: boolean;
  recordingStats: { tradeCount: number; depthCount: number; duration: number; sizeEstimate: number };
  onStartRecording: (symbol: string, description?: string) => Promise<string>;
  onStopRecording: () => Promise<unknown>;
}

export default function RecordingPanel({
  isConnected,
  isRecording,
  recordingStats,
  onStartRecording,
  onStopRecording,
}: RecordingPanelProps) {
  const [recordSymbol, setRecordSymbol] = useState('ES');
  const [recordDescription, setRecordDescription] = useState('');

  const handleStart = async () => {
    if (!isConnected) return;
    await onStartRecording(recordSymbol, recordDescription || undefined);
    setRecordDescription('');
  };

  return (
    <div className="space-y-3">
      {/* IB Connection Status */}
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

      {!isRecording ? (
        <>
          {/* Symbol select */}
          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
              Symbol
            </label>
            <select
              value={recordSymbol}
              onChange={(e) => setRecordSymbol(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {Object.entries(CME_CONTRACTS).map(([sym, spec]) => (
                <option key={sym} value={sym}>
                  {sym} — {spec.description}
                </option>
              ))}
            </select>
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
            disabled={!isConnected}
            onClick={handleStart}
            className="w-full"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
              </svg>
            }
          >
            Start Recording
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
