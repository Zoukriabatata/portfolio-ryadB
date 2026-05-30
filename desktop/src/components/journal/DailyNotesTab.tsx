// Native port of `components/journal/DailyNotesTab.tsx`. Owns the
// month + editor state, renders nav + editor + list of cards.

import { useEffect, useState } from "react";
import DailyNotesCalendarNav from "./DailyNotesCalendarNav";
import DailyNoteEditor from "./DailyNoteEditor";
import DailyNoteCard from "./DailyNoteCard";
import { listDailyNotesMonth, deleteDailyNote } from "../../lib/journal/api";
import type { DailyNote } from "../../types/journal";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyNotesTab() {
  const [month, setMonth] = useState<string>(currentMonth);
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState<DailyNote | null>(null);
  const [editDate, setEditDate] = useState(todayDate);

  const refetch = async () => {
    setLoading(true);
    try {
      const list = await listDailyNotesMonth(month);
      setNotes(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleNewNote = () => {
    setEditNote(null);
    setEditDate(todayDate());
    setEditing(true);
  };

  const handleEdit = (note: DailyNote) => {
    setEditNote(note);
    setEditDate(note.date);
    setEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await deleteDailyNote(id);
    await refetch();
  };

  const handleSaved = async () => {
    setEditing(false);
    setEditNote(null);
    await refetch();
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DailyNotesCalendarNav
          month={month}
          onMonthChange={setMonth}
          noteCount={notes.length}
        />
        <button onClick={handleNewNote} className="j-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Note
        </button>
      </div>

      {/* Editor (inline) */}
      {editing && (
        <DailyNoteEditor
          date={editDate}
          existingNote={editNote}
          onSaved={handleSaved}
          onCancel={() => {
            setEditing(false);
            setEditNote(null);
          }}
        />
      )}

      {/* Notes list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="j-skeleton" style={{ height: 128 }} />
          ))}
        </div>
      ) : notes.length === 0 && !editing ? (
        <div className="j-empty">
          <div className="j-empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <div className="j-empty-title">No notes for this month</div>
          <div className="j-empty-sub">
            Start journaling your trading day — premarket plan, end-of-day review, lessons.
          </div>
        </div>
      ) : (
        <div className="j-stagger space-y-4">
          {notes.map((note) => (
            <DailyNoteCard
              key={note.id}
              note={note}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
