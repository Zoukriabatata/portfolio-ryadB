'use client';

import { useReplay } from '@/hooks/useReplay';
import { useReplayUIStore, type ReplayBookmark } from '@/stores/useReplayUIStore';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { formatDuration, formatSize, formatDate, formatTime } from './utils';

export default function SessionInfoModal() {
  const { sessions } = useReplay();
  const { sessionInfoId, closeSessionInfo, bookmarks } = useReplayUIStore();

  const session = sessions.find((s) => s.id === sessionInfoId);
  const sessionBookmarks: ReplayBookmark[] = sessionInfoId ? bookmarks[sessionInfoId] || [] : [];

  return (
    <Modal
      open={!!sessionInfoId && !!session}
      onClose={closeSessionInfo}
      size="md"
      title="Session Details"
    >
      {session && (
        <div className="space-y-5">
          {/* Header info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="text-lg font-bold font-mono"
                style={{ color: 'var(--text-primary)' }}
              >
                {session.symbol}
              </span>
              <Badge
                variant={session.status === 'completed' ? 'success' : session.status === 'recording' ? 'error' : 'neutral'}
                dot
              >
                {session.status}
              </Badge>
            </div>
            {session.metadata?.description && (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {session.metadata.description}
              </p>
            )}
            {session.metadata?.tags && session.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {session.metadata.tags.map((tag) => (
                  <Badge key={tag} variant="neutral">{tag}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Recording period */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>
              Recording Period
            </p>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Start" value={formatDate(session.startTime)} />
              <InfoRow label="End" value={session.endTime > 0 ? formatDate(session.endTime) : '—'} />
              <InfoRow label="Duration" value={formatDuration(session.endTime - session.startTime)} />
              <InfoRow label="Time Range" value={`${formatTime(session.startTime)} → ${formatTime(session.endTime)}`} />
            </div>
          </div>

          {/* Data summary */}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>
              Data Summary
            </p>
            <div className="grid grid-cols-3 gap-3">
              <InfoRow label="Trades" value={session.tradeCount.toLocaleString()} />
              <InfoRow label="Depth Snapshots" value={String(session.depthSnapshotCount)} />
              <InfoRow label="Storage" value={formatSize(session.fileSizeEstimate)} />
            </div>
          </div>

          {/* Bookmarks */}
          {sessionBookmarks.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>
                Bookmarks ({sessionBookmarks.length})
              </p>
              <div className="space-y-1.5">
                {sessionBookmarks.map((bm) => (
                  <div key={bm.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: bm.color }} />
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatTime(bm.timestamp)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {bm.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}
