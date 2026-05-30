// Playbook (Day 3) — saved setup library. Grid of setup cards + inline
// editor modal. Each setup links to trades via `playbookSetupId` (already
// in the trades schema) so the Dashboard tab can show per-setup stats.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  deletePlaybookSetup,
  listPlaybookSetups,
  savePlaybookSetup,
} from "../../lib/journal/api";
import { emptyPlaybookSetup, type PlaybookSetup } from "../../types/journal";

export default function PlaybookTab() {
  const [setups, setSetups] = useState<PlaybookSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlaybookSetup | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setSetups(await listPlaybookSetups());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this setup?")) return;
    await deletePlaybookSetup(id);
    await refetch();
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Playbook</h2>
          <p className="text-xs text-white/55 mt-0.5">
            Save your repeatable setups. Tag trades to track which ones actually work.
          </p>
        </div>
        <button onClick={() => setEditing(emptyPlaybookSetup())} className="j-btn-primary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Setup
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="j-skeleton" style={{ height: 160 }} />
          ))}
        </div>
      ) : setups.length === 0 ? (
        <div className="j-empty">
          <div className="j-empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
            </svg>
          </div>
          <div className="j-empty-title">No setups yet</div>
          <div className="j-empty-sub">Create your first setup to start tagging trades.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 j-stagger">
          {setups.map((s) => (
            <SetupCard
              key={s.id}
              setup={s}
              onEdit={() => setEditing(s)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <SetupEditor
          setup={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

function SetupCard({
  setup,
  onEdit,
  onDelete,
}: {
  setup: PlaybookSetup;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = setup.color || "#7ed321";
  const criteriaLines = useMemo(
    () => (setup.criteria ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
    [setup.criteria],
  );
  return (
    <div
      className="relative rounded-xl p-4 transition-all"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.010))",
        border: "1px solid rgba(160, 160, 160, 0.14)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(126, 211, 33, 0.32)";
        e.currentTarget.style.boxShadow = "0 0 0 1px rgba(126, 211, 33, 0.08), 0 12px 32px -16px rgba(126, 211, 33, 0.30)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(160, 160, 160, 0.14)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}55` }} />
          <h3 className="text-sm font-semibold text-white truncate">{setup.name}</h3>
        </div>
        {setup.targetWinRate !== null && (
          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(126, 211, 33, 0.10)", color: "#7ed321" }}>
            {setup.targetWinRate}%
          </span>
        )}
      </div>

      {setup.description && (
        <p className="text-xs text-white/62 line-clamp-2 mb-3">{setup.description}</p>
      )}

      {criteriaLines.length > 0 && (
        <ul className="space-y-1 mb-3">
          {criteriaLines.slice(0, 4).map((l, i) => (
            <li key={i} className="text-[11px] text-white/55 flex items-start gap-1.5">
              <span className="text-[#7ed321] mt-0.5">✓</span>
              <span className="line-clamp-1">{l}</span>
            </li>
          ))}
          {criteriaLines.length > 4 && (
            <li className="text-[10px] text-white/30 ml-3.5">+{criteriaLines.length - 4} more</li>
          )}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button onClick={onEdit} className="j-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>
          Edit
        </button>
        <button onClick={onDelete} className="j-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>
          Delete
        </button>
      </div>
    </div>
  );
}

function SetupEditor({
  setup,
  onClose,
  onSaved,
}: {
  setup: PlaybookSetup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PlaybookSetup>(setup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await savePlaybookSetup({ ...form, name: form.name.trim() });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
        animation: "csvFadeIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)", maxHeight: "85vh", overflowY: "auto",
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16, padding: 24, color: "#fff",
          boxShadow: "0 24px 80px -16px rgba(0,0,0,0.6)",
          animation: "csvSlideIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {setup.id ? "Edit setup" : "New setup"}
          </h2>
          <button onClick={onClose} className="j-btn-ghost" style={{ padding: "5px 10px" }}>Close</button>
        </div>

        <div className="space-y-3">
          <Field label="Name (required)">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="j-input"
              placeholder="e.g. Opening Range Breakout"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Color">
              <input
                type="color"
                value={form.color || "#7ed321"}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="j-input"
                style={{ height: 38, padding: 4, cursor: "pointer" }}
              />
            </Field>
            <Field label="Target win rate (%)">
              <input
                type="number"
                min={0} max={100}
                value={form.targetWinRate ?? ""}
                onChange={(e) => setForm({ ...form, targetWinRate: e.target.value ? parseFloat(e.target.value) : null })}
                className="j-input"
                placeholder="60"
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className="j-input"
              style={{ resize: "vertical" }}
              placeholder="Short description of the setup."
            />
          </Field>

          <Field label="Criteria (one per line)">
            <textarea
              rows={5}
              value={form.criteria ?? ""}
              onChange={(e) => setForm({ ...form, criteria: e.target.value || null })}
              className="j-input"
              style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
              placeholder={"Higher timeframe trend = up\nVolume profile breakout\nKey level retest\nTight stop, defined risk"}
            />
          </Field>

          <Field label="Reference image URL">
            <input
              value={form.imageUrl ?? ""}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })}
              className="j-input"
              placeholder="https://… or file:///…"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-3 text-xs px-3 py-2 rounded-md" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.18)" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-white/5">
          <button onClick={onClose} className="j-btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="j-btn-primary">
            {saving ? "Saving…" : "Save setup"}
          </button>
        </div>

        <style>{`
          .j-input {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.10);
            color: #fff;
            transition: border-color 180ms ease;
          }
          .j-input:focus {
            outline: none !important;
            border-color: rgba(126, 211, 33, 0.55) !important;
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-wider uppercase text-white/55 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
