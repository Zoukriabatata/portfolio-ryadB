'use client';

import { useState, useEffect } from 'react';
import { MARKET_CONDITIONS } from '@/types/journal';
import type { DailyNote } from '@/types/journal';

interface DailyNoteEditorProps {
  date: string;
  existingNote?: DailyNote | null;
  onSave: (data: {
    date: string;
    premarketPlan?: string;
    endOfDayReview?: string;
    lessons?: string;
    mood?: number;
    marketConditions?: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}

export default function DailyNoteEditor({ date, existingNote, onSave, onCancel }: DailyNoteEditorProps) {
  const [premarketPlan, setPremarketPlan] = useState('');
  const [endOfDayReview, setEndOfDayReview] = useState('');
  const [lessons, setLessons] = useState('');
  const [mood, setMood] = useState(5);
  const [marketConditions, setMarketConditions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingNote) {
      setPremarketPlan(existingNote.premarketPlan || '');
      setEndOfDayReview(existingNote.endOfDayReview || '');
      setLessons(existingNote.lessons || '');
      setMood(existingNote.mood || 5);
      setMarketConditions(existingNote.marketConditions || '');
    } else {
      setPremarketPlan('');
      setEndOfDayReview('');
      setLessons('');
      setMood(5);
      setMarketConditions('');
    }
  }, [existingNote, date]);

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave({
      date,
      premarketPlan: premarketPlan || undefined,
      endOfDayReview: endOfDayReview || undefined,
      lessons: lessons || undefined,
      mood,
      marketConditions: marketConditions || undefined,
    });
    setSaving(false);
    if (success) onCancel();
  };

  const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const inputStyle = 'w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors resize-none';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{dateFormatted}</h3>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
            style={{ background: 'var(--primary)', color: 'var(--background)' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Mood & Market Conditions */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Mood (1-10)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="1" max="10"
                value={mood}
                onChange={(e) => setMood(parseInt(e.target.value))}
                className="flex-1 accent-[var(--primary)]"
              />
              <span className="text-sm font-bold font-mono text-[var(--text-primary)] w-6 text-right">{mood}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Market Conditions</label>
            <select
              value={marketConditions}
              onChange={(e) => setMarketConditions(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none"
            >
              <option value="">--</option>
              {MARKET_CONDITIONS.map(mc => <option key={mc} value={mc}>{mc}</option>)}
            </select>
          </div>
        </div>

        {/* Pre-market Plan */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Pre-Market Plan</label>
          <textarea
            value={premarketPlan}
            onChange={(e) => setPremarketPlan(e.target.value)}
            rows={3}
            className={inputStyle}
            placeholder="What are you watching today? Key levels, bias, setups to look for..."
          />
        </div>

        {/* End of Day Review */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">End of Day Review</label>
          <textarea
            value={endOfDayReview}
            onChange={(e) => setEndOfDayReview(e.target.value)}
            rows={3}
            className={inputStyle}
            placeholder="How did the day go? Did you follow your plan? What went right/wrong?"
          />
        </div>

        {/* Lessons */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">Key Lessons</label>
          <textarea
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            rows={2}
            className={inputStyle}
            placeholder="What did you learn today? Any patterns or insights?"
          />
        </div>
      </div>
    </div>
  );
}
