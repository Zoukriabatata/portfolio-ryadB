'use client';

import type { DailyNote } from '@/types/journal';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface DailyNoteCardProps {
  note: DailyNote;
  onEdit: (note: DailyNote) => void;
  onDelete: (id: string) => void;
}

const MOOD_COLORS = ['', 'var(--bear)', 'var(--bear)', 'var(--bear)', 'var(--warning)', 'var(--warning)', 'var(--text-primary)', 'var(--text-primary)', 'var(--bull)', 'var(--bull)', 'var(--bull)'];

export default function DailyNoteCard({ note, onEdit, onDelete }: DailyNoteCardProps) {
  const dateFormatted = new Date(note.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const tradePnl = note.linkedTrades?.reduce((s, t) => s + (t.pnl || 0), 0) || 0;
  const tradeCount = note.linkedTrades?.length || 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--primary)]/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{dateFormatted}</span>
          {note.mood && (
            <span className="text-xs font-bold font-mono" style={{ color: MOOD_COLORS[note.mood] || 'var(--text-muted)' }}>
              Mood: {note.mood}/10
            </span>
          )}
          {note.marketConditions && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-secondary)]">
              {note.marketConditions}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {tradeCount > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {tradeCount} trade{tradeCount > 1 ? 's' : ''} — <span style={{ color: tradePnl >= 0 ? 'var(--bull)' : 'var(--bear)' }} className="font-mono font-bold">{formatCurrency(tradePnl)}</span>
            </span>
          )}
          <button onClick={() => onEdit(note)} className="text-xs text-[var(--text-dimmed)] hover:text-[var(--primary)] transition-colors">
            Edit
          </button>
          <button onClick={() => onDelete(note.id)} className="text-xs text-[var(--text-dimmed)] hover:text-[var(--error)] transition-colors">
            Delete
          </button>
        </div>
      </div>

      {/* Content sections */}
      <div className="space-y-3">
        {note.premarketPlan && (
          <Section title="Pre-Market Plan" content={note.premarketPlan} />
        )}
        {note.endOfDayReview && (
          <Section title="End of Day Review" content={note.endOfDayReview} />
        )}
        {note.lessons && (
          <Section title="Lessons" content={note.lessons} />
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[var(--text-dimmed)] uppercase tracking-wider mb-1">{title}</p>
      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  );
}
