// Native port of `components/journal/DailyNoteEditor.tsx`. Inline
// editor (not modal — matches the website UX) with mood slider,
// market conditions select, and 3 textareas (premarket plan, EOD
// review, lessons). Save = upsert via Tauri.

import { useEffect, useState } from "react";
import { saveDailyNote } from "../../lib/journal/api";
import { MARKET_CONDITIONS, type DailyNote } from "../../types/journal";

interface Props {
  /** "YYYY-MM-DD" — the date this note is associated with. */
  date: string;
  existingNote?: DailyNote | null;
  onSaved: (note: DailyNote) => void;
  onCancel: () => void;
}

export default function DailyNoteEditor({
  date,
  existingNote,
  onSaved,
  onCancel,
}: Props) {
  const [premarketPlan, setPremarketPlan] = useState("");
  const [endOfDayReview, setEndOfDayReview] = useState("");
  const [lessons, setLessons] = useState("");
  const [mood, setMood] = useState(5);
  const [marketConditions, setMarketConditions] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (existingNote) {
      setPremarketPlan(existingNote.premarketPlan ?? "");
      setEndOfDayReview(existingNote.endOfDayReview ?? "");
      setLessons(existingNote.lessons ?? "");
      setMood(existingNote.mood ?? 5);
      setMarketConditions(existingNote.marketConditions ?? "");
    } else {
      setPremarketPlan("");
      setEndOfDayReview("");
      setLessons("");
      setMood(5);
      setMarketConditions("");
    }
    setErr(null);
  }, [existingNote, date]);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      const note: DailyNote = {
        id: existingNote?.id ?? "",
        date,
        premarketPlan: premarketPlan || null,
        endOfDayReview: endOfDayReview || null,
        lessons: lessons || null,
        mood,
        marketConditions: marketConditions || null,
        createdAt: existingNote?.createdAt ?? "",
        updatedAt: existingNote?.updatedAt ?? "",
      };
      const saved = await saveDailyNote(note);
      onSaved(saved);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const inputStyle =
    "w-full px-3 py-2 rounded-lg text-sm bg-white/[0.03] border border-white/10 text-white focus:border-[#7ed321]/55 focus:outline-none transition-colors resize-none";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 animate-[fadeIn_180ms_ease]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">{dateFormatted}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-white/55 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
            style={{ background: "#7ed321", color: "#0a0a0a" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err && (
        <div className="text-xs px-3 py-2 mb-3 rounded-md border border-white/15 bg-white/[0.04] text-white/85">
          {err}
        </div>
      )}

      <div className="space-y-4">
        {/* Mood + Market conditions */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-white/55">
              Mood (1-10)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                value={mood}
                onChange={(e) => setMood(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#7ed321]"
              />
              <span className="text-sm font-bold font-mono text-white w-6 text-right">
                {mood}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-white/55">
              Market Conditions
            </label>
            <select
              value={marketConditions}
              onChange={(e) => setMarketConditions(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/[0.03] border border-white/10 text-white focus:border-[#7ed321]/55 focus:outline-none"
            >
              <option value="">—</option>
              {MARKET_CONDITIONS.map((mc) => (
                <option key={mc} value={mc}>{mc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Premarket plan */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-white/55">
            Pre-Market Plan
          </label>
          <textarea
            value={premarketPlan}
            onChange={(e) => setPremarketPlan(e.target.value)}
            rows={3}
            className={inputStyle}
            placeholder="What are you watching today? Key levels, bias, setups to look for…"
          />
        </div>

        {/* End of day review */}
        <div>
          <label className="block text-xs font-medium mb-1.5 text-white/55">
            End of Day Review
          </label>
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
          <label className="block text-xs font-medium mb-1.5 text-white/55">
            Key Lessons
          </label>
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
