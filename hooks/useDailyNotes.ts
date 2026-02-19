'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DailyNote } from '@/types/journal';

export function useDailyNotes(month: string) {
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/journal/daily-notes?month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const saveNote = async (data: {
    date: string;
    premarketPlan?: string;
    endOfDayReview?: string;
    lessons?: string;
    mood?: number;
    marketConditions?: string;
  }) => {
    const res = await fetch('/api/journal/daily-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) fetchNotes();
    return res.ok;
  };

  const deleteNote = async (id: string) => {
    const res = await fetch(`/api/journal/daily-notes/${id}`, { method: 'DELETE' });
    if (res.ok) fetchNotes();
    return res.ok;
  };

  return { notes, loading, saveNote, deleteNote, refetch: fetchNotes };
}
