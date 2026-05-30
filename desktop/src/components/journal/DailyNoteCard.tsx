// Native port of `components/journal/DailyNoteCard.tsx`. Read-only
// display of a single daily note. Trade aggregation per day is left
// out for Day 2 — it'd require a join with trades; will be added in
// Day 4 (dashboard analytics) where we already aggregate per-day.

import type { DailyNote } from "../../types/journal";

const MOOD_COLORS = [
  "rgba(255,255,255,0.40)",
  "#ffffff", "#ffffff", "#ffffff",
  "#a3e635", "#a3e635",
  "#7ed321", "#7ed321",
  "#7ed321", "#7ed321", "#7ed321",
];

interface Props {
  note: DailyNote;
  onEdit: (note: DailyNote) => void;
  onDelete: (id: string) => void;
}

export default function DailyNoteCard({ note, onEdit, onDelete }: Props) {
  const dateFormatted = new Date(note.date + "T12:00:00").toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric" }
  );

  return (
    <div
      className="relative rounded-xl p-5 transition-all duration-300"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.010))",
        border: "1px solid rgba(160, 160, 160, 0.14)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(126, 211, 33, 0.32)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow =
          "0 0 0 1px rgba(126, 211, 33, 0.08), 0 12px 32px -16px rgba(126, 211, 33, 0.30)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(160, 160, 160, 0.14)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-white tracking-tight">{dateFormatted}</span>
          {note.mood !== null && (
            <span
              className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full"
              style={{
                color: MOOD_COLORS[note.mood] ?? "rgba(255,255,255,0.55)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              Mood {note.mood}/10
            </span>
          )}
          {note.marketConditions && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-white/70">
              {note.marketConditions}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(note)}
            className="j-btn-ghost"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="j-btn-ghost"
            style={{ padding: "5px 12px", fontSize: 11 }}
          >
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
        {note.lessons && <Section title="Lessons" content={note.lessons} />}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1">
        {title}
      </p>
      <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">
        {content}
      </p>
    </div>
  );
}
