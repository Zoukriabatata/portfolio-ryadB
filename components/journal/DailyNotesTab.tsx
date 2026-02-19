'use client';

import { useState } from 'react';
import { useDailyNotes } from '@/hooks/useDailyNotes';
import DailyNotesCalendarNav from './DailyNotesCalendarNav';
import DailyNoteEditor from './DailyNoteEditor';
import DailyNoteCard from './DailyNoteCard';
import type { DailyNote } from '@/types/journal';

export default function DailyNotesTab() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const { notes, loading, saveNote, deleteNote } = useDailyNotes(month);

  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState<DailyNote | null>(null);
  const [editDate, setEditDate] = useState(new Date().toISOString().slice(0, 10));

  const handleNewNote = () => {
    setEditNote(null);
    setEditDate(new Date().toISOString().slice(0, 10));
    setEditing(true);
  };

  const handleEdit = (note: DailyNote) => {
    setEditNote(note);
    setEditDate(typeof note.date === 'string' ? note.date.slice(0, 10) : new Date(note.date).toISOString().slice(0, 10));
    setEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await deleteNote(id);
  };

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <DailyNotesCalendarNav
          month={month}
          onMonthChange={setMonth}
          noteCount={notes.length}
        />
        <button
          onClick={handleNewNote}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          style={{ background: 'var(--primary)', color: 'var(--background)' }}
        >
          + New Note
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <DailyNoteEditor
          date={editDate}
          existingNote={editNote}
          onSave={saveNote}
          onCancel={() => { setEditing(false); setEditNote(null); }}
        />
      )}

      {/* Notes list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 h-32 animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 && !editing ? (
        <div className="flex flex-col items-center justify-center h-48 rounded-xl border border-dashed border-[var(--border)]">
          <p className="text-sm text-[var(--text-muted)]">No notes for this month</p>
          <p className="text-xs text-[var(--text-dimmed)] mt-1">Start journaling your trading day</p>
        </div>
      ) : (
        <div className="space-y-4">
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
