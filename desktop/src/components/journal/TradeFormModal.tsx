// Native port of `components/journal/TradeFormModal.tsx`. Uses our
// local Modal component + Tauri `journal_create_trade` /
// `journal_update_trade` commands instead of the website fetch.

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { SETUPS, EMOTIONS, SYMBOLS } from "./TradeFilters";
import { createTrade, updateTrade } from "../../lib/journal/api";
import type { JournalEntry } from "../../types/journal";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

interface FormState {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryTime: string;
  exitTime: string;
  timeframe: string;
  setup: string;
  notes: string;
  rating: number;
  emotions: string;
}

const DEFAULT_FORM: FormState = {
  symbol: "MNQ",
  side: "LONG",
  entryPrice: "",
  exitPrice: "",
  quantity: "1",
  entryTime: new Date().toISOString().slice(0, 16),
  exitTime: "",
  timeframe: "",
  setup: "",
  notes: "",
  rating: 0,
  emotions: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  editTrade?: JournalEntry | null;
  onSuccess: () => void;
}

export default function TradeFormModal({
  open,
  onClose,
  editTrade,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (editTrade) {
      setForm({
        symbol: editTrade.symbol,
        side: editTrade.side,
        entryPrice: String(editTrade.entryPrice),
        exitPrice: editTrade.exitPrice !== null ? String(editTrade.exitPrice) : "",
        quantity: String(editTrade.quantity),
        entryTime: new Date(editTrade.entryTime).toISOString().slice(0, 16),
        exitTime: editTrade.exitTime
          ? new Date(editTrade.exitTime).toISOString().slice(0, 16)
          : "",
        timeframe: editTrade.timeframe ?? "",
        setup: editTrade.setup ?? "",
        notes: editTrade.notes ?? "",
        rating: editTrade.rating ?? 0,
        emotions: editTrade.emotions ?? "",
      });
    } else {
      setForm({
        ...DEFAULT_FORM,
        entryTime: new Date().toISOString().slice(0, 16),
      });
    }
    setErr(null);
  }, [editTrade, open]);

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);

    try {
      const entryPrice = parseFloat(form.entryPrice);
      const exitPrice = form.exitPrice ? parseFloat(form.exitPrice) : null;
      const quantity = parseInt(form.quantity, 10) || 1;

      // Auto-compute pnl when both prices + quantity present.
      let pnl: number | null = null;
      if (exitPrice !== null && !isNaN(exitPrice) && !isNaN(entryPrice)) {
        const direction = form.side === "LONG" ? 1 : -1;
        pnl = (exitPrice - entryPrice) * direction * quantity;
      }

      const payload: JournalEntry = {
        id: editTrade?.id ?? "",
        symbol: form.symbol,
        side: form.side,
        entryPrice,
        exitPrice,
        quantity,
        pnl,
        entryTime: new Date(form.entryTime).toISOString(),
        exitTime: form.exitTime ? new Date(form.exitTime).toISOString() : null,
        timeframe: form.timeframe || null,
        setup: form.setup || null,
        tags: form.setup ? JSON.stringify([form.setup.toLowerCase()]) : null,
        notes: form.notes || null,
        rating: form.rating || null,
        emotions: form.emotions || null,
        screenshotUrl: editTrade?.screenshotUrl ?? null,
        screenshotUrls: editTrade?.screenshotUrls ?? [],
        playbookSetupId: editTrade?.playbookSetupId ?? null,
        createdAt: editTrade?.createdAt ?? "",
        updatedAt: editTrade?.updatedAt ?? "",
        // Hand-edited trades are always source="manual" (=null). Auto-imported
        // ones come from the Rithmic sync orchestrator and are never edited
        // through this form.
        externalSource: editTrade?.externalSource ?? null,
        externalId: editTrade?.externalId ?? null,
        accountId: editTrade?.accountId ?? null,
        commission: editTrade?.commission ?? null,
      };

      if (editTrade) {
        await updateTrade(payload);
      } else {
        await createTrade(payload);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle =
    "w-full px-3 py-2 rounded-lg text-sm bg-white/[0.03] border border-white/10 text-white focus:border-[#7ed321]/55 focus:outline-none transition-colors";
  const labelStyle = "block text-xs font-medium mb-1.5 text-white/55";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={editTrade ? "Edit Trade" : "New Trade"}
      footer={
        <>
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={submitting || !form.entryPrice || !form.entryTime}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: "#7ed321", color: "#0a0a0a" }}
          >
            {submitting ? "Saving..." : editTrade ? "Update" : "Save Trade"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {err && (
          <div className="text-xs px-3 py-2 rounded-md border border-white/15 bg-white/[0.04] text-white/85">
            {err}
          </div>
        )}

        {/* Row 1: Symbol, Side, Quantity */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelStyle}>Symbol *</label>
            <select
              value={form.symbol}
              onChange={(e) => update("symbol", e.target.value)}
              className={inputStyle}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Side *</label>
            <div className="flex gap-2">
              {(["LONG", "SHORT"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("side", s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    form.side === s ? "scale-[1.02]" : "opacity-50 hover:opacity-80"
                  }`}
                  style={{
                    background:
                      form.side === s
                        ? s === "LONG" ? "#7ed321" : "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    color: form.side === s ? "#0a0a0a" : "rgba(255,255,255,0.55)",
                    border:
                      form.side === s
                        ? "1px solid transparent"
                        : "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelStyle}>Quantity</label>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
              className={inputStyle}
            />
          </div>
        </div>

        {/* Row 2: Prices */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>Entry Price *</label>
            <input
              type="number"
              step="any"
              value={form.entryPrice}
              onChange={(e) => update("entryPrice", e.target.value)}
              required
              className={inputStyle}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelStyle}>Exit Price</label>
            <input
              type="number"
              step="any"
              value={form.exitPrice}
              onChange={(e) => update("exitPrice", e.target.value)}
              className={inputStyle}
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Row 3: Times */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelStyle}>Entry Time *</label>
            <input
              type="datetime-local"
              value={form.entryTime}
              onChange={(e) => update("entryTime", e.target.value)}
              required
              className={inputStyle}
            />
          </div>
          <div>
            <label className={labelStyle}>Exit Time</label>
            <input
              type="datetime-local"
              value={form.exitTime}
              onChange={(e) => update("exitTime", e.target.value)}
              className={inputStyle}
            />
          </div>
        </div>

        {/* Row 4: Setup, Timeframe, Emotion */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelStyle}>Setup</label>
            <select
              value={form.setup}
              onChange={(e) => update("setup", e.target.value)}
              className={inputStyle}
            >
              <option value="">—</option>
              {SETUPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Timeframe</label>
            <select
              value={form.timeframe}
              onChange={(e) => update("timeframe", e.target.value)}
              className={inputStyle}
            >
              <option value="">—</option>
              {TIMEFRAMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Emotion</label>
            <select
              value={form.emotions}
              onChange={(e) => update("emotions", e.target.value)}
              className={inputStyle}
            >
              <option value="">—</option>
              {EMOTIONS.map((emo) => (
                <option key={emo} value={emo}>{emo}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Rating */}
        <div>
          <label className={labelStyle}>Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => update("rating", form.rating === star ? 0 : star)}
                className="text-xl transition-transform hover:scale-110"
                style={{
                  color:
                    star <= form.rating ? "#a3e635" : "rgba(255, 255, 255, 0.20)",
                }}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className={`${inputStyle} resize-none`}
            placeholder="Context, mistakes, lessons learned…"
          />
        </div>
      </form>
    </Modal>
  );
}
