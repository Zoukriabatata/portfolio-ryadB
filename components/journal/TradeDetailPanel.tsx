'use client';

import type { JournalEntry } from '@/types/journal';
import Image from 'next/image';

interface TradeDetailPanelProps {
  trade: JournalEntry | null;
  onClose: () => void;
  onEdit: (trade: JournalEntry) => void;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

const formatPnl = (pnl: number | null) => {
  if (pnl === null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
};

export default function TradeDetailPanel({ trade, onClose, onEdit }: TradeDetailPanelProps) {
  if (!trade) return null;

  const tags: string[] = trade.tags
    ? (typeof trade.tags === 'string' ? JSON.parse(trade.tags) : trade.tags)
    : [];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[var(--surface-elevated)] border-l border-[var(--border)] shadow-xl animate-slideInRight flex flex-col"
      style={{ zIndex: 'var(--z-dropdown, 100)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold font-mono text-[var(--text-primary)]">{trade.symbol}</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{
              background: trade.side === 'LONG' ? 'var(--bull-bg, rgba(34,197,94,0.15))' : 'var(--bear-bg, rgba(239,68,68,0.15))',
              color: trade.side === 'LONG' ? 'var(--bull)' : 'var(--bear)',
            }}
          >
            {trade.side}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(trade)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface)] transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* P&L */}
        <div className="text-center py-4 rounded-xl bg-[var(--surface)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">P&L</p>
          <p
            className="text-3xl font-bold font-mono"
            style={{ color: (trade.pnl || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}
          >
            {formatPnl(trade.pnl)}
          </p>
        </div>

        {/* Trade Details */}
        <div className="space-y-3">
          <DetailRow label="Entry Price" value={String(trade.entryPrice)} mono />
          <DetailRow label="Exit Price" value={trade.exitPrice ? String(trade.exitPrice) : '-'} mono />
          <DetailRow label="Quantity" value={String(trade.quantity)} />
          <DetailRow label="Entry Time" value={formatDate(trade.entryTime)} />
          {trade.exitTime && <DetailRow label="Exit Time" value={formatDate(trade.exitTime)} />}
          {trade.timeframe && <DetailRow label="Timeframe" value={trade.timeframe} />}
          {trade.setup && <DetailRow label="Setup" value={trade.setup} />}
          {trade.emotions && <DetailRow label="Emotion" value={trade.emotions} />}
          {trade.rating && (
            <DetailRow
              label="Rating"
              value={'★'.repeat(trade.rating) + '☆'.repeat(5 - trade.rating)}
              valueColor="var(--warning)"
            />
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {trade.notes && (
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Notes</p>
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed bg-[var(--surface)] rounded-lg p-3">
              {trade.notes}
            </p>
          </div>
        )}

        {/* Screenshots */}
        {trade.screenshotUrls && trade.screenshotUrls.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Screenshots</p>
            <div className="grid grid-cols-2 gap-2">
              {trade.screenshotUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={url}
                    alt={`Screenshot ${i + 1}`}
                    width={400}
                    height={300}
                    className="w-full rounded-lg border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                    unoptimized
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, valueColor }: { label: string; value: string; mono?: boolean; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={`text-sm text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
